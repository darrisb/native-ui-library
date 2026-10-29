# Review: 1.12.8.5 — Add focused undo and redo workflow tests

- **Reviewed commit:** cb26c403fc3511a7fbaad75fc8415a6d49840a13
- **Overall assessment:** conditional - The new workflow tests are largely correct at runtime and reasonably cover several required undo/redo scenarios, but the file introduces a TypeScript type error (an import of a non-exported member) that breaks `tsc --build` / `npm run typecheck`, and it omits a dedicated 'move component between Cards' workflow test while partially duplicating existing history tests.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T03:12:59.288Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a1859f8c3e10c0de9136f18a27
- **Token usage:** input 168, output 17291, reasoning 0, cache 1147537, total —
- **Reported cost:** $0.039020

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. HIGH (confirmed) — The new test file's `collectAllIds` helper references `ComponentInstance` via a module-qualified type import of `../builder-document.ts`, but `builder-document.ts` only imports `ComponentInstance` as a type from `@visual-ui/core` and never re-exports it. This is an invalid member access (TS2305) and fails the project's typecheck/build. The committed `apps/builder/tsconfig.tsbuildinfo` confirms the breakage: the parent artifact had no `"errors"` key (clean build), while this commit adds `"errors":true`. The failure is masked at runtime because `node --experimental-strip-types` erases type-only references without typechecking, so the test 'passes' while the build is red.

**Evidence:** apps/builder/src/state/__tests__/builder-state-history-workflow.test.ts lines 469-484: `function collectAllIds(document: import("../builder-document.ts").BuilderDocument) ... walk(instances: readonly import("../builder-document.ts").ComponentInstance[])`. apps/builder/src/state/builder-document.ts line 1: `import type { ComponentInstance } from "@visual-ui/core";` and no `export ... ComponentInstance` anywhere in the file (grep of builder-document.ts shows only the import + internal uses). commit.diff/ apps/builder/tsconfig.tsbuildinfo: old line `{"version":"7.0.2","root":...` (no errors) -> new line `{"version":"7.0.2","errors":true,...`; other packages' tsbuildinfo (core/components/renderer) carry no `"errors":true`. tsconfig include `src/**/*` (tests are type-checked); root `typecheck` script = `tsc --build`.

**Files:** apps/builder/src/state/__tests__/builder-state-history-workflow.test.ts, apps/builder/tsconfig.tsbuildinfo

**Lines:** 470, 473

**Recommended correction:** Obtain the type from its real source: add `const { }` is irrelevant; instead change the signature to use `import("@visual-ui/core").ComponentInstance` (or `import type { ComponentInstance } from "@visual-ui/core"` at top-level) and keep `BuilderDocument` from `builder-document.ts`. Then regenerate tsbuildinfo via `tsc --build` to confirm `"errors"` is no longer true.

### 2. MEDIUM (confirmed) — The explicit expected test 'Move component between Cards, undo, then redo' is not delivered as a focused workflow test. The only in-file move occurs inside the 'Undo and redo preserve component IDs' test, which is framed around ID preservation and does not assert that the moved component lands at the correct position within the destination Card after redo (it only checks that the source's child list no longer contains it). Existing `builder-state-history.test.ts` covers only moves between the root and a card, not between two cards.

**Evidence:** builder-state-history-workflow.test.ts lines 428-461: `state.moveComponent("button-1", "nested-card", 1, workflowRegistry)`; after redo it asserts `childIds(state, "root-card") == "text-1,nested-card"` but never asserts `childIds(state, "nested-card")`. The required scenario list also names it separately from the ID-preservation requirement.

**Files:** apps/builder/src/state/__tests__/builder-state-history-workflow.test.ts

**Lines:** 428, 459

**Recommended correction:** Add a dedicated test: move a Text from one Card to a second Card at a known index, undo (verify restored to original parent+index), redo (verify destination parent's `children` contain the component at the expected index), asserting parent placement on both undo and redo.

### 3. MEDIUM (likely) — Several new tests substantially duplicate existing coverage in `builder-state-history.test.ts`, contrary to the 'do not duplicate existing tests' instruction.

**Evidence:** New 'Undo then new edit invalidates redo' (workflow lines 272-326) duplicates 'New mutations after undo clear redo history' and 'New mutation after undo preserves only linear history' (history lines 295-320). New 'Multiple undos and redos in sequence' (workflow lines 332-399) overlaps 'Multiple undo/redo round trips are stable' (history lines 546-565). New 'Change component property, undo, then redo' partially overlaps 'Undo component property update restores original properties' (history lines 147-162).

**Files:** apps/builder/src/state/__tests__/builder-state-history-workflow.test.ts, apps/builder/src/state/__tests__/builder-state-history.test.ts

**Lines:** 272, 332

**Recommended correction:** Trim the redundant scenarios (e.g. the new-edit-invalidates-redo and pure multi round-trip tests) and keep only the workflows that add distinct value (nested child insert/delete/property redo, cross-card move placement), to honor the no-duplication requirement.

### 4. LOW (confirmed) — The new test file is not registered in the builder workspace's `test` script, so `npm test --workspace=@visual-ui/builder` will not execute it. (This mirrors the pre-existing situation where the other history tests are also absent from the script, so it is consistent with the repo's current wiring, but the focused tests are only runnable via a direct `node --experimental-strip-types` invocation.)

**Evidence:** apps/builder/package.json `test` script enumerates specific files and does not include `src/state/__tests__/builder-state-history-workflow.test.ts` (nor `builder-state-history.test.ts`, `document-history.test.ts`, etc.).

**Files:** apps/builder/package.json, apps/builder/src/state/__tests__/builder-state-history-workflow.test.ts

**Lines:** 11

**Recommended correction:** If test discovery is meant to go through the workspace script, append `&& node --experimental-strip-types src/state/__tests__/builder-state-history-workflow.test.ts` to the `test` script (coordinate with the orchestrator since sibling history tests share this gap).
