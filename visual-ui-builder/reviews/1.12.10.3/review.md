# Review: 1.12.10.3 — Implement safe JSON response mapping

- **Reviewed commit:** ac9e7697931dc15976839e823c4849d6b3080a73
- **Overall assessment:** conditional - The new pure utilities (packages/core/src/data/resolve-response-path.ts, map-response-records.ts) are well-structured, non-throwing, and genuinely safe (grammar-validated paths, hasOwnProperty checks, blocked __proto__/constructor/prototype names, no eval/JSONPath, no data echoed in messages). Root/nested arrays, index accessors, dropdown value/type preservation and generic record mapping all meet the task requirements, and the exports integrate cleanly with the existing DataMapping/RestDataSource contracts (no overlap with the renderer's rest-fetch-adapter). Two gaps keep this from a clean pass: the 30 focused tests are not runnable through any configured command (packages/core has no `test` script and no verification was recorded, so they were never executed), and the 'missing array' error case required by the task is collapsed into the generic `invalid-record` code, losing the underlying path error code. Remaining items are minor API/consistency nits.
- **Execution status:** completed
- **Review attempt:** 1
- **Reviewed at:** 2026-10-29T14:07:46.247Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a187f6b84853edac80535159dd
- **Token usage:** input 102, output 13845, reasoning 0, cache 599698, total —
- **Reported cost:** $0.027338

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — The focused tests added by this task cannot be executed by any configured command. packages/core/package.json only defines `build` and `typecheck`; the root package.json has no aggregate `test` script, so `safe-response-mapping.test.ts` is never run (the recorded verification confirms: "no verification commands were configured for this task"). Every other package wires its tests (components `test`, renderer `test`, builder `test`, root `test:json-renderer`), so the new tests are effectively unverified evidence of correctness.

**Evidence:** packages/core/package.json lines 16-19 ("scripts": { "build": "tsc --build", "typecheck": "tsc --noEmit" }); contrast packages/components/package.json line 23 ("test": "node dist/__tests__/integration.test.js && ...") and packages/renderer/package.json lines 19-21. Test file: packages/core/src/__tests__/safe-response-mapping.test.ts (compiles to dist/__tests__/safe-response-mapping.test.js because core's tsconfig `include: ["src/**/*"]`).

**Files:** packages/core/package.json, packages/core/src/__tests__/safe-response-mapping.test.ts

**Lines:** 16, 17, 18, 19

**Recommended correction:** Add a `test` script for core following the existing convention, e.g. `"test": "npm run build && node dist/__tests__/safe-response-mapping.test.js"` (and wire the other orphaned core test files in a follow-up task), or add a root `test:core` script so the orchestrator can actually execute and verify these tests.

### 2. MEDIUM (confirmed) — The requirement "Return structured errors for missing array" is only partially met: extractAndMapRecords collapses every distinct failure into the single code `invalid-record`, discarding the specific ResolveResponsePathErrorCode (missing / not-an-object / not-an-array / index-out-of-range / invalid-path). A caller cannot programmatically distinguish "no collection at response path" (e.g. bad responsePath config) from "a row in the array is not an object", because the detail survives only inside the free-text message. `invalid-record` is also semantically misleading for a non-array payload root.

**Evidence:** packages/core/src/data/map-response-records.ts lines 277-295: both the `!resolved.ok` branch and the `!Array.isArray(resolved.value)` branch return `code: "invalid-record"` and only interpolate `resolved.error.message`. The MapRecordsErrorCode union (lines 19-27) has no `missing-array`/`not-an-array` member, unlike ResolveResponsePathErrorCode (resolve-response-path.ts lines 18-28) which does.

**Files:** packages/core/src/data/map-response-records.ts

**Lines:** 19, 20, 21, 22, 23, 24, 25, 26, 27, 277, 278, 279, 285, 286, 287, 288, 292

**Recommended correction:** Add a dedicated error code (e.g. `"missing-array"` or `"not-an-array"`) for the root-collection failure and propagate the underlying path failure (keep `code: "invalid-record"` only for non-object array elements). Consider carrying the underlying `ResolveResponsePathError` on the failure object (e.g. `cause`/`pathError`) so callers get both a stable code and the precise reason. Add tests for `extractAndMapRecords` with an invalid path, an out-of-range index and a missing property.

### 3. LOW (likely) — Asymmetric prototype-safety: blocked names are enforced only on the *read* side (source paths), not on the *write* side (mapping output keys). `mapped[outputField] = coerced` uses an arbitrary key taken straight from project JSON, so a mapping such as JSON.parse('{"__proto__":"name","value":"id"}') silently drops the `__proto__` field (the Object.prototype setter ignores primitive assignment, so no own key is created and no error is raised), while `constructor`/`prototype` keys create own properties on the emitted MappedRecord that shadow built-ins for downstream renderers. No actual pollution is reachable because only primitives are assigned, but it contradicts the module's stated safety contract and produces silent data loss.

**Evidence:** Read side guarded: packages/core/src/data/resolve-response-path.ts lines 58-62 (BLOCKED_PROPERTY_NAMES) and 171-173. Write side unguarded: packages/core/src/data/map-response-records.ts line 195 (`mapped[outputField] = coerced;`); the pre-validation loop (lines 136-147) checks only `sourcePath`, never `outputField`. The same gap exists in the upstream validator (packages/core/src/validation/validate-data-source.ts lines 111-118, which only rejects empty keys).

**Files:** packages/core/src/data/map-response-records.ts

**Lines:** 136, 137, 141, 168, 195

**Recommended correction:** Validate output field names in the pre-validation loop: reject empty/whitespace keys and reuse the blocked-name list (`__proto__`, `constructor`, `prototype`) with an `invalid-mapping` error. Alternatively build the output with a `Map`/`Object.create(null)` or use `Object.defineProperty` so emitted records are plain-data safe. Add a test with a `__proto__` mapping key from a JSON.parse'd mapping.

### 4. LOW (confirmed) — mapDropdownOptions' "missing label/value" handling reports a misleading `missing-field` error with no `index`, and does so inside the per-record loop even though the condition is purely a mapping-shape problem. When a caller passes a dropdown mapping whose output keys are not literally `label`/`value` (e.g. {text: "name", code: "id"}), the failure looks like a data error ("Field \"label\" is missing or null") even though the source data is fine.

**Evidence:** packages/core/src/data/map-response-records.ts lines 221-250: the `label === undefined || label === null` / `value === undefined ...` checks (which mapRecords already guarantees never fire for mapped keys) return `code: "missing-field"` with `field` but no `index`; repeated for every record. Tests codify the misleading code: packages/core/src/__tests__/safe-response-mapping.test.ts lines 455-475 assert `missing-field`.

**Files:** packages/core/src/data/map-response-records.ts, packages/core/src/__tests__/safe-response-mapping.test.ts

**Lines:** 221, 228, 231, 235, 241, 245, 455, 466

**Recommended correction:** Check `"label" in mapping` / `"value" in mapping` once, up front, and return `code: "invalid-mapping"` (or a new `"invalid-mapping"`-style code) with a message naming the required keys; alternatively accept explicit `{ labelPath, valuePath }` parameters so arbitrary source field names map to the fixed DropdownOption shape.

### 5. LOW (confirmed) — Inconsistent null handling: an explicit `null` source value fails the mapping (`missing-field`), but `NaN`/`Infinity` are silently converted to `null` by coercePrimitive and are accepted into the output, contradicting both the function doc ("NaN/Infinity become null") and mapRecords' doc ("A missing, null, or unsupported-type value on any record fails the entire mapping").

**Evidence:** packages/core/src/data/map-response-records.ts line 107 (`return Number.isFinite(value) ? value : null;`) versus lines 172-182 (null/undefined → `missing-field` failure) and lines 122-124 of the JSDoc.

**Files:** packages/core/src/data/map-response-records.ts

**Lines:** 96, 101, 107, 122, 123, 172, 183

**Recommended correction:** Return `undefined` from coercePrimitive for non-finite numbers so it produces a structured `unsupported-type` error, or document/allow `null` consistently and change the null-vs-missing precedence. Add a test covering a non-finite numeric value.

### 6. LOW (confirmed) — Boolean source values are silently stringified into DropdownOption.value (`true` → "true"), which does not match the requirement/doc phrasing "the value preserves its original JSON type — strings stay strings, numbers stay numbers". Also, an empty mapping object (`{}`) is accepted by mapRecords and yields records with no fields instead of a structured error, so a mis-configured data source surfaces only later (or renders blank rows).

**Evidence:** packages/core/src/data/map-response-records.ts lines 252-255 (`value: typeof value === "number" ? value : String(value)`) vs. doc lines 56-65 and 207-215; empty-mapping path: line 133 (`Object.entries(mapping)`) with no zero-entry guard, loop at lines 151-199 pushes `mapped = {}`.

**Files:** packages/core/src/data/map-response-records.ts

**Lines:** 60, 62, 133, 252, 253, 254

**Recommended correction:** Either narrow MappedRecord/coercePrimitive so dropdown values can only be string|number (reject booleans with `unsupported-type`) or update the DropdownOption docs to state that non-string/number primitives are stringified. Optionally return `invalid-mapping` when the mapping has no entries.

### 7. NOTE (confirmed) — parseResponsePath is exported from the package public API but performs no validation and silently degrades on malformed input (emits `{ key: "" }` segments, `NaN` indexes from `[]`/unclosed brackets, and drops trailing characters on unexpected input). It is safe through resolveResponsePath (grammar is validated first at line 162) and always terminates, but direct consumers lose the safety guarantee the module advertises.

**Evidence:** packages/core/src/data/resolve-response-path.ts lines 96-141 (notably 124-129: `Number.parseInt(rawIndex, 10)` with no NaN guard, and 114-115 pushing a possibly empty key); exported in packages/core/src/index.ts lines 57-60.

**Files:** packages/core/src/data/resolve-response-path.ts, packages/core/src/index.ts

**Lines:** 96, 114, 124, 126, 129, 57, 58

**Recommended correction:** Keep parseResponsePath module-private, or call `isValidDataPath` inside it and document/return an empty segment list for invalid paths; add a NaN-index guard in the resolver as defense in depth.

### 8. NOTE (likely) — Per-record, per-field re-validation and re-parsing of the same path strings: mapRecords already pre-validates every mapping path (lines 136-147), yet readRecordField → resolveResponsePath re-runs the SAFE_DATA_PATH_PATTERN regex and re-parses the path for every field of every record, so the regex + parse work is O(records x fields). For large API payloads this is avoidable repeated work in a function documented as a generic foundation for table rows.

**Evidence:** packages/core/src/data/map-response-records.ts lines 84-90 and 170-171; packages/core/src/data/resolve-response-path.ts lines 162-166.

**Files:** packages/core/src/data/map-response-records.ts, packages/core/src/data/resolve-response-path.ts

**Lines:** 84, 136, 162, 170

**Recommended correction:** Parse the mapping paths once (e.g. `const parsed = entries.map(([field, p]) => ({field, segments: parseResponsePath(p)}))`) and traverse with a small internal helper that accepts pre-parsed segments, leaving resolveResponsePath as the public single-path API.

### 9. NOTE (confirmed) — The commit ships regenerated TypeScript build caches (tsconfig.tsbuildinfo for core, components and renderer). The components/renderer entries are byte-huge single-line JSON churn that is only a side effect of core's declaration files changing; they were already tracked before this commit so this is consistent with existing practice, but it adds review noise unrelated to task 1.12.10.3.

**Evidence:** .orchestrator-review/changed-files.txt lines 1, 6, 7 (M packages/components/tsconfig.tsbuildinfo, M packages/core/tsconfig.tsbuildinfo, M packages/renderer/tsconfig.tsbuildinfo); diff hunks at .orchestrator-review/commit.diff lines 5-8, 1149-1152, 1158-1161 showing new fileNames entries `./src/data/resolve-response-path.ts`, `./src/data/map-response-records.ts` (which does confirm `tsc --build` completed successfully for the new sources).

**Files:** packages/core/tsconfig.tsbuildinfo, packages/components/tsconfig.tsbuildinfo, packages/renderer/tsconfig.tsbuildinfo

**Lines:** 1

**Recommended correction:** No change required for this task (the presence of the new files in the cache is useful evidence the build succeeded). If the orchestrator wants cleaner diffs later, consider untracking *.tsbuildinfo in a dedicated housekeeping task.
