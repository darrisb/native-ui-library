# Review: 1.12.10.1 — Define reusable data source and binding contracts

- **Reviewed commit:** c41b96b187417d148738fa53503632332456515d
- **Overall assessment:** conditional - The declarative contracts (RestDataSource, Binding, runtime states, safe path grammar) and a defensive validator are well documented and covered by focused tests that pass by inspection, and legacy JSON without dataSource is preserved. However the new validator is never invoked from the application's validation pipeline (validateComponentInstance still only wires validateActions), so the secrets / URL-safety / header restrictions are not actually enforced for project JSON, and the validator itself still mishandles some malformed inputs (null/non-array bindings) and misses common credential vectors (URL userinfo, differently-named secret params).
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T13:47:59.988Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a187e693956c0777e3eba8ef1a
- **Token usage:** input 78, output 7545, reasoning 0, cache 347228, total —
- **Reported cost:** $0.016793

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. HIGH (confirmed) — The new validateDataSourceContracts is dead code in the application: nothing in the validation pipeline calls it, so dataSource/bindings in project JSON are never checked. The requirements 'Disallow secrets/tokens/passwords in project JSON' and 'no arbitrary headers initially' are therefore enforced only at TypeScript compile time and not when JSON is loaded/validated.

**Evidence:** grep for `validateDataSourceContracts` across the repo finds only packages/core/src/index.ts:48, its own definition (packages/core/src/validation/validate-data-source.ts:256) and the new test file. packages/components/src/validation/validate-instance.ts:131 integrates the analogous action contract with `errors.push(...validateActions(instance.actions, path, []));` but adds no equivalent call for dataSource/bindings (lines 127-131 unchanged, and validate-instance.ts is absent from changed-files.txt). The suggested-file list for this microtask explicitly included 'modify: component instance contracts and validation'.

**Files:** packages/components/src/validation/validate-instance.ts, packages/core/src/validation/validate-data-source.ts

**Lines:** 127, 131, 256

**Recommended correction:** Mirror the validateActions precedent in validateComponentInstance: `errors.push(...validateDataSourceContracts(instance.dataSource, instance.bindings, path, []));` (DataSourceValidationIssue is structurally identical to ValidationError), plus a components-level integration test asserting that a hidden `?token=` / bad loadOn dataSource is reported by validateComponentInstance and that legacy instances without dataSource still produce zero errors.

### 2. MEDIUM (confirmed) — The validator throws / silently passes on malformed `bindings` input. `bindings: null` (valid JSON, plausible in hand-edited project files) causes a runtime TypeError on `bindings.length`; `bindings: {}` or any other non-array object has no `length`, so the loop never runs and the malformed binding is accepted with no issue.

**Evidence:** packages/core/src/validation/validate-data-source.ts:266-270 guards only `if (bindings !== undefined)` then reads `bindings.length`. This contradicts the defensive intent shown elsewhere in the file (e.g. validateBinding at 221-227 handles non-object bindings, validateDataSource at 141-147 handles `null`). No test exercises `bindings: null` or `bindings: {}` (packages/core/src/__tests__/datasource-contract.test.ts only passes arrays or undefined).

**Files:** packages/core/src/validation/validate-data-source.ts, packages/core/src/__tests__/datasource-contract.test.ts

**Lines:** 266, 267, 268

**Recommended correction:** Add `if (!Array.isArray(bindings)) { errors.push({ path: `${path}.bindings`, message: 'Bindings must be an array.' }); }` before iterating (and an equivalent check for a non-array/malformed dataSource array if bindings ever holds records), plus focused tests for `bindings: null`, `bindings: {}` and `bindings: 'options'`.

### 3. MEDIUM (confirmed) — 'No arbitrary headers initially' is only enforced by the absence of a field in the TS interface, not by validation: a data source JSON containing `headers: { "Authorization": "Bearer …" }` (or any unknown key) passes validateDataSourceContracts with zero issues, so credentials can still enter project JSON.

**Evidence:** validateRestDataSource (packages/core/src/validation/validate-data-source.ts:161-209) validates only method, loadOn, url, responsePath and mapping; it never enumerates the object's own keys. The claim 'there is no place to embed secrets such as auth tokens' (data-source.ts:85-88) holds only for typed construction, not for parsed JSON.

**Files:** packages/core/src/validation/validate-data-source.ts, packages/core/src/types/data-source.ts

**Lines:** 161, 180, 85

**Recommended correction:** Reject unknown keys on the data source record (allowlist `type`, `method`, `url`, `responsePath`, `mapping`, `loadOn`) with an issue such as 'Data source "headers" is not supported', and add a focused test that a dataSource carrying `headers`/`Authorization` is rejected.

### 4. MEDIUM (confirmed) — Credential detection in `url` is bypassable in realistic cases: URL userinfo is never inspected, and the name must be immediately preceded by `?`/`&`, so `client_secret`, `x-api-key`, `authorization`, `session`, `cookie`, `pwd`, etc. pass validation.

**Evidence:** packages/core/src/validation/validate-data-source.ts:52-61 lists only token/access_token/auth_token/api_key/apikey/secret/password/passwd, and containsSecretQueryParam at line 84 builds `[?&]${name}(?:=|$|[^a-z0-9_-])`. Consequently `https://admin:password@api.example.com/items` yields no error (no `?`/`&` before `password`), and `?client_secret=abc` yields no error (preceded by `_`, not `[?&]`). Tests only cover `?api_key=`, `?token=`, `?user=x&password=y` (datasource-contract.test.ts:224-256).

**Files:** packages/core/src/validation/validate-data-source.ts

**Lines:** 52, 81, 84, 193

**Recommended correction:** Also reject URLs containing userinfo (`/^https?:\/\/[^/?#]*@/i`) and widen matching to treat `[-_?.#&=]` as name boundaries over the whole query/fragment string (or parse the query with URLSearchParams and compare normalized names against a list including key/auth/authorization/bearer/session/cookie/pwd/client_secret/x-api-key). Add focused tests for userinfo and for `?client_secret=`/`?x-api-key=`.

### 5. LOW (confirmed) — The 'safe' path grammar still permits prototype-chain segment names (`__proto__`, `constructor`, `prototype`), so the single gate promised by the contract cannot currently prevent unsafe property traversal once a resolver is implemented in a later task.

**Evidence:** SAFE_DATA_PATH_PATTERN at packages/core/src/validation/validate-data-source.ts's source (packages/core/src/types/data-source.ts:142) accepts any `[a-zA-Z_][a-zA-Z0-9_]*` segment, so `isValidDataPath('__proto__.foo')` and `isValidDataPath('constructor.prototype')` return true; no test asserts rejection of these (datasource-contract.test.ts:338-377).

**Files:** packages/core/src/types/data-source.ts, packages/core/src/__tests__/datasource-contract.test.ts

**Lines:** 142, 151

**Recommended correction:** Reject reserved segment names (`__proto__`, `constructor`, `prototype`) inside isValidDataPath (documented as part of the grammar) and add negative test cases, so the contract itself is the gate rather than relying on a future resolver.

### 6. LOW (likely) — `loadOn` is mandatory while `responsePath`/`mapping` are optional, so a minimal, otherwise correct declarative data source that omits `loadOn` is rejected instead of defaulting to mount loading; this is stricter than the stated contract ('loadOn mount') and may cause avoidable validation errors in hand-written JSON.

**Evidence:** RestDataSource declares `readonly loadOn: "mount";` (packages/core/src/types/data-source.ts:114) while `responsePath`/`mapping` are optional (lines 106, 109); validateRestDataSource (validate-data-source.ts:173-178) reports `ALLOWED_LOAD_ON.includes(undefined) === false`. No test covers an omitted `loadOn`.

**Files:** packages/core/src/types/data-source.ts, packages/core/src/validation/validate-data-source.ts

**Lines:** 114, 173

**Recommended correction:** Either make `loadOn?: DataSourceLoadOn` with an implicit "mount" default (validation rejects only explicitly unsupported values) and add a focused test, or keep it required and state the rationale in the JSDoc plus add a test that a missing `loadOn` is reported as intended.

### 7. NOTE (confirmed) — Minor documentation/API-surface inconsistencies in the new modules: a duplicated word in the lifecycle comment, and the individual runtime-state interfaces are not re-exported from the package barrel even though the union is.

**Evidence:** packages/core/src/types/data-source.ts:10 reads '(loading / empty / empty / error)' — should be idle/loading/ready/empty/error; `DataSourceIdleState`, `DataSourceLoadingState`, `DataSourceReadyState`, `DataSourceEmptyState`, `DataSourceErrorState` (lines 36-64) are absent from the export list in packages/core/src/index.ts:22-29, so consumers can only obtain them via `Extract<DataSourceRuntimeState, …>` (the package exposes only './').

**Files:** packages/core/src/types/data-source.ts, packages/core/src/index.ts

**Lines:** 10, 36, 22

**Recommended correction:** Fix the comment and, if a later orchestrator task must handle each state explicitly, also export the five state interfaces from packages/core/src/index.ts.

### 8. NOTE (confirmed) — The focused tests are not runnable through any configured command, and the commit also carries unrelated build-artifact churn.

**Evidence:** packages/core/package.json has no `test` script (only build/typecheck, lines 16-19) and the root package.json offers `test:json-renderer` only (line 17); datasource-contract.test.ts follows the existing ad-hoc runner convention of action-contract.test.ts, so it must be compiled and executed manually — consistent with 'no verification commands were configured for this task'. Five `tsconfig.tsbuildinfo` files (apps/builder, examples/json-renderer/dist-test, packages/components, packages/core, packages/renderer) are committed as part of this change.

**Files:** packages/core/package.json, packages/core/tsconfig.json, packages/core/tsconfig.tsbuildinfo

**Lines:** 16, 8

**Recommended correction:** Optionally add a `test:core` script (compile then `node dist/__tests__/datasource-contract.test.js`) so the focused schema tests can be executed by the orchestrator; leave the pre-existing tsbuildinfo tracking convention as-is to avoid unrelated churn.
