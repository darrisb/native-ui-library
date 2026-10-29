# Review: 1.12.7.3 — Add Delete Component action to Properties panel

- **Reviewed commit:** 26eecbe172bba988d5a7f787d503c94303de60e4
- **Overall assessment:** pass - The Delete Component action is correctly implemented: a native, accessible button is appended at the bottom of the properties form only when a component instance is selected and a handler is supplied, it routes through the new optional DeleteComponentHandler callback to BuilderState.deleteComponent (no direct canvas DOM manipulation), and the UI refreshes through the existing state subscriptions (deletion clears selection in state, which triggers the shell's refreshPropertiesPanel to render the empty state). All four expected focused tests are present in properties-panel.test.ts and pass with the existing mock-DOM utilities; existing property editing and panel behavior are preserved. Minor gaps concern test coverage of the shell wiring and small accessibility/styling edge cases.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T01:21:56.234Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a1853d7b0a77c419980f5536e2
- **Token usage:** input 66, output 6108, reasoning 0, cache 352702, total —
- **Reported cost:** $0.016684

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. LOW (confirmed) — The app-shell integration (passing onDelete that calls state.deleteComponent) is not covered by any test. No app-shell/__tests__ file exists, so if the onDelete argument in renderAppShell's refreshPropertiesPanel were removed or wired to something else, the focused test suite would still pass. The expected scenario 'Properties panel clears after selected component deletion' is only covered indirectly: the panel-level test proves the button is absent when instance is null, and builder-state-delete.test.ts proves selection is cleared on deletion, but nothing verifies the shell connects the two.

**Evidence:** apps/builder/src/shell/app-shell.ts lines 188-190 add `(instanceId) => { state.deleteComponent(instanceId); }`; grep shows no test file under apps/builder/src/shell/ and the package.json `test` script (apps/builder/package.json line 11) runs only per-module tests. The existing MockElement (properties-panel.test.ts lines 48-124) lacks querySelector/innerHTML support, which is why shell-level testing was not feasible.

**Files:** apps/builder/src/shell/app-shell.ts

**Lines:** 157, 188, 190

**Recommended correction:** Acceptable as-is given the mock-DOM limitations; if cheap, extend the mock utilities or add a small test that calls renderAppShell with a fake state, or at minimum a test asserting the fifth argument of renderPropertiesPanel forwards to state.deleteComponent, to lock in the wiring.

### 2. LOW (uncertain) — When the selected instance's type is unknown to the registry, renderPropertiesPanel returns the 'Unknown component type' message before buildForm runs, so no Delete action is offered for that component. createBuilderState accepts an arbitrary initialDocument without registry validation, so such an instance is reachable via AppShellOptions.initialDocument, and it would then be undeletable through the Properties panel.

**Evidence:** apps/builder/src/properties/properties-panel.ts lines 418-431: the !definition branch appends an empty-state message and returns without the delete button; apps/builder/src/state/builder-state.ts line 153-157: createBuilderState takes initialDocument without validation; app-shell.ts findSelectedInstance (lines 111-120) returns any instance found in the document.

**Files:** apps/builder/src/properties/properties-panel.ts

**Lines:** 418, 431

**Recommended correction:** Optional hardening: render the Delete button (with the instance id) in the unknown-type branch too, so a selected component of an unregistered type can still be removed. Not required by the task instructions, which assume registry-backed selection.

### 3. NOTE (confirmed) — After a successful deletion the button element is destroyed with the panel, so browser focus falls back to <body>, and no aria-live announcement indicates the component was removed. Screen-reader users lose their place in the panel. The task did not require announcement/focus management, so this is a polish item rather than a defect.

**Evidence:** apps/builder/src/properties/properties-panel.ts lines 349-362 build the button inside buildForm; app-shell.ts lines 160-168 rebuild the panel as empty state on the selection notification, discarding the focused button. The empty-state element (createEmptyState, lines 27-32) is a plain <p> without aria-live.

**Files:** apps/builder/src/properties/properties-panel.ts, apps/builder/src/shell/app-shell.ts

**Lines:** 30, 161, 358

**Recommended correction:** In a future task, consider giving the empty-state message role="status"/aria-live="polite" or moving focus to the panel heading after deletion.

### 4. NOTE (confirmed) — The delete button styling hardcodes the danger palette (#dc3545, #fef2f2, #ffffff) rather than introducing a shared CSS custom property. This is consistent with the pre-existing .properties-validation-message (also hardcoded #dc3545) and .properties-control (#ffffff), but a --danger token in :root would keep destructive styling consistent if more delete affordances appear.

**Evidence:** apps/builder/src/properties/properties-panel.css lines 82-102 vs. existing lines 64-68 and 32-39; theme tokens defined in apps/builder/src/shell/app-shell.css lines 1-11 (--border-color, --focus-ring, etc., no --danger).

**Files:** apps/builder/src/properties/properties-panel.css, apps/builder/src/shell/app-shell.css

**Lines:** 87, 96, 100

**Recommended correction:** Optionally add `--danger: #dc3545` (and a hover tint) to :root in app-shell.css and reference it here and in .properties-validation-message.

### 5. NOTE (confirmed) — The commit includes an update to apps/builder/tsconfig.tsbuildinfo, a generated TypeScript incremental-build cache. It is a pre-existing tracked artifact (modified, not added by this commit), so this is not a regression, but committing build caches adds diff noise to every task.

**Evidence:** Changed-files list: 'M apps/builder/tsconfig.tsbuildinfo'; the diff shows only the single-line JSON cache blob changing.

**Files:** apps/builder/tsconfig.tsbuildinfo

**Lines:** 1

**Recommended correction:** No action for this task; consider untracking tsbuildinfo and adding it to .gitignore in a dedicated housekeeping task (per project rules, do not touch .gitignore here).
