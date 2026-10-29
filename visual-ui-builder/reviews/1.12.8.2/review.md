# Review: 1.12.8.2 — Integrate undo and redo into BuilderState

- **Reviewed commit:** bd68c09402ad98f6a6319fedc829b92ded084db2
- **Overall assessment:** pass (conditional) — History is integrated cleanly into BuilderState: every document-changing mutation path (addRootInstance, insertRootInstance, insertChildInstance, moveComponent, deleteComponent, updateInstanceProperties) records a snapshot, rejected/thrown operations record nothing (validation precedes any state change), selection-only changes are not recorded, undo/redo notify each channel exactly once, unavailable undo/redo are no-ops, and selection is kept only when the id still exists in the restored document. No second state system is introduced and no component definitions or renderer code were touched. Two gaps keep this from a clean pass: semantically no-op property updates are still recorded as undo steps (explicit requirement 'do not record ... no-op updates'), and several focused tests that claim to prove 'does not create history' are vacuous because the helper reduces history depth to canUndo()'s boolean. The tests themselves appear to pass by inspection (fixture structure, registry metadata, and validation all match the assertions), but none of them were actually run (no verification commands configured) and the new spec file is not wired into the workspace's only test script.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T02:22:54.545Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a1856f4b3d0a788c74d05f4801
- **Token usage:** input 168, output 18604, reasoning 0, cache 1353747, total —
- **Reported cost:** $0.044118

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — No-op property updates are recorded as undo steps, violating the requirement 'Do not record selection-only changes, rejected operations, or no-op updates'. updateInstanceProperties always allocates a fresh instance object ({ ...target, properties: { ...target.properties, ...patch } }) and therefore a fresh BuilderDocument reference, so recordHistory() never hits the reference-equality short circuit in DocumentHistory.record(). A patch whose values are identical to the current ones (or an empty patch) pushes a history entry, clears the redo stack, and fires a document notification whose undo produces a visually identical document ('dead' undo steps). The reference-equality guard only protects the move/delete paths because those helpers return the original document for no-ops; it does not protect property updates.

**Evidence:** apps/builder/src/state/builder-state.ts:415-440 (new-instance allocation, then `document = nextDocument; recordHistory(nextDocument); notifyDocument();` with no change check) and :201-209 ('The history module ignores identical references, so this is safe to call after every mutation'); apps/builder/src/state/document-history.ts:80-92 (record() only short-circuits on `document === this.present`). Contrast the working no-op guards at builder-state.ts:363-378 (moveComponent) and :380-400 (deleteComponent), which rely on moveComponentById/removeComponentById returning the same reference (builder-document.ts:358-363, :428-430).

**Files:** apps/builder/src/state/builder-state.ts, apps/builder/src/state/document-history.ts

**Lines:** 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 436, 437, 438, 439, 207, 208

**Recommended correction:** Before calling updateComponentById, compare the merged values against target.properties and return early when nothing changes (e.g. every key in `patch` already equals the current value), or return `target` itself from the update callback so updateComponentById preserves the reference and no history entry or notification is emitted. Add a focused test such as 'Re-applying the same property value does not create history' using createBuilderState(nested doc) so canUndo() is false beforehand, then assert canUndo() stays false.

### 2. MEDIUM (confirmed) — Three of the required focused tests are non-discriminating: 'Selection-only changes do not create additional history', 'Rejected insertion does not add a new history entry' and 'Rejected property update does not add a new history entry'. They compare getUndoCounts() before/after, but that helper returns only `state.canUndo() ? 1 : 0`. In all three tests the state already contains one recorded mutation, so canUndo() is true both before and after; the assertion can never fail even if selection changes or rejected operations did create history. Consequently the requirements 'Do not record selection changes' and 'Do not record rejected ... mutations' are not actually verified by this suite (only the fresh-state cases 'Rejected move', 'No-op move' and 'Unknown id delete' are meaningful).

**Evidence:** apps/builder/src/state/__tests__/builder-state-history.test.ts:617-621 (`return state.canUndo() ? 1 : 0;`), :214-226 (addRootInstance first, so before === after === 1), :243-256, :258-275. Working counter-examples in the same file: :277-289 and :571-586 start from an unmutated state where before === 0.

**Files:** apps/builder/src/state/__tests__/builder-state-history.test.ts

**Lines:** 617, 618, 619, 620, 214, 222, 225, 243, 246, 255, 258, 261, 274

**Recommended correction:** Make these tests discriminating without exposing history depth: start from a state with no recorded mutations — e.g. createBuilderState(createNestedBuilderDocument()) — perform the selection change / rejected operation, and assert state.canUndo() === false (and state.canRedo() === false). Alternatively drive history to its end (undo until canUndo() is false) and assert the number of undo steps needed to reach the initial document is exactly the number of successful mutations.

### 3. MEDIUM (confirmed) — The redo path of 'Invalid restored selections are cleared' is untested, and the test that appears to claim it actually asserts the opposite. 'Redo clears selection when the selected component no longer exists' selects card-1 (present in both snapshots) and asserts getSelectedInstanceId() === 'card-1', i.e. it verifies selection preservation, not clearing. No test exercises restoreFromHistory() clearing selection during redo.

**Evidence:** apps/builder/src/state/__tests__/builder-state-history.test.ts:497-512 (name says 'clears', assertion at :511 expects 'card-1' preserved; selection is never invalid in the redo target). Implementation path that is untested: apps/builder/src/state/builder-state.ts:232-238.

**Files:** apps/builder/src/state/__tests__/builder-state-history.test.ts

**Lines:** 497, 498, 499, 500, 501, 502, 503, 506, 509, 511

**Recommended correction:** Add a genuine redo-clears-selection test: state = createBuilderState(document with a and b); deleteComponent('b'); undo(); selectInstance('b'); redo() — the restored document lacks 'b', so assert getSelectedInstanceId() === null and that selection subscribers were notified once. Rename the existing test to reflect what it checks ('Redo preserves selection that still exists') or convert it into the new case.

### 4. LOW (confirmed) — Misleading/duplicative test names reduce the suite's value as documentation. 'Undo preserves selection when the selected component still exists' asserts that selection was cleared (getSelectedInstanceId() === null) and is an exact duplicate of 'Undo clears selection when the selected component no longer exists'.

**Evidence:** apps/builder/src/state/__tests__/builder-state-history.test.ts:429-439 (title vs assertion at :438) and the duplicate at :452-460.

**Files:** apps/builder/src/state/__tests__/builder-state-history.test.ts

**Lines:** 429, 430, 431, 432, 433, 436, 438, 452

**Recommended correction:** Rename the first test to 'Undo clears selection when the undone insertion removed the selected component', or repurpose it into a distinct case (e.g. selection inside a restored subtree) so each listed requirement maps to exactly one correctly named test.

### 5. LOW (confirmed) — The new focused spec is not registered in the workspace's only test entry point, so the task's tests will not run via the documented command. apps/builder/package.json 'test' chains individual node --experimental-strip-types invocations and lists src/state/__tests__/builder-state.test.ts only; builder-state-history.test.ts is absent, and no verification command was configured for this task, so nothing in CI/orchestrator runs it. (Same omission already exists for builder-state-delete.test.ts, remove-component.test.ts and document-history.test.ts, so this is a recurring gap rather than a new regression.)

**Evidence:** apps/builder/package.json:11 (test script enumerates spec files; ends with registry/__tests__/builder-registry.test.ts); apps/builder/src/state/__tests__/ contains builder-state.test.ts, builder-state-delete.test.ts, builder-state-history.test.ts, document-history.test.ts, remove-component.test.ts. Root package.json:11-18 defines no builder test target.

**Files:** apps/builder/package.json, apps/builder/src/state/__tests__/builder-state-history.test.ts

**Lines:** 11

**Recommended correction:** Append `&& node --experimental-strip-types src/state/__tests__/builder-state-history.test.ts` to the builder 'test' script (ideally together with the other currently unregistered state specs) and run it once to record actual pass/fail output for this task; the orchestrator reported no verification commands were run.

### 6. LOW (likely) — Integration consequence of recording every mutation without a transaction boundary: the properties panel fires onChange on every 'input' event, so each keystroke in a text/color/number field becomes its own undo entry. Combined with MAX_PAST_HISTORY = 50, ordinary typing quickly evicts structural history (insertions, moves, deletions) and reduces them to per-character undo, which weakens the value of the feature being integrated. Not a stated requirement of this microtask, but it is a direct consequence of the wiring and worth an explicit follow-up.

**Evidence:** apps/builder/src/properties/properties-panel.ts:294-311 (input listeners) and :276 (`onChange(instanceId, { [property.name]: result.value })`) with apps/builder/src/shell/app-shell.ts:181-187 (panel callback calls state.updateInstanceProperties); apps/builder/src/state/document-history.ts:4 (`MAX_PAST_HISTORY = 50`) and :86-89 (oldest snapshots dropped).

**Files:** apps/builder/src/state/document-history.ts, apps/builder/src/state/builder-state.ts

**Lines:** 4, 86, 87, 88, 89

**Recommended correction:** Track this as a follow-up task (coalescing consecutive property updates for the same id/property into one history entry, or an explicit begin/end transaction or record(label) hook on BuilderState) rather than expanding this microtask; at minimum document the per-keystroke granularity next to recordHistory().

### 7. NOTE (confirmed) — Minor maintainability/style points in the integrated code: restoreFromHistory is typed as `nextHistory: typeof history` instead of importing the exported DocumentHistory type, which hides the dependency on document-history.ts's public contract; and the generated build artifact apps/builder/tsconfig.tsbuildinfo is committed alongside the change (it is not covered by .gitignore), producing large unrelated diff churn on every typecheck.

**Evidence:** apps/builder/src/state/builder-state.ts:219-221 (`function restoreFromHistory(nextHistory: typeof history)` vs `export interface DocumentHistory` at apps/builder/src/state/document-history.ts:13); changed-files list shows `M apps/builder/tsconfig.tsbuildinfo`; .gitignore lines 1-8 contain no tsbuildinfo entry.

**Files:** apps/builder/src/state/builder-state.ts, apps/builder/tsconfig.tsbuildinfo

**Lines:** 219, 220, 221

**Recommended correction:** Import the type explicitly (`import { createDocumentHistory, type DocumentHistory } from "./document-history.ts";`) and use `nextHistory: DocumentHistory`. Separately, consider letting the orchestrator add `*.tsbuildinfo` to .gitignore and untrack the artifact (out of scope for this microtask, so do not change it here).

### 8. NOTE (confirmed) — Re-verified correctness checks that passed, recorded for completeness: rejected operations cannot leak partial state or history because all validation (type/parent/index/duplicate-id/schema) happens before any assignment, and moveComponentById performs its own checks before returning a new document, so history.record() is never reached on throw paths (builder-state.ts:259-332, 334-378; builder-document.ts:381-455). Notification invariants hold: history.present is kept reference-equal to `document` after every mutation and every restore, so the `nextHistory.present === document` guard at builder-state.ts:222 correctly suppresses notifications for unavailable undo/redo, and the test expectations against the nested fixture (root-card children text-1/button-1/nested-card, text-1.content 'Nested text content') match apps/builder/src/fixtures/nested-document.ts:18-73 and the card/text/button metadata in packages/core/src/definitions/sample-definitions.ts, which also confirm the invalid-padding rejection at test line 258 fires validateProperties' number check (packages/components/src/validation/validate-instance.ts:56-62). No BuilderState mock/implementer exists that the four new interface members could break (only type-position uses at shell/app-shell.ts:112 and drag-drop/insert-dropped-component.ts:20,49), and no component definitions or renderer files were modified.

**Evidence:** apps/builder/src/state/builder-state.ts:201-241, 259-332, 334-400; apps/builder/src/state/document-history.ts:80-114; apps/builder/src/fixtures/nested-document.ts:18-73; packages/core/src/definitions/sample-definitions.ts:4-96; packages/components/src/validation/validate-instance.ts:35-88.

**Files:** apps/builder/src/state/builder-state.ts, apps/builder/src/state/document-history.ts

**Lines:** 222, 232, 240

**Recommended correction:** No change required; listed to document which requirements were positively verified.
