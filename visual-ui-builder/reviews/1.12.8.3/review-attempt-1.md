# Review: 1.12.8.3 — Add Undo and Redo toolbar buttons

- **Reviewed commit:** a103419821b6dfd24890705bc50633f574b9f3f5
- **Overall assessment:** conditional - The toolbar implementation in app-shell.ts correctly satisfies the functional requirements (native Undo/Redo buttons wired to BuilderState.undo()/redo(), disabled via canUndo()/canRedo(), refreshed through state.subscribe, accessible labels, no icon library, no keyboard shortcuts). However, the focused tests are not actually runnable through the project's existing test infrastructure: the CSS/`.js`-to-`.ts` resolution hook is never registered and the new test was never added to the package test script.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T02:40:05.219Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a185820826710018cd7d3b8af0
- **Token usage:** input 192, output 15006, reasoning 0, cache 952278, total —
- **Reported cost:** $0.031529

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. HIGH (likely) — The focused test cannot execute with the project's existing test runner. apps/builder/src/shell/app-shell.ts starts with side-effect CSS imports (`import "./app-shell.css"` etc.) and uses `.js`-extension relative specifiers (`../palette/component-palette.js`, `../state/builder-state.js`, ...) that only exist as `.ts` files. Node's `--experimental-strip-types` (the convention used by every other test in apps/builder/package.json) fails on both: ERR_UNKNOWN_FILE_EXTENSION for `.css` and ERR_MODULE_NOT_FOUND for the `.js` specifiers. The provided workaround (css-loader-hook.ts, which registers css-resolver.mjs) is dead code: nothing in the repository imports or references it (grep for 'css-loader-hook' matches only its own file), and app-shell-toolbar.test.ts goes straight from installMockDom() (line 207) to `await import("../app-shell.ts")` (line 216) without registering the hook. The module-level dynamic import will therefore throw before any `test(...)` runs.

**Evidence:** apps/builder/src/shell/app-shell.ts:1-21 (`.css` and `.js` specifiers); apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts:207-216 (no hook import before `await import("../app-shell.ts")`); apps/builder/src/shell/__tests__/css-loader-hook.ts:6 (register(...) never invoked by any consumer); repo-wide grep for 'css-loader-hook|css-resolver' matches only the hook file itself.

**Files:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts, apps/builder/src/shell/__tests__/css-loader-hook.ts, apps/builder/src/shell/app-shell.ts

**Lines:** 207, 216

**Recommended correction:** Register the resolver before importing the shell, e.g. add `await import("./css-loader-hook.ts");` above line 209 in app-shell-toolbar.test.ts, or run the test as `node --experimental-strip-types --import ./src/shell/__tests__/css-loader-hook.ts src/shell/__tests__/app-shell-toolbar.test.ts` and document that command. Then verify the test file actually executes and reports 7/7 passing.

### 2. MEDIUM (confirmed) — The new test is not wired into the existing test infrastructure. apps/builder/package.json's `test` script chains every other focused test via `node --experimental-strip-types <file>`, but `src/shell/__tests__/app-shell-toolbar.test.ts` was not added to that chain, so neither `npm test` nor the orchestrator's focused-test run will execute it (this commit's verification record shows "no verification commands were configured"). The task explicitly asked to use the existing test infrastructure and to run the tests created for the task.

**Evidence:** apps/builder/package.json:11 — the `test` script lists drag-drop, palette, state, factories, canvas, properties and registry tests, but no shell test; changed-files.txt shows only the three new __tests__ files plus app-shell.ts and tsconfig.tsbuildinfo (no package.json modification).

**Files:** apps/builder/package.json, apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts

**Lines:** 11

**Recommended correction:** Append `&& node --experimental-strip-types --import src/shell/__tests__/css-loader-hook.ts src/shell/__tests__/app-shell-toolbar.test.ts` to the builder `test` script (or import the hook from the test itself) so the new tests run and regressions are caught.

### 3. MEDIUM (confirmed) — Two expected tests do not verify what their names claim. "Clicking Undo restores the previous document" and "Clicking Redo reapplies the change" only assert the buttons' `disabled` flags; they never inspect the restored document (e.g. `state.getDocument().rootInstances.length` returning to 0 after undo and back to 1 after redo, or the canvas children). The `disabled` assertions are derivable purely from the history counters and would pass even if the document/selection restoration path (restoreFromHistory, canvas re-render, selection clearing) were broken, so the stated expected behavior is only partially covered.

**Evidence:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts:358-414 — the tests click the palette Card button and Undo/Redo buttons but the only assertions are `assertEqual(undoButton.disabled, ...)` / `assertEqual(redoButton.disabled, ...)`. The rendered document is never read back.

**Files:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts

**Lines:** 358, 383

**Recommended correction:** Expose or capture the BuilderState for the assertion (e.g. allow renderAppShell to return its state, or assert on the canvas container's rendered `ui-card` children / empty-state message) and check that the root instance disappears after Undo and reappears after Redo, in addition to the disabled-state checks.

### 4. LOW (confirmed) — Dead/test-noise code in the new test file: `createRegistry()` (lines 227-233) is invoked at module scope (line 282) purely "for future test scenarios" and its return value is discarded, duplicating registry setup that renderAppShell already performs; line 231 is also mis-indented (one leading space instead of two). This adds side effects (extra registerSampleDefinitions/registerNativeComponents calls) unrelated to any assertion.

**Evidence:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts:227-233 and 280-282 ("Registry is created by renderAppShell internally; this helper is kept for future test scenarios...").

**Files:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts

**Lines:** 227, 282

**Recommended correction:** Remove the unused `createRegistry` helper and its module-level invocation (or fix the indentation on line 231 if it is kept); keep the test file limited to the helpers actually exercised.

### 5. NOTE (confirmed) — Minor maintainability observations in app-shell.ts: (a) createToolbar registers its own `state.subscribe(updateUndoRedoState)` and discards the returned unsubscribe function, creating a second subscription channel alongside renderAppShell's canvas/properties subscriptions — harmless today because each renderAppShell call builds a fresh BuilderState, but it silently couples toolbar lifecycle to the state; (b) the Undo/Redo buttons are appended after the permanently-disabled Preview/Save/Export placeholders, so the only functional toolbar actions sit at the far right of the group.

**Evidence:** apps/builder/src/shell/app-shell.ts:75-80 (`state.subscribe(updateUndoRedoState);` return value ignored) and 41-73 (placeholder buttons appended before undoButton/redoButton).

**Files:** apps/builder/src/shell/app-shell.ts

**Lines:** 75, 41

**Recommended correction:** Optionally hoist the Undo/Redo state update into the existing single subscription in renderAppShell (or keep the toolbar subscription but store the teardown with the shell), and place Undo/Redo before the disabled placeholders for visual prominence. No behavioral change required for this task.

### 6. NOTE (confirmed) — Mock DOM divergence worth knowing: MockElement.click() invokes registered click listeners regardless of the `disabled` flag, unlike a real browser. The current tests never click a disabled Undo/Redo button, so this does not affect results, but it means the tests would not catch a regression where a button is left enabled and handlers fire while disabled.

**Evidence:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts:155-159 (`click(): void { for (const listener of this.listeners.get("click") ?? []) ... }` with no `disabled` check).

**Files:** apps/builder/src/shell/__tests__/app-shell-toolbar.test.ts

**Lines:** 155

**Recommended correction:** If the mock is reused later, make `click()` a no-op when `this.disabled === true` to mirror native button semantics.
