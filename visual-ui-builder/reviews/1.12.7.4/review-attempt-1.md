# Review: 1.12.7.4 — Add focused deletion interaction tests

- **Reviewed commit:** 9b83ae62883c5f35577211354de436740cf29b8f
- **Overall assessment:** pass - The new focused deletion-interaction tests are correct, follow existing test conventions (self-contained mock DOM, self-reporting script, same helpers as builder-canvas.test.ts), faithfully mirror the app-shell wiring, and cover all six expected scenarios (root Card deletion updates canvas, nested Text/Button/Card deletion with parent/sibling/descendant assertions, Properties panel clearing on deletion, and adding components after deletion) without duplicating the prior microtasks' unit coverage. A static simulation of every test against builder-state.ts, builder-document.ts, properties-panel.ts, builder-canvas.ts, and the renderer/components packages indicates the tests should pass under `node --experimental-strip-types`. Minor gaps: the test is not registered in the package test script, one unused harness accessor, and selection is driven through state rather than a simulated canvas click.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T01:42:09.916Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a1854aafb58e4cdcedfed38473
- **Token usage:** input 132, output 26380, reasoning 0, cache 1515294, total —
- **Reported cost:** $0.056414

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — The new focused test file is not registered in the builder package's test script, so `npm test` (the existing convention for executing focused tests) never runs it. Every test listed in the script is enumerated explicitly; the new file was added without updating that enumeration. Note: the prior deletion microtasks' test files (builder-state-delete.test.ts, remove-component.test.ts) share this same omission, so the entire deletion-workflow suite currently runs only if invoked ad hoc.

**Evidence:** apps/builder/package.json line 11 lists `src/canvas/__tests__/builder-canvas.test.ts` and all other focused tests but not `src/canvas/__tests__/deletion-interaction.test.ts` (nor `src/state/__tests__/builder-state-delete.test.ts` / `src/state/__tests__/remove-component.test.ts`). The commit diff (9b83ae6) contains no package.json change.

**Files:** apps/builder/package.json, apps/builder/src/canvas/__tests__/deletion-interaction.test.ts

**Lines:** 11

**Recommended correction:** Add `&& node --experimental-strip-types src/canvas/__tests__/deletion-interaction.test.ts` to the `test` script in apps/builder/package.json (and consider registering the other deletion test files from tasks 1.12.7.1–1.12.7.3) so the deletion workflow is covered by the automated focused-test run.

### 2. LOW (confirmed) — No verification command was configured or executed for this task, so the new tests have no recorded passing run. A detailed static simulation of all eight tests against the production code paths and mock DOM indicates they should pass (all fixtures, ids, class names, event wiring, and assertion expectations match the implementation), but this is unconfirmed by execution.

**Evidence:** Verification section: 'no verification commands were configured for this task'. Only test file + tsconfig.tsbuildinfo changed. Cross-checked test assumptions: fixture ids in apps/builder/src/fixtures/nested-document.ts, empty-state text 'Drop components here to start building.' in builder-canvas.ts:80, delete-button class 'properties-delete-button' in properties-panel.ts:356, and selection-clearing logic in builder-state.ts:310-316 all match the assertions.

**Files:** apps/builder/src/canvas/__tests__/deletion-interaction.test.ts

**Lines:** 1, 736

**Recommended correction:** Have the orchestrator execute `node --experimental-strip-types apps/builder/src/canvas/__tests__/deletion-interaction.test.ts` (and the related deletion tests) as the verification step for this commit before advancing.

### 3. NOTE (confirmed) — The harness exposes `getPropertiesApi` in its returned object, but no test uses it — dead harness surface.

**Evidence:** apps/builder/src/canvas/__tests__/deletion-interaction.test.ts line 405: `getPropertiesApi: () => propertiesApi,`; grep shows no reference to `getPropertiesApi` inside any test.

**Files:** apps/builder/src/canvas/__tests__/deletion-interaction.test.ts

**Lines:** 405

**Recommended correction:** Remove the unused `getPropertiesApi` accessor, or use it in the Properties-panel-clearing test to assert `propertiesApi.instanceId === null` directly.

### 4. NOTE (confirmed) — Selection is driven by calling `state.selectInstance(id)` directly instead of dispatching a click on the rendered canvas element, so the full chain 'canvas click → selection → panel renders delete button → deletion' is only partially simulated. The canvas-click selection path is already unit-tested in builder-canvas.test.ts (e.g., 'Selecting nested Text'), so coverage of the deletion workflow itself is not impaired; the helper's doc comment explicitly acknowledges this.

**Evidence:** apps/builder/src/canvas/__tests__/deletion-interaction.test.ts lines 409-415: `selectInstance` helper comment 'mirrors clicking it on the canvas'; deletion itself does go through the real Properties panel button (lines 421-430), satisfying the task requirement 'deleting ... through the Properties panel'.

**Files:** apps/builder/src/canvas/__tests__/deletion-interaction.test.ts

**Lines:** 409, 415

**Recommended correction:** Optionally, add one test that fires the boundary click event (as builder-canvas.test.ts does with composedPath) to select an instance before deleting via the panel, completing the end-to-end interaction chain.

### 5. NOTE (confirmed) — The file re-implements ~200 lines of mock DOM (MockElement, MockStyle, MockClassList, installMockDom, findElementById, getCard helpers) that duplicate builder-canvas.test.ts, and findDeleteButton duplicates properties-panel.test.ts. This follows the established self-contained-test-file convention in this repo, so it is not a defect, but it is a growing maintenance cost if production DOM APIs change.

**Evidence:** Compare apps/builder/src/canvas/__tests__/deletion-interaction.test.ts lines 42-208 with apps/builder/src/canvas/__tests__/builder-canvas.test.ts lines 36-173 (near-identical mocks); findDeleteButton also appears in apps/builder/src/properties/__tests__/properties-panel.test.ts line 755.

**Files:** apps/builder/src/canvas/__tests__/deletion-interaction.test.ts, apps/builder/src/canvas/__tests__/builder-canvas.test.ts

**Lines:** 42, 208

**Recommended correction:** No change required for this task (repo convention mandates self-contained test files); consider a future dedicated task to extract a shared test-harness module if mock drift becomes a problem.
