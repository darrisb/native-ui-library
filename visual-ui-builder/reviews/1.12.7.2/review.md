# Review: 1.12.7.2 — Integrate component deletion into BuilderState

- **Reviewed commit:** bd25a1500e6d5c8ab9f559f7936ca2887f061405
- **Overall assessment:** pass - deleteComponent is correctly integrated into BuilderState: it reuses the existing removeComponentById document helper, mutates state only on a real removal, clears selection when the selected id is no longer present in the new document (covering both the deleted node and any deleted ancestor), preserves unrelated selection, and notifies document subscribers exactly once (selection subscribers only when selection actually changed, and never on rejection). No UI files were touched and no other state-management system was introduced. Focused tests exist for every listed scenario and match the repo's existing hand-rolled harness conventions. The main gaps are test-harness wiring (the new test file is not registered in the package `test` script, so `npm test` never runs it) and one missing combined notification-count assertion.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T01:17:19.061Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a18538a45ea06fe56d58251c02
- **Token usage:** input 66, output 9000, reasoning 0, cache 403496, total —
- **Reported cost:** $0.022024

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — The new focused test file is not registered in the builder workspace's aggregated `test` script, so `npm test` never executes it. The script enumerates individual test files explicitly; `apps/builder/src/state/__tests__/builder-state-delete.test.ts` is absent (as is the sibling `remove-component.test.ts` from task 1.12.7.1), meaning regressions in deleteComponent will not be caught by the automated suite and the newly added tests silently rot.

**Evidence:** apps/builder/package.json line 11 lists nine test files (drag-payload, drop-position, component-palette x2, state/builder-state, component-instance-factory, builder-canvas, properties-panel, builder-registry) with no entry for builder-state-delete.test.ts or remove-component.test.ts, while the new file exists at apps/builder/src/state/__tests__/builder-state-delete.test.ts.

**Files:** apps/builder/package.json, apps/builder/src/state/__tests__/builder-state-delete.test.ts

**Lines:** 11

**Recommended correction:** Append ` && node --experimental-strip-types src/state/__tests__/builder-state-delete.test.ts` (and, if desired, the same for src/state/__tests__/remove-component.test.ts) to the `test` script in apps/builder/package.json so the focused tests actually run.

### 2. LOW (confirmed) — Notification-count coverage has a gap: the document-subscriber count is only asserted on a path where selection is not cleared, and the selection-subscriber count is only asserted without also checking the document count. No test asserts that the `notifySelection()` branch of deleteComponent still results in exactly one document notification (i.e. documentCalls === 1 and selectionCalls === 1 in the same run).

**Evidence:** builder-state-delete.test.ts lines 197-205 ("Successful deletion notifies document subscribers exactly once" subscribes only to `subscribe` with no selection) and lines 207-215 ("...notifies selection subscribers exactly once" subscribes only to `subscribeToSelection`). The combined pattern used elsewhere — builder-state.test.ts lines 559-572 subscribes to both and asserts both counts — is not replicated for deletion.

**Files:** apps/builder/src/state/__tests__/builder-state-delete.test.ts

**Lines:** 197, 207

**Recommended correction:** Add one test that selects an instance, subscribes to both `subscribe` and `subscribeToSelection`, deletes that instance, and asserts documentCalls === 1 and selectionCalls === 1 (and a variant asserting selectionCalls === 0 together with documentCalls === 1 when selection is preserved).

### 3. NOTE (confirmed) — API-consistency observation: `deleteComponent` silently no-ops for an unknown id (returns void), while the sibling state operations `moveComponent` (builder-state.ts lines 264-267) and `updateInstanceProperties` (lines 339-342) throw on unknown ids. This is exactly what the task requires ("Do not notify on rejected deletion"), but callers/UI cannot distinguish success from rejection or surface an error message later.

**Evidence:** apps/builder/src/state/builder-state.ts lines 300-306: `const afterDocument = removeComponentById(document, componentId); if (afterDocument === beforeDocument) { return; }` versus lines 264-266 `if (!instance) { throw new Error(...) }` in moveComponent.

**Files:** apps/builder/src/state/builder-state.ts

**Lines:** 300, 304

**Recommended correction:** No change needed for this task; if a future UI task needs to report failed deletions, consider returning `boolean` from deleteComponent (or throwing) rather than adding a second lookup path.

### 4. NOTE (uncertain) — Selection clearing is detected by re-searching the *post-deletion* document (`findComponentById(document, selectedInstanceId) === undefined`). This is correct for well-formed documents, but document id uniqueness is not enforced everywhere: `addRootInstance` (builder-state.ts lines 182-185) performs no duplicate-id check, unlike insertRootInstance/insertChildInstance. With duplicate ids, deleting one instance could leave the selection id resolving to a different, still-existing instance, so selection would be preserved while pointing at a different component.

**Evidence:** apps/builder/src/state/builder-state.ts lines 182-185 (`addRootInstance` appends without `findComponentById` uniqueness validation) versus lines 211-213 and 250-252 (insert paths do validate); deleteComponent relies on the lookup at lines 310-313.

**Files:** apps/builder/src/state/builder-state.ts

**Lines:** 182, 310

**Recommended correction:** Optional hardening: clear selection by comparing against the removed subtree instead of a post-deletion lookup (e.g. locate `selectedInstanceId` inside the instance returned by the document helper, or use the existing `isDescendantOf` semantics) — only if duplicate ids can actually reach state; otherwise leave as-is and enforce id uniqueness in addRootInstance.

### 5. LOW (confirmed) — Minor convention inconsistency: the declaration order of `deleteComponent` in the `BuilderState` interface (after `moveComponent`, before `updateInstanceProperties`, i.e. after `selectInstance`) does not match the implementation order in `createBuilderState` (deleteComponent is emitted before `selectInstance`). Not a defect, but it makes the file harder to scan against its interface.

**Evidence:** apps/builder/src/state/builder-state.ts: interface members `selectInstance` (line 85), `moveComponent` (line 104), `deleteComponent` (line 122); implementation members `moveComponent` (line 258), `deleteComponent` (line 300), `selectInstance` (line 321).

**Files:** apps/builder/src/state/builder-state.ts

**Lines:** 122, 300, 321

**Recommended correction:** Either move the `deleteComponent` declaration in the interface to sit next to `selectInstance`, or move the implementation after `selectInstance`, so interface and implementation orders agree.
