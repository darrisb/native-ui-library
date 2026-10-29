# Review: 1.12.8.4 — Implement undo and redo keyboard shortcuts

- **Reviewed commit:** 2d4a926f36c83f4407f3d537c7a1aac17fd8a373
- **Overall assessment:** conditional — The production shortcut logic in apps/builder/src/shell/app-shell.ts is largely correct (Ctrl/Cmd+Z undo, Ctrl+Y and Ctrl/Cmd+Shift+Z redo, composedPath-based editable detection, availability guards, preventDefault only when handled, cleanup via AppShellApi.destroy()). However, the two most safety-critical requirements (native editing preservation and Shadow DOM handling) are covered only by tests that cannot fail, the 'avoid duplicate listeners' requirement is not actually wired into the application entry point, and the new test file is not runnable through any configured command. Recommend fixing the test fidelity and listener lifecycle before accepting.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T03:02:13.128Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a18593e6f8c9fc9603221dd2c1
- **Token usage:** input 156, output 25257, reasoning 0, cache 1283170, total —
- **Reported cost:** $0.048186

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — The four focused tests that are supposed to verify 'Native text editing shortcuts remain unaffected' and 'Shadow DOM editable controls are respected' are vacuous (false positives): they never create any undo history, so handleUndoRedoShortcut() returns false at the state.canUndo() guard before the editable-control check is ever reached. The assertions (assertFalse(event.defaultPrevented)) pass even if keyboardEventTargetsEditableControl() is deleted entirely.

**Evidence:** apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts lines 476-497, 499-520, 522-544, 546-571: unlike the other tests (cardButton.click() at lines 362, 388, 421, 450, 609), none of these tests invokes the palette button, so the freshly created state created inside renderAppShell has history.past === [] and canUndo() === false (apps/builder/src/state/document-history.ts:78). apps/builder/src/shell/app-shell.ts:175-181 returns false on !state.canUndo() before the undo call, and the editable check at line 171 is only reachable when history exists.

**Files:** apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts, apps/builder/src/shell/app-shell.ts

**Lines:** 476, 499, 522, 546, 171

**Recommended correction:** In each editable-control test, first perform a mutation that enables undo (e.g. findPaletteCardButton(container)!.click() and assert undoButton.disabled === false), then dispatch Ctrl+Z targeting the editable element, and assert both that the event was NOT prevented and that the undo button is still enabled. This makes the tests sensitive to removal of the editable guard.

### 2. MEDIUM (confirmed) — The test mock DOM cannot exercise the editable-control guard at all: mock document.createElement() returns a plain MockElement, while the global HTMLElement is set to the MockHTMLElement subclass, so every mock element fails the `instanceof HTMLElement` check in isEditableTarget(). Additionally MockElement models `nodeName` but not `tagName`, so even a correctly-typed mock element would make `element.tagName.toLowerCase()` throw. The Shadow DOM path (`host.shadowRoot`) is likewise a plain MockElement. Requirement 'Account for Shadow DOM event paths' and 'Preserve native editing shortcuts in form controls' are therefore verified by neither unit nor integration coverage.

**Evidence:** app-shell-keyboard-shortcuts.test.ts:166-169 (`createElement(...) { return new MockElement(tagName); }`) vs. :201-202 (`class MockHTMLElement extends MockElement {}; globals.HTMLElement = MockHTMLElement;`); MockElement declares `nodeName` (line 73) and no `tagName`. app-shell.ts:103 (`const tag = element.tagName.toLowerCase();`) and :133 (`target instanceof HTMLElement && isEditableTarget(target)`). Contrast with app-shell-toolbar.test.ts:201-202 which does return `new MockHTMLElement(tagName)`.

**Files:** apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts, apps/builder/src/shell/app-shell.ts

**Lines:** 166, 201, 73, 103, 133

**Recommended correction:** Make MockDocument.createElement return MockHTMLElement instances, add a `get tagName()` accessor to MockElement (returning this.nodeName.toUpperCase()), and give the mock input/textarea/contenteditable elements real editability so the composedPath branch in app-shell.ts:124-139 is actually executed.

### 3. MEDIUM (confirmed) — 'Avoid duplicate event listeners during shell rerendering' is only satisfied by convention and is not enforced anywhere. renderAppShell() unconditionally registers a new document keydown handler each time it is called and never detaches a previously registered handler; cleanup depends entirely on the caller invoking the returned AppShellApi.destroy(), but the only production call site discards the return value. A second renderAppShell() on the same container (the function even performs container.innerHTML = "", i.e. it is designed to be re-invoked) would stack handlers whose stale closures keep the previous BuilderState alive, so one Ctrl+Z could mutate/undo two different documents and preventDefault the event.

**Evidence:** apps/builder/src/shell/app-shell.ts:278 (container.innerHTML = ""), :413-420 (addEventListener + destroy only detaching), apps/builder/src/main.ts:17 (`renderAppShell(app, { initialDocument });` return value ignored). The pre-existing toolbar tests also ignore the API (app-shell-toolbar.test.ts:303, 316, 329, 351, 377, 402, 435 call renderAppShell without ever calling destroy), which leaks a listener per test.

**Files:** apps/builder/src/shell/app-shell.ts, apps/builder/src/main.ts

**Lines:** 413, 414, 416, 17

**Recommended correction:** Either make the listener installation idempotent (e.g. keep a WeakMap<HTMLElement, AppShellApi> or detach any prior handler registered for that container before adding a new one), or store the API in main.ts (`const shell = renderAppShell(...)`) and destroy it on teardown/rerender. Update the toolbar tests to keep and destroy the returned API.

### 4. MEDIUM (confirmed) — The focused test file is not runnable through any configured command and its required loader hook is undocumented. app-shell.ts imports CSS ("./app-shell.css"), which Node's --experimental-strip-types cannot resolve without the existing css-loader-hook/css-resolver; the new test neither imports nor references that hook, and apps/builder/package.json's `test` script was not extended. Consequently nothing verifies the new tests actually pass (the review notes no verification commands were configured), and running the file the obvious way fails at import time for every test.

**Evidence:** apps/builder/src/shell/app-shell.ts:1-4 (four CSS imports); apps/builder/src/shell/__tests__/css-loader-hook.ts:4-6 (register("./css-resolver.mjs", ...)) — grep shows no other file references css-loader-hook; apps/builder/package.json:11 lists nine test files, neither shell test included; the new test file contains no run instructions.

**Files:** apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts, apps/builder/package.json

**Lines:** 1, 11

**Recommended correction:** Add the shell tests to a runnable script (e.g. `"test:shell": "node --experimental-strip-types --import ./src/shell/__tests__/css-loader-hook.ts src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts"` or register the hook via `--import` inside the test), document the exact command in a header comment, and execute it as the focused test run.

### 5. LOW (confirmed) — The modifier matching is broader than the task specifies, which can consume OS/browser shortcuts the task did not ask the builder to own: Meta+Z / Meta+Shift+Z is treated as a builder shortcut on every platform (not only macOS), and Alt is never excluded, so Ctrl+Alt+Z, Cmd+Option+Z or Ctrl+Shift+Y are intercepted and preventDefault()ed.

**Evidence:** apps/builder/src/shell/app-shell.ts:159-169 — `const usesPlatformModifier = event.ctrlKey || event.metaKey;` with no platform check and no `event.altKey` guard; `isRedoKey = key === "y" || (key === "z" && event.shiftKey)` also accepts Shift+Ctrl+Y.

**Files:** apps/builder/src/shell/app-shell.ts

**Lines:** 159, 160, 166

**Recommended correction:** Return early when `event.altKey` is true, and gate metaKey handling on macOS (or at least require ctrl XOR meta so that Ctrl+Meta+Z is not consumed), matching the stated per-platform shortcut contract.

### 6. LOW (confirmed) — The handler calls event.stopPropagation() in addition to preventDefault(). The task only requires suppressing browser defaults for handled shortcuts; stopPropagation on the document-level bubble handler silently starves any other document/window keydown listener registered after the shell (future modals, shortcut managers, palette drag/drop key handling), and it is untested (the mock exposes stopPropagationCalled but no test asserts it).

**Evidence:** apps/builder/src/shell/app-shell.ts:199-204 (`event.preventDefault(); event.stopPropagation();`); app-shell-keyboard-shortcuts.test.ts:66 and 250-252 define/track `stopPropagationCalled` but no test in the file reads it.

**Files:** apps/builder/src/shell/app-shell.ts, apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts

**Lines:** 201, 202

**Recommended correction:** Keep preventDefault() and drop stopPropagation() (nothing else in the app listens for keydown — a repo-wide grep found only these two call sites), or justify it in a comment and add a test asserting the intended propagation semantics.

### 7. LOW (confirmed) — AppShellApi.destroy() claims to 'release shell resources' but only removes the keydown listener; all state subscriptions created during the render are abandoned even though BuilderState.subscribe()/subscribeToSelection() return unsubscribe functions, so a destroyed shell's listeners continue to re-render detached canvas/properties DOM as long as anything holds the state.

**Evidence:** apps/builder/src/shell/app-shell.ts:31-34 (doc comment), :86 (`state.subscribe(updateUndoRedoState)`), :403-411 (`state.subscribe(...)`, `state.subscribeToSelection(...)`) — return values are discarded; :416-420 destroy() calls only `detach()`.

**Files:** apps/builder/src/shell/app-shell.ts

**Lines:** 86, 403, 408, 417

**Recommended correction:** Collect the unsubscribe functions returned at lines 86, 403 and 408 (and propertiesApi?.destroy()) into an array and invoke them inside destroy().

### 8. LOW (confirmed) — Incomplete coverage of the expected test 'Unavailable history actions do not consume shortcuts': only the undo half is tested. There is no test that Ctrl+Y or Ctrl+Shift+Z/Meta+Shift+Z leaves the event un-prevented when canRedo() is false (e.g. right after a fresh render or after adding a new mutation that clears the redo stack).

**Evidence:** app-shell-keyboard-shortcuts.test.ts:329-347 covers 'Ctrl+Z does not fire when nothing to undo'; no equivalent test dispatches 'y' or Shift+'z' on a shell with an empty future stack (app-shell.ts:183-186 is the untested branch).

**Files:** apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts, apps/builder/src/shell/app-shell.ts

**Lines:** 329, 183

**Recommended correction:** Add tests asserting defaultPrevented === false for Ctrl+Y and Ctrl+Shift+Z when nothing is available to redo, plus a test that Meta+Z without Ctrl is ignored on non-macOS intent, and that `event.repeat`/alt-modifier combinations behave as specified.

### 9. NOTE (likely) — Test hygiene/coupling issues in the new suite: (a) api.destroy() is never in a finally block, so any assertion failure leaks a document keydown listener into the shared mock and cascades into the 'destroy removes the keyboard listener' test, which asserts an absolute global count of exactly 1; (b) MockElement auto-creates a shadowRoot for every element, which does not model real DOM and weakens the Shadow DOM assertions; (c) the top-level `createRegistry();` call (line 280) discards its result and duplicates the native registration renderAppShell already performs — it exists only so the helper is not reported unused under noUnusedLocals.

**Evidence:** app-shell-keyboard-shortcuts.test.ts:280 (`createRegistry();`), :86-91 (constructor always creates shadowRoot), :577-601 (absolute listener-count assertion), :326/346/377 (destroy outside try/finally); apps/builder/src/shell/app-shell.ts:280-281 (registerBuilderNativeComponents inside renderAppShell); apps/builder/tsconfig.base.json:15 ("noUnusedLocals": true).

**Files:** apps/builder/src/shell/__tests__/app-shell-keyboard-shortcuts.test.ts

**Lines:** 280, 577, 86

**Recommended correction:** Wrap each test body in try/finally with api.destroy(), assert listener counts relative to a baseline captured at test start, model shadowRoot only for elements that actually attach one, and either drop createRegistry() or use its return value.

### 10. NOTE (likely) — Pre-existing integration consequence worth recording: the properties panel commits to builder state on every `input` event, so each keystroke becomes an undo step. Builder-level Ctrl+Z therefore rewinds one character at a time once focus leaves a field. This is not introduced by this commit, but the new shortcut makes it user-visible and the task's shortcut tests do not cover it.

**Evidence:** apps/builder/src/properties/properties-panel.ts:296-309 (`input.addEventListener("input", handleChange)` → onChange → state.updateInstanceProperties → recordHistory at apps/builder/src/state/builder-state.ts:437-439); document-history.ts:80-92 records every distinct document reference.

**Files:** apps/builder/src/properties/properties-panel.ts, apps/builder/src/state/document-history.ts

**Lines:** 298, 437

**Recommended correction:** No change required for this task; track per-field history coalescing (debounced record, or commit only on `change`/blur) as a follow-up so builder undo granularity is meaningful.
