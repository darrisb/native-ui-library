# Review: 1.12.9.6 — Verify action persistence and independent runtime

- **Reviewed commit:** a80bf9033c9fa2e25d74c1baa74943b1ce457d4b
- **Overall assessment:** pass - Focused integration tests correctly exercise the documented seams: action JSON round-trips through JSON parse/stringify and re-renders with working listeners; interactive mode dispatches navigation while edit mode binds nothing; the standalone runtime wires action execution and imports no builder modules. Implementation (main.ts interactive mode + injected ActionExecutor) is correct and non-regressive. Minor issues: a duplicated independence test and a weak/misleading 'event isolation' assertion in the nested test; README not updated to mention action wiring.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T13:37:28.805Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a187dcbeb412d5a43a73b4b7ba
- **Token usage:** input 120, output 9912, reasoning 0, cache 619410, total —
- **Reported cost:** $0.024807

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. LOW (confirmed) — The newly added independence test is an exact duplicate of an already-present test, adding no coverage and risking drift between two copies.

**Evidence:** examples/json-renderer/__tests__/json-renderer.test.ts: pre-existing test 'The standalone integration does not import builder modules' (lines 342-357) and new test 'Standalone runtime does not import builder modules (independence)' (lines 827-842) have identical bodies (same readFileSync of ../renderer.js and ../main.js and same @visual-ui/builder substring assertions).

**Files:** examples/json-renderer/__tests__/json-renderer.test.ts

**Lines:** 342, 827

**Recommended correction:** Remove the duplicate test, or if kept intentionally, differentiate it (e.g. also assert @visual-ui/renderer is imported in main.js to confirm the runtime seam) so it is not a verbatim copy of the existing test.

### 2. LOW (confirmed) — The 'multiple nested actions' integration test claims to verify event isolation, but the MockElement.fire implementation only invokes the target element's own listeners and does not simulate bubbling to the parent, so the isolation assertion would still pass even if event.stopPropagation() were removed from the action listener. The isolation claim at this seam is therefore not actually exercised.

**Evidence:** examples/json-renderer/__tests__/json-renderer.test.ts:771-806 asserts adapter.calls.length===1 after button.fire('click'); MockElement.fire (lines 110-114) never propagates to parentNode. bind-action-events.ts:124 calls event.stopPropagation(), but the integration test does not assert event.propagationStopped (unlike packages/renderer/src/__tests__/action-event-wiring.test.ts:335 which does). Net suite coverage is still adequate because the unit test guards isolation.

**Files:** examples/json-renderer/__tests__/json-renderer.test.ts

**Lines:** 795, 802

**Recommended correction:** Either drop the '(event isolation)' comment from the integration test, or assert the child event's propagationStopped (or implement bubbling in MockElement.fire) so the isolation claim is genuinely verified at this seam. Alternatively note that isolation is covered by the renderer unit test.

### 3. NOTE (confirmed) — The example README still documents no action/interactive-mode capability even though main.ts now renders in interactive mode with an injected ActionExecutor; the shipped document.json contains no actions, so the standalone demo never exercises the new wiring in practice.

**Evidence:** examples/json-renderer/main.ts:52-60 sets mode:'interactive' and actionExecutor, but examples/json-renderer/README.md (Scope/'What it demonstrates' sections, lines 8-26, 138-147) makes no mention of declarative actions or interactive mode, and examples/json-renderer/document.json contains no 'actions'. The runtime capability is proven only via synthetic test documents.

**Files:** examples/json-renderer/README.md, examples/json-renderer/document.json

**Lines:** 138

**Recommended correction:** Add a short README paragraph describing that the standalone runtime renders in interactive mode and wires validated declarative navigate actions (no builder server required), and explicitly state that programmatic export/serialize of a builder document is not yet implemented (rather than implying it exists), matching the task's documentation requirement.
