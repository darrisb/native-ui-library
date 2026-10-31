# Review: 1.12.10.2 — Implement REST fetch adapter

- **Reviewed commit:** 4e2e994b7d6ca12526266d9961da96261d4b75d2
- **Overall assessment:** conditional - The REST GET adapter itself is well structured and meets most requirements (injectable fetch, AbortController + bounded timeout, http/https + userinfo rejection, Content-Length/streaming size cap, strict JSON parsing, non-throwing discriminated results with secret-free messages, exported from the renderer index). However the focused test file reuses the repository's synchronous test harness with async test bodies, so every test is unconditionally recorded as PASS and the failure summary/exit path is dead code; the new test is also not registered in any package.json script (unlike the other renderer tests), and the adapter does not actually suppress cookies on same-origin requests despite its documented 'no credentials by default' contract. Fix the async test harness, register the test script, and set credentials: 'omit' before this can be considered verified.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T13:55:40.738Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a187ede3a501a733c6a1a36ef0
- **Token usage:** input 78, output 11392, reasoning 0, cache 368082, total —
- **Reported cost:** $0.019565

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. HIGH (confirmed) — The focused tests do not actually validate the adapter: the copy-pasted harness `test(name, fn: () => void)` invokes `fn()` without awaiting it and immediately pushes `{passed: true}`. Every one of the 17 tests in this file is `async` (they all `await adapter.fetchJson(...)`), so the try/catch can never observe an assertion failure. The pass/fail summary printed at the end of the module is emitted synchronously (t≈0) while the async bodies are still pending (the timeout test resolves ~500 ms later), so it always reports '17 passed, 0 failed' regardless of adapter behavior, and the `if (failed > 0) throw` guard is unreachable. A genuine adapter regression would surface only as an unrelated ERR_UNHANDLED_REJECTION crash that also kills the remaining in-flight tests — not as a reported test failure. Existing repo test files avoid this by keeping all test bodies synchronous and only using top-level `await import(...)`, so the harness was reused outside its design assumptions.

**Evidence:** packages/renderer/src/__tests__/rest-fetch-adapter.test.ts:18-29 (`function test(name: string, fn: () => void): void { try { fn(); results.push({ name, passed: true }); } ... }`) vs. async bodies at lines 140, 152, 168, 180, 195, 206, 221, 241, 257, 268, 279, 290, 301, 316, 332, 354; summary/report at lines 377-392. Compare the working synchronous convention in packages/renderer/src/__tests__/execute-action.test.ts:18-29 with bodies like line 92 `test("...", () => { ... })`, and packages/core/src/__tests__/datasource-contract.test.ts:18-29 + 70-73 (top-level await imports only).

**Files:** packages/renderer/src/__tests__/rest-fetch-adapter.test.ts

**Lines:** 18, 29, 140, 377

**Recommended correction:** Make the harness async-aware: change to `function test(name: string, fn: () => void | Promise<void>): void` that records the promise (`const p = Promise.resolve().then(fn).then(() => results.push({name, passed:true}), (e) => results.push({name, passed:false, error: ...}))`), collect the promises, `await Promise.all(...)` before printing the summary, then apply the `failed > 0` throw. Keep test bodies awaited so timeouts/abort tests (500 ms `delayedFetch`) complete before reporting.

### 2. MEDIUM (confirmed) — The new test file is not wired into the project's test workflow. Every other renderer test has an explicit script in packages/renderer/package.json (`test`, `test:execute-action`, `test:action-wiring`), but no script was added for `dist/__tests__/rest-fetch-adapter.test.js`, and the changed-files list confirms package.json was not touched. Consequently `npm test -w @visual-ui/renderer` never runs these tests, and the commit was recorded with 'no verification commands were configured for this task' — the expected focused tests exist but are effectively unrun.

**Evidence:** packages/renderer/package.json:19-21 lists only render-component / execute-action / action-event-wiring test scripts; changed-files.txt contains only the adapter module, the test file, src/index.ts and four tsbuildinfo files (no package.json).

**Files:** packages/renderer/package.json, packages/renderer/src/__tests__/rest-fetch-adapter.test.ts

**Lines:** 19, 20, 21

**Recommended correction:** Add `"test:rest-adapter": "tsc --build && node dist/__tests__/rest-fetch-adapter.test.js"` (or append it to an aggregated script) following the existing convention so the orchestrator can execute the focused tests for this task.

### 3. MEDIUM (confirmed) — Requirement 'no cookies/credentials by default' is not enforced. The request init sets only `method`, `signal` and `headers`; it never sets `credentials`. The Fetch standard default is `same-origin`, so when a data source resolves to a same-origin URL (the common case for a builder talking to its own backend) the browser will attach ambient cookies, contradicting the module's own documented safety contract ('No auth headers, cookies, or credentials are sent by default'). The focused test gives false assurance here: it only inspects the `headers` object for Authorization/Cookie and never checks the credentials mode.

**Evidence:** packages/renderer/src/data-source/rest-fetch-adapter.ts:179-183 (`fetchImpl(url, { method: "GET", signal: controller.signal, headers: { Accept: "application/json" } })`) versus the contract comment at lines 12-13; test assertion scope at packages/renderer/src/__tests__/rest-fetch-adapter.test.ts:354-371.

**Files:** packages/renderer/src/data-source/rest-fetch-adapter.ts

**Lines:** 179, 183

**Recommended correction:** Add `credentials: "omit"` (and optionally `cache: "default"`, `mode` left default) to the RequestInit, and extend the header test to assert `capturedInit?.credentials === "omit"` plus absence of an Authorization/Cookie header.

### 4. MEDIUM (confirmed) — Focused-test coverage gaps against the stated requirements: (a) no test for the `network` error path, although 'Surface CORS/network/HTTP/JSON errors' is an explicit requirement — the case where fetchImpl rejects with a TypeError (the shape CORS/DNS failures take) is never exercised, and it is precisely the branch that must not leak the cause; (b) the streaming byte-cap branch (`totalBytes > maxBytes` while reading, lines 211-217) is untested — only the early `Content-Length` rejection is covered; (c) `abortAll()` during body streaming is untested.

**Evidence:** packages/renderer/src/__tests__/rest-fetch-adapter.test.ts contains 17 tests (lines 140-371): success x2, http x2, invalid JSON x2, abort, timeout, unsafe/invalid URL x4, size cap (Content-Length only), message-leak, headers. No fake that rejects, and no fake whose ReadableStream exceeds maxResponseBytes. Implementation branch at packages/renderer/src/data-source/rest-fetch-adapter.ts:204-219 and 237-241.

**Files:** packages/renderer/src/__tests__/rest-fetch-adapter.test.ts

**Lines:** 140, 316, 326

**Recommended correction:** Add fakes for: `fetchImpl` rejecting with `new TypeError('Failed to fetch')` → expect code `network` and a message that does not echo the cause; a `Response` with a body stream larger than `maxResponseBytes` and no Content-Length → expect `size-exceeded`; and `abortAll()` invoked mid-stream → expect `abort`.

### 5. LOW (confirmed) — Response bodies are never released on non-OK / oversized / JSON-error paths, and `reader.cancel()` is called without awaiting or handling its promise. In browsers/undici an unconsumed error body keeps the connection occupied until GC and produces a 'body never read' console warning; for the size-exceeded case the cancel rejection is silently unhandled (an unhandled rejection can crash the Node test process).

**Evidence:** packages/renderer/src/data-source/rest-fetch-adapter.ts:185-187 (`if (!response.ok) { return failure("http"); }` — no `response.body?.cancel()`); line 214 (`reader.cancel();` floating promise); lines 199-201 and 229-234 return without releasing the stream.

**Files:** packages/renderer/src/data-source/rest-fetch-adapter.ts

**Lines:** 185, 214

**Recommended correction:** On the non-OK path do `await response.body?.cancel().catch(() => {})` before returning; replace the bare `reader.cancel()` with an awaited/catch-wrapped call (or `void reader.cancel().catch(() => {})`).

### 6. LOW (likely) — An empty/absent response body is reported with the `json` error code. A 204/205 response has `body === null`, so `if (!reader) return failure("json")` mislabels 'no content' as malformed JSON. The core contract already models a distinct `empty` runtime state, so the orchestrator in the next task cannot distinguish 'endpoint returned nothing' from 'endpoint returned garbage' using this result set.

**Evidence:** packages/renderer/src/data-source/rest-fetch-adapter.ts:198-201 versus packages/core/src/types/data-source.ts:49-51 (`DataSourceEmptyState { status: "empty" }`).

**Files:** packages/renderer/src/data-source/rest-fetch-adapter.ts

**Lines:** 198, 201

**Recommended correction:** Either add an `empty` error/variant (e.g. `RestFetchSuccess` with a dedicated `empty` outcome, or error code `empty-body`) or document explicitly that the orchestrator must map a zero-length body to `DataSourceEmptyState`.

### 7. LOW (confirmed) — HTTP failures carry no non-sensitive diagnostic detail. `failure("http")` always returns the constant string 'HTTP error: request failed.' with no status code or content type, which makes the generic `DataSourceErrorState.message` unusable for users debugging a data source (404 vs 500 vs 401 are indistinguishable). The status code is not a secret and could be surfaced safely.

**Evidence:** packages/renderer/src/data-source/rest-fetch-adapter.ts:128-142 (`ERROR_MESSAGES` map, `failure(code)` builds only `{code, message}`) and line 186.

**Files:** packages/renderer/src/data-source/rest-fetch-adapter.ts

**Lines:** 140, 186

**Recommended correction:** Extend `RestFetchFailure` with an optional non-sensitive `status?: number` (and optionally `code` only) populated on the http branch, or format the message as `HTTP error: request failed (500).` Never append response bodies, headers, or the URL.

### 8. NOTE (confirmed) — The adapter rejects relative URLs as `invalid-url` because `new URL(url)` is called with no base, while the core validator accepts them (`validate-data-source.ts` only blocks a scheme blocklist and requires a non-empty string, so `"/api/items"` is valid project JSON). This matches the stated requirement to require http/https, but it means URLs that pass document validation will fail at resolution time; the later orchestrator task should decide whether to resolve against `document.baseURI` before calling `fetchJson`.

**Evidence:** packages/renderer/src/data-source/rest-fetch-adapter.ts:106-125 vs packages/core/src/validation/validate-data-source.ts:70-74, 180-199.

**Files:** packages/renderer/src/data-source/rest-fetch-adapter.ts, packages/core/src/validation/validate-data-source.ts

**Lines:** 106, 187

**Recommended correction:** Optionally accept a `baseUrl` option (`new URL(url, baseUrl)`) so same-origin relative data-source URLs can be resolved by the orchestrator, or document the absolute-URL requirement in the data-source contract.

### 9. NOTE (confirmed) — Minor robustness/ergonomics items: adapter options are not sanity-checked (`timeoutMs: 0` or a negative value aborts every request immediately; a non-positive `maxResponseBytes` rejects every response); `fetchImpl` is captured at creation time from `globalThis.fetch`, so it is `undefined` in environments without fetch and any later global patch is ignored (the resulting TypeError is reported as `network`); and `RestFetchSuccess`/`RestFetchFailure` are not re-exported from the package index even though other result types are.

**Evidence:** packages/renderer/src/data-source/rest-fetch-adapter.ts:153-156 (`options.fetchImpl ?? (globalThis.fetch as FetchImpl)`, defaults with no clamping); packages/renderer/src/index.ts:14-22 (exports `RestFetchResult`, `RestFetchError`, `RestFetchErrorCode`, but not `RestFetchSuccess`/`RestFetchFailure`).

**Files:** packages/renderer/src/data-source/rest-fetch-adapter.ts, packages/renderer/src/index.ts

**Lines:** 153, 156

**Recommended correction:** Clamp/validate `timeoutMs` and `maxResponseBytes` to positive finite values (fall back to defaults otherwise), resolve `globalThis.fetch` lazily at call time, and add `type RestFetchSuccess` / `type RestFetchFailure` to the index exports.

### 10. NOTE (confirmed) — Build artifacts (`*.tsbuildinfo`) are tracked in Git and change with every compile, so this task's diff includes four unrelated artifact churns. This is pre-existing repo hygiene (the files were already tracked), not introduced here, but it makes review diffs noisy.

**Evidence:** changed-files.txt lines 1-3 and 7: `apps/builder/tsconfig.tsbuildinfo`, `examples/json-renderer/dist-test/tsconfig.tsbuildinfo`, `packages/core/tsconfig.tsbuildinfo`, `packages/renderer/tsconfig.tsbuildinfo` all marked M.

**Files:** packages/renderer/tsconfig.tsbuildinfo

**Recommended correction:** No action required for this microtask; consider untracking `*.tsbuildinfo` in a dedicated hygiene task so functional diffs stay reviewable.
