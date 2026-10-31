# Review: 1.12.10.7 — Document future dependent-component extension boundary

- **Reviewed commit:** 58750c0cb8c85685ad4f4ff8f992dc10a7f0624d
- **Overall assessment:** conditional - The design note satisfies all five task requirements (country→state dependency model, mount-only/GET boundary, data-source/action/state/renderer separation, browser-only CORS/security, export behavior) and adds no production code; all referenced modules, symbols, and limits (GET-only, loadOn:"mount", 10s timeout, 5 MiB cap, Accept: application/json, epoch/mounted guards, ActionEvent set, BindingTarget set) match the actual code. However, three statements about the current contracts are inaccurate in ways that matter for a document intended as the extension boundary: validation does not reject URL userinfo/"credentials-in-url", the existing epoch guard does not provide per-instance/per-request staleness for re-fires, and export/preview is described as shipped when no export pipeline exists.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-30T00:39:13.199Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a18a3b65260f9972cf7ce2b8ca
- **Token usage:** input 96, output 10407, reasoning 0, cache 563739, total —
- **Reported cost:** $0.025239

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — The document states that credential-bearing URLs are rejected "at both validation and fetch time" and that the "credentials-in-url" rejection exists "at both validation and fetch adapter levels". Validation does not implement any such check: validateRestDataSource only rejects blocked schemes (javascript/data/vbscript/file) and secret-like query-parameter NAMES (token, api_key, password, ...). There is no URL parse for userinfo, so a URL such as https://admin:hunter2@internal.example/api passes validation and is only rejected later by the fetch adapter (parsed.username/parsed.password → "credentials-in-url"). The error code/string "credentials-in-url" exists only in the fetch adapter. A future implementer relying on this note could assume validation already blocks userinfo credentials for dynamically-substituted URLs.

**Evidence:** docs/design/1.12.10.7-dependent-component-extension-boundary.md lines 53 and 202 vs packages/core/src/validation/validate-data-source.ts lines 39-91, 196-215 (blocked schemes + SECRET_QUERY_PARAM_NAMES only) and packages/renderer/src/data-source/rest-fetch-adapter.ts lines 116-122 (username/password check), line 27 ("credentials-in-url" code defined here only).

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md

**Lines:** 53, 202

**Recommended correction:** Rewrite to: validation rejects disallowed URL schemes and secret-like query-parameter names; the fetch adapter additionally rejects URLs containing userinfo ("credentials-in-url") and non-http(s) protocols. Note explicitly that URL userinfo is currently NOT caught at validation time, and that a future dependent-parameter extension should add userinfo/protocol checks to validateRestDataSource so dynamic substitution cannot smuggle credentials into project JSON.

### 2. MEDIUM (confirmed) — Section 6.3 claims "The runtime already supports per-instance staleness via the epoch counter" and that the change subscription can be wired "at mount() time". Neither is true for re-fires: (1) `epoch` is a single runtime-global counter incremented only in unmount(), and `isStale()` checks `this.epoch !== requestEpoch || !this.mounted.has(instanceId)` — two in-flight requests for the same instance both carry the same epoch and both pass the staleness check, so a late-arriving older response would overwrite newer bound data (last-response-wins, not last-request-wins); (2) mount() returns early when `this.mounted.has(instance.id)`, so a re-resolve triggered by a dependency change cannot reuse the mount() path at all. The note therefore understates the work required for change-triggered reloads, which is the exact boundary it is meant to define.

**Evidence:** docs/design/...md lines 55 and 246-250 vs packages/renderer/src/data-source/data-source-runtime.ts lines 96 (private epoch = 0), 139-141 (mounted-set early return), 160-165 (epoch++ only in unmount), 189-191 (isStale), 222-224/240-242 (staleness gates).

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md

**Lines:** 55, 246, 249

**Recommended correction:** State precisely what exists today (epoch invalidates responses only after unmount; unmountInstance invalidates via the mounted set; mount() is idempotent per instance id and therefore cannot re-fire) and record the required future work: a per-instance/per-request sequence token (or per-instance epoch) so a newer request supersedes an older in-flight one, plus a re-resolve entry point that bypasses the `mounted` idempotency guard.

### 3. LOW (confirmed) — Terminology error in the future-contract requirements: it says a data source with `parameters` "shares the same `type: "GET"` contract". On the real `RestDataSource`, `type` is the union discriminator with value "rest", and "GET" is the value of `method`. This contradicts the same document's own pipeline diagram and layer table.

**Evidence:** docs/design/...md line 150 vs packages/core/src/types/data-source.ts lines 91-95 (readonly type: "rest"; readonly method: "GET") and vs docs/design/...md lines 23 and 31, which correctly write type:"rest", method:"GET".

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md

**Lines:** 150

**Recommended correction:** Change to: it keeps the same discriminators — `type: "rest"` and `method: "GET"`.

### 4. LOW (confirmed) — The CORS/auth bullet overstates the cookie limitation. The fetch init omits `credentials` (only method/signal/headers are set), which means the browser default `same-origin` applies, not `omit`. Cookies (e.g. a session cookie) ARE therefore attached to same-origin requests, so "no cookies" and "Authenticated APIs do not work" are inaccurate for same-origin session-cookie endpoints; they are accurate only for cross-origin requests. The same imprecision is inherited from examples/json-renderer/README.md.

**Evidence:** docs/design/...md lines 195-200 vs packages/renderer/src/data-source/rest-fetch-adapter.ts lines 179-183 (init = { method: "GET", signal, headers: { Accept: "application/json" } } — no `credentials` option).

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md

**Lines:** 197, 199

**Recommended correction:** Reword to: no `Authorization`/custom headers and no explicit `credentials` option are sent, so the fetch default (`same-origin`) applies — cookies are attached to same-origin requests but never to cross-origin ones; token/header-authenticated cross-origin APIs do not work today.

### 5. LOW (confirmed) — Section 5.4 "Export Behavior" and one bullet in 5.1 describe export (and a "preview" mode) in present tense as if the capability ships in this milestone. The repository contains no export/serialization pipeline: the only renderer modes are "interactive" and "edit", and nothing in packages/ or apps/ produces an exported artifact (the closest is the standalone examples/json-renderer, which loads JSON rather than exporting it). Everywhere else the note carefully marks future work ("CONCEPTUAL — not implemented", Section 7 table), so this inconsistency is misleading.

**Evidence:** docs/design/...md lines 186 ("Interactive mode (preview / export)") and 216 ("Exported interactive renders (`mode: "interactive"`) carry the full declarative `dataSource` in their project JSON. At export time:") vs packages/renderer/src/types/renderer-options.ts line 16 (`export type RendererMode = "interactive" | "edit";`) and the absence of any exportProject/serializer across packages/** and apps/** (grep for export/serialize features).

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md

**Lines:** 186, 216

**Recommended correction:** Add an explicit caveat that export is not implemented in this milestone (e.g. "Once export exists, exported interactive documents will carry the full declarative dataSource …"), and drop or qualify the "preview / export" mode parenthetical since only `edit` and `interactive` modes are defined.

### 6. NOTE (confirmed) — Sections 3.3 and 4.2 use Dropdown `properties` ("label, placeholder") and Dropdown runtime `selectedValue` as illustrative examples without noting that no Dropdown component exists yet, only card/text/button in packages/components and a mock "options" consumer in the example. The Binding contract itself calls them "future Dropdown"/"future Table".

**Evidence:** docs/design/...md lines 89-90, 97, 158-164 vs packages/core/src/types/binding.ts lines 21-25 and examples/json-renderer/README.md line 179 ("A Dropdown component does not exist yet"), packages/components/src/{card,text,button}.

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md

**Lines:** 89, 158

**Recommended correction:** Add one clarifying sentence that Dropdown is a future component and that `selectedValue` is a proposed (not existing) runtime accessor, matching the caveats already used in Sections 4.1 and 7.

### 7. NOTE (confirmed) — The new design note is the first file under docs/design/ and is not referenced from README.md, the only other project documentation entry point, so future contributors are unlikely to discover it when implementing dependent loading.

**Evidence:** glob docs/**/*.md returns only docs/design/1.12.10.7-dependent-component-extension-boundary.md; README.md (lines 1-31) has no documentation/design section.

**Files:** docs/design/1.12.10.7-dependent-component-extension-boundary.md, README.md

**Lines:** 1

**Recommended correction:** Optional: add a short "Documentation"/"Design notes" section in README.md linking docs/design/1.12.10.7-dependent-component-extension-boundary.md (or an index) so later tasks can find the boundary contract.
