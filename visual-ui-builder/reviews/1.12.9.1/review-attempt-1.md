# Review: 1.12.9.1 — Define declarative action contracts

- **Reviewed commit:** 06d20eec3e2f4ab1ad3fce48185d41264c3c874e
- **Overall assessment:** conditional - The declarative action contract (optional actions, discriminated union with id/event/type/config, navigate + _self/_blank, unknown-type/malformed-target rejection, legacy-JSON compatibility, JSON round-trip) is implemented correctly and integrated into validateComponentInstance, which the renderer already uses to block rendering on any error. However, the dangerous-URL-scheme defense is a 4-entry blocklist that is bypassed by embedded control characters (e.g. 'java\tscript:alert(1)'), the very case its own comment claims to prevent, and the implementation diverges from the documented allowlist. Fix the scheme validation before this gate is used by a real navigation runtime.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T12:29:59.960Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a187a0afa905c183c5f3c67b58
- **Token usage:** input 60, output 4642, reasoning 0, cache 166629, total —
- **Reported cost:** $0.009589

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. HIGH (confirmed) — The URL scheme check only strips LEADING whitespace/control characters before extracting the scheme, so an obfuscated scheme with an embedded control character is accepted. For 'java\tscript:alert(1)' the leading-strip regex matches zero characters (it starts with 'j'), and the scheme regex '^([a-z][a-z0-9+.-]*):' then fails to match because the tab breaks the scheme before the colon, so extractUrlScheme returns null and isBlockedUrl returns false. Browsers (per the WHATWG URL parser) remove ASCII tab/newline and strip C0 control characters from URLs anywhere in the string, so the value becomes 'javascript:alert(1)' at navigation time. This defeats the requirement 'reject dangerous URL schemes (javascript:, data:, etc.)' and directly contradicts the function's own comment, which states that stripping is needed precisely so 'java\nscript:' would not bypass the blocklist.

**Evidence:** packages/core/src/validation/validate-action.ts:44-58 (comment claims 'java\nscript:' bypass is prevented, but only /^\s\u0000-\u001f]+/ leading strip is applied); test only covers LEADING whitespace/control char cases at action-contract.test.ts:213-231, never an embedded one.

**Files:** packages/core/src/validation/validate-action.ts, packages/core/src/__tests__/action-contract.test.ts

**Lines:** 44, 48, 50, 51, 57, 213

**Recommended correction:** Before extracting the scheme, remove ALL U+0000-U+0020 (and other C0 controls) from the whole string, not just the leading edge, e.g. url.replace(/[\u0000-\u0020]/g, ''). Preferably replace the blocklist with an allowlist (see next finding), which also neutralizes this class of obfuscation. Add tests for embedded control characters such as 'java\tscript:alert(1)', 'java\nscript:...', and 'da\0ta:...'.

### 2. MEDIUM (confirmed) — The validator uses a blocklist of {javascript, data, vbscript, file}, but the NavigateConfig JSDoc explicitly promises an allowlist: 'Relative URLs and standard http(s) / mailto / tel schemes are permitted.' In practice any other scheme is accepted, including schemes that can carry script or attacker-controlled content, notably blob: (a blob: URL to an attacker-controlled document can execute), as well as about:, view-source:, custom/app schemes, etc. The implementation does not match its documented contract.

**Evidence:** BLOCKED_URL_SCHEMES at packages/core/src/validation/validate-action.ts:33-38 (reject-list only) vs. NavigateConfig doc comment 'Relative URLs and standard http(s) / mailto / tel schemes are permitted' at packages/core/src/types/action.ts:23-28.

**Files:** packages/core/src/validation/validate-action.ts, packages/core/src/types/action.ts

**Lines:** 26, 33, 38

**Recommended correction:** Switch to an allowlist: when a scheme is present, require it to be one of a safe set (http, https, mailto, tel) and otherwise accept only scheme-less/relative URLs; reject everything else (including blob:, data:, javascript:, vbscript:, file:). This also resolves the embedded-control-character bypass and aligns the code with the documented contract.

### 3. LOW (likely) — validateActions silently accepts a malformed (non-array) `actions` value that happens to lack a numeric length. For example `"actions": {}` (or a plain object/number from hand-edited imported JSON) passes the `!actions || actions.length === 0` guard and the `index < actions.length` loop never runs, so no error is reported even though the value violates the ComponentAction[] contract. This weakens the 'reject malformed' requirement at the runtime gate that validates imported JSON (the TS type only protects build time).

**Evidence:** packages/core/src/validation/validate-action.ts:151-158 — guard only checks falsy/length===0 and then indexes; a length-less object yields zero iterations and zero errors.

**Files:** packages/core/src/validation/validate-action.ts

**Lines:** 151, 156, 157

**Recommended correction:** Add an explicit `if (!Array.isArray(actions)) { errors.push({ path: `${path}.actions`, message: 'Actions must be an array.' }); return errors; }` before iterating, and add a test asserting a non-array `actions` value is rejected.

### 4. NOTE (confirmed) — The focused test file is well written and covers the required scenarios (valid/absent/empty, unknown type, missing/empty id, unsupported event, malformed target, empty url, javascript:/data: rejection, case-insensitivity, JSON round-trip, unchanged legacy shape). However it is never executed: the @visual-ui/core package declares only `build` and `typecheck` scripts and the workspace provides no `test` command for core, and the orchestrator reported 'no verification commands were configured' for this task. (This is a pre-existing repo-wide gap consistent with other packages' tests, not a regression introduced here, but it means the contract's guard tests are effectively unrun.)

**Evidence:** packages/core/package.json:16-19 has no test script; root package.json scripts (line 11-18) only wire test:json-renderer; task verification block states no commands configured.

**Files:** packages/core/package.json, package.json, packages/core/src/__tests__/action-contract.test.ts

**Lines:** 17, 16

**Recommended correction:** Add a runner entry point (e.g. a `test:core` script mirroring the `test:json-renderer` pattern: build then `node dist/__tests__/action-contract.test.js`) so the focused contract tests actually execute; not required to be done in this microtask if the orchestrator owns test wiring, but flagged so coverage is confirmed to run.
