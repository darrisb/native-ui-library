# Review: 1.12.8.1 — Implement immutable document history

- **Reviewed commit:** 68188c1177d56a54a24d4f3dcf63aa4631f55aa4
- **Overall assessment:** conditional - The document-history module itself is functionally correct and satisfies the stated requirements (immutable past/present/future, undo/redo, redo cleared on new record, reference-equality no-op, 50-snapshot cap, no external deps, no BuilderState/UI changes). However, the new test file introduces a likely `tsc --build` failure (unused helper under noUnusedLocals) and is not registered in the workspace test script, so the focused tests are neither type-clean nor actually executed by `npm test`. A `this`-bound method design also deviates from the repo's closure convention and will be fragile when the next task wires undo/redo into UI handlers.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T02:08:24.454Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a185662a3d53aaaa30779800b0
- **Token usage:** input 84, output 10256, reasoning 0, cache 421258, total —
- **Reported cost:** $0.020052

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (likely) — The new test file declares a helper `assertTrue` that is never used. tsconfig.base.json enables `noUnusedLocals`, and apps/builder/tsconfig.json includes `src/**/*` (which covers `src/state/__tests__/`), so `npm run typecheck` (`tsc --build`) reports TS6133 for this file and fails. Every other test in this repo uses all of its declared helpers, so this is a new break rather than a pre-existing condition.

**Evidence:** apps/builder/src/state/__tests__/document-history.test.ts lines 30-34 define `function assertTrue(...)`; grep over the file shows only the definition and zero call sites (all assertions use `assertEqual`). tsconfig.base.json line 15: `"noUnusedLocals": true`. tsconfig.json line 11 references `./apps/builder`; apps/builder/tsconfig.json line 10: `"include": ["src/**/*"]`. Comparison files apps/builder/src/state/__tests__/builder-state-delete.test.ts and remove-component.test.ts call every helper they define.

**Files:** apps/builder/src/state/__tests__/document-history.test.ts, tsconfig.base.json

**Lines:** 30, 31, 32, 33, 34

**Recommended correction:** Remove the unused `assertTrue` helper from document-history.test.ts (or use it, e.g. `assertTrue(history.present !== second, "...")`). Re-run `npm run typecheck` to confirm the workspace build is green again.

### 2. MEDIUM (confirmed) — The focused test file is not wired into the builder workspace test command, so `npm test` never executes it. Combined with "no verification commands were configured for this task", the eight required tests have effectively never been run, and the task's "run only tests created or modified for this task" step is unverifiable in CI.

**Evidence:** apps/builder/package.json line 11 enumerates each test explicitly with `node --experimental-strip-types ...` and ends with `src/registry/__tests__/builder-registry.test.ts`; `src/state/__tests__/document-history.test.ts` is absent from that list. Root package.json has no generic test runner (no vitest/jest dependency), so the only discovery mechanism is this hand-maintained list.

**Files:** apps/builder/package.json, apps/builder/src/state/__tests__/document-history.test.ts

**Lines:** 11

**Recommended correction:** Append `&& node --experimental-strip-types src/state/__tests__/document-history.test.ts` to the `test` script in apps/builder/package.json and run it once to confirm the module passes. (Note: builder-state-delete.test.ts, remove-component.test.ts and canvas/deletion-interaction.test.ts are missing from the same script, so consider registering them too, but at minimum the new test must run.)

### 3. LOW (likely) — History operations are implemented as object-literal methods that depend on `this`, which is a deviation from the repo's established closure style and makes the value object fragile: detaching a method (a very likely pattern when a later task binds undo/redo to UI buttons, e.g. `button.addEventListener('click', history.undo)` or `const { undo } = history`) throws `TypeError: Cannot read properties of undefined`, and structurally cloning/spreading a history (`{ ...history }`, `structuredClone`, JSON snapshots) silently drops the methods while keeping `past/present/future`, producing a broken object that no test would catch.

**Evidence:** apps/builder/src/state/document-history.ts lines 80-114 use `this.present`, `this.past`, `this.future` and return `this` inside the literal passed as `DocumentHistory`. The existing convention in apps/builder/src/state/builder-state.ts lines 153-185 closes over local variables (`let document`, `function notifyDocument()`) and never references `this`. `DocumentHistory` is also a plain value object (past/present/future are public readonly data), so it invites destructuring and spreading.

**Files:** apps/builder/src/state/document-history.ts, apps/builder/src/state/builder-state.ts

**Lines:** 74, 80, 81, 93, 104

**Recommended correction:** Rewrite `createHistoryObject` to bind state through closure parameters instead of `this`, e.g. `function createHistoryObject(past, present, future): DocumentHistory { return { past, present, future, canUndo: ..., canRedo: ..., record(next) { if (next === present) return history; ... }, ... }; }` with a named local (`const history = { ... }`) or arrow functions, matching builder-state's closure style so methods survive detachment and spreading.

### 4. NOTE (confirmed) — Immutability is enforced only at the type level. `past`, `future` and the document snapshots are not frozen, so `history.past.push(...)` is possible at runtime; likewise `MAX_PAST_HISTORY` is private, so the focused test hard-codes the literal 50 and can silently drift from the implementation.

**Evidence:** apps/builder/src/state/document-history.ts line 4 (`const MAX_PAST_HISTORY = 50;`, not exported) and lines 74-77 which return a plain object with fresh but unfrozen arrays. document-history.test.ts asserts `assertEqual(history.past.length, 50)` with a duplicated magic number.

**Files:** apps/builder/src/state/document-history.ts, apps/builder/src/state/__tests__/document-history.test.ts

**Lines:** 4, 74, 75, 76

**Recommended correction:** Optionally `Object.freeze` the returned arrays/object (or use `as const` copies) and export `MAX_PAST_HISTORY` so the test can import the cap instead of hard-coding 50. Not blocking: the rest of the repo (builder-document.ts) uses the same type-level-only convention.

### 5. NOTE (confirmed) — The 50-snapshot cap is applied only in `record`, not in `redo`. This is safe today because `record` clears `future` and `undo` moves one entry from `past` to `future`, so `past.length + future.length <= 50` holds after every operation and `redo` can never exceed the cap; however this invariant is neither documented nor covered by a test, so a future change (e.g. a `jump-to-index` or `merge` operation) could break the memory bound undetected. The existing cap test also does not assert which snapshots were retained (it only checks `past.length === 50` and the present id).

**Evidence:** apps/builder/src/state/document-history.ts lines 85-91 cap only inside `record`; lines 104-113 (`redo`) push `this.present` into `newPast` unconditionally. Test "History retains at most 50 past snapshots" (document-history.test.ts, ~lines 150-162) performs record-only operations, no undo/redo interleaving.

**Files:** apps/builder/src/state/document-history.ts, apps/builder/src/state/__tests__/document-history.test.ts

**Lines:** 104, 105, 110, 113

**Recommended correction:** Add a short comment documenting the `past.length + future.length <= MAX_PAST_HISTORY` invariant, and extend the cap test to assert the retained window (e.g. `documentIds` of `history.past[0]` is `doc-9`) plus an undo/redo-after-cap case, or defensively re-cap in `redo` as well.
