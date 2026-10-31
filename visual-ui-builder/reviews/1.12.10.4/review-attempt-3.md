# Review: 1.12.10.4 — Add data source runtime lifecycle

- **Reviewed commit:** a494904089d39450a9b93c74f79ab46f0217bb4c
- **Overall assessment:** conditional - The lifecycle core is implemented and well tested: mount-time loading/ready/empty/error transitions, epoch-based staleness invalidation on unmount, abortAll on teardown, adapter-registry based binding (no hardcoded dropdown network logic), and edit-mode network inertness verified at both runtime and renderer level. Secondary paths are weaker, though: the staleness guard has a per-instance remount race, the no-mapping case silently degrades to empty records, consumer adapter exceptions leave elements stuck in 'loading', and the new unmountInstance API is untested.
- **Execution status:** completed
- **Review attempt:** 3
- **Reviewed at:** 2026-10-29T23:52:45.183Z
- **Coding model:** opencode-go / longcat-2.0 (default variant)
- **Reviewer model:** opencode-go / qwen3.8-flash (default variant)
- **Review session:** ses_1a18a0f2f5cce3163e07476fe10
- **Token usage:** input 84, output 12205, reasoning 0, cache 416760, total —
- **Reported cost:** $0.021754

## Verification context

- exit code: 0
- timed out: no
- commands that passed: none configured

## Findings

### 1. MEDIUM (confirmed) — Per-instance staleness race: unmountInstance() removes the id from `mounted` but neither bumps the epoch nor aborts the in-flight request (its own docstring admits no per-instance abort exists). If mount() is called again for the same instance id before the earlier response arrives, the old request's late response passes the staleness check (epoch unchanged, `mounted.has(id)` is true again) and is applied against the NEW element, in addition to the new cycle's response — stale data can be bound and double application can occur. This contradicts the method comment 'The instance's pending response is invalidated on arrival'.

**Evidence:** packages/renderer/src/data-source/data-source-runtime.ts lines 174-177 (unmountInstance only clears mounted/states), lines 189-191 (isStale = epoch mismatch OR !mounted.has(id)), lines 139-144 (remount re-adds id under same epoch). Scenario: mount('A', el1) -> unmountInstance('A') -> mount('A', el2) -> el1's response arrives -> isStale false -> stale data applied.

**Files:** packages/renderer/src/data-source/data-source-runtime.ts

**Lines:** 160, 174, 189, 190

**Recommended correction:** Add a per-instance token (e.g., Map<string, number> bumped on mount/unmountInstance) checked in isStale alongside the global epoch, or retain a per-instance AbortController so unmountInstance can actually cancel the request.

### 2. MEDIUM (confirmed) — A data source without `mapping` produces useless records. The runtime calls extractAndMapRecords(data, responsePath, dataSource.mapping ?? {}); core's mapRecords with an empty mapping writes `mapped = {}` per source record (zero entries copied). A no-mapping REST source therefore yields records of empty objects: the zero-length 'empty' check does not trigger, status becomes 'ready', and adapters receive empty data. The contract marks mapping optional ('Optional field mapping applied to each extracted record'), so no-mapping sources silently degrade instead of passing records through.

**Evidence:** packages/renderer/src/data-source/data-source-runtime.ts lines 234-238 (`dataSource.mapping ?? {}`); packages/core/src/data/map-response-records.ts lines 133, 149-199 (empty `entries` -> `{}` per record); packages/core/src/types/data-source.ts lines 108-109 (mapping optional). No test in packages/renderer/src/__tests__/data-source-runtime.test.ts covers the omitted-mapping case (every fixture passes a mapping).

**Files:** packages/renderer/src/data-source/data-source-runtime.ts, packages/renderer/src/__tests__/data-source-runtime.test.ts

**Lines:** 234, 237

**Recommended correction:** Pass records through (shallow primitive-only copy) when `mapping` is undefined, or make mapping mandatory for REST mount loading and surface an error state; add a focused no-mapping test.

### 3. MEDIUM (likely) — No error containment around async work. `void this.resolve(...)` discards the promise; if a consumer-supplied binding adapter (a documented extension point of createBindingAdapterRegistry) throws, the rejection becomes an unhandled promise rejection, the element is stuck at `data-ds-status="loading"` forever, and the instance remains in `mounted` so it never retries. Likewise, the defensive catch around `fetchAdapter.fetchJson` simply returns without transitioning state, permanently stranding the instance in 'loading' — violating 'Maintain loading, success, empty and error states'.

**Evidence:** packages/renderer/src/data-source/data-source-runtime.ts lines 147-153 (`void this.resolve(...)`), lines 214-220 (catch -> bare `return`, no setState), lines 278-298 (adapter(element, data) invoked without try/catch).

**Files:** packages/renderer/src/data-source/data-source-runtime.ts

**Lines:** 147, 215, 297

**Recommended correction:** Wrap adapter invocations in try/catch and move to `{status:'error', message}` on throw; in the fetch catch path set the error state (or unmount the instance) rather than silently returning.

### 4. MEDIUM (likely) — The duplicate-requests vs. stale-data trade-off across re-renders is unresolved and untested. With the default per-tree runtime (renderComponent creates a fresh one per interactive render), every re-render of the same document re-fetches every data source (duplicate requests across renders), and abandoned trees keep fetching unless the caller remembers to call unmountDataSources on each previous root. With a shared runtime passed via options.dataSourceRuntime, re-mounting an already-mounted instance id is silently skipped — the new element gets neither bound data nor even the `loading` attribute, and no refresh path exists short of full unmount. Dedup is only guaranteed within a single render tree/runtime.

**Evidence:** packages/renderer/src/dom/render-component.ts lines 39-59 (new runtime per render unless provided), lines 176-181 (runtime stashed on root; nothing auto-tears down replaced trees); packages/renderer/src/data-source/data-source-runtime.ts lines 137-141 (mounted-set skip); packages/renderer/src/types/renderer-options.ts lines 36-43 (sharing caveat). No test exercises re-render with a shared runtime or verifies unmountDataSources is needed between renders.

**Files:** packages/renderer/src/dom/render-component.ts, packages/renderer/src/data-source/data-source-runtime.ts

**Lines:** 47, 139

**Recommended correction:** Key dedup on (instanceId + element) or re-apply cached records to a newly mounted element instead of skipping; document/test the intended preview re-render pattern (unmountDataSources before swapping roots).

### 5. LOW (confirmed) — Missing focused tests for new public API surface: `unmountInstance()` has zero coverage (and see finding 1); the default binding adapters (getDefaultBindingAdapterRegistry writing `data-bound-options`/`data-bound-rows`) are never exercised — tests override the registry, and the renderer integration test mounts an instance without bindings; the binding `path` narrowing branch is untested.

**Evidence:** packages/renderer/src/__tests__/data-source-runtime.test.ts contains no assertions referencing 'unmountInstance', 'data-bound-options', 'data-bound-rows', or a binding with `path`; packages/renderer/src/data-source/data-binding-adapter.ts lines 51-70 and data-source-runtime.ts lines 284-295 are consequently unverified.

**Files:** packages/renderer/src/__tests__/data-source-runtime.test.ts

**Recommended correction:** Add tests: unmountInstance followed by late response; default 'options'/'rows' adapters producing the documented attributes; a binding with `path` selecting/narrowing records.

### 6. LOW (confirmed) — defaultOptionsAdapter swallows mapping failures: if mapped records lack `label`/`value` fields, mapDropdownOptions fails and the adapter stores `[]` while the runtime still reports status 'ready' — silent data loss reported as success.

**Evidence:** packages/renderer/src/data-source/data-binding-adapter.ts lines 55-57: `const data: readonly DropdownOption[] = mapped.ok ? mapped.records : [];` with no failure signaling path back to the runtime.

**Files:** packages/renderer/src/data-source/data-binding-adapter.ts

**Lines:** 55, 56

**Recommended correction:** Extend the DataBindingAdapter contract to report failure (return value or thrown error handled by finding 3's try/catch) so the state can become 'error', or document the silent-empty behavior.

### 7. LOW (confirmed) — Integration pitfall: createRuntimeForTree returns a caller-provided runtime verbatim and ignores options.mode; the runtime's own construction-time `mode` gate decides inertness. A caller rendering with `mode: 'interactive'` but passing a runtime constructed without `mode: 'interactive'` gets a completely silent no-op (no fetch, no status attribute, no diagnostic).

**Evidence:** packages/renderer/src/dom/render-component.ts lines 46-49 (`return options.dataSourceRuntime;`) vs packages/renderer/src/data-source/data-source-runtime.ts lines 123-127 (mount short-circuits on `this.mode !== "interactive"`).

**Files:** packages/renderer/src/dom/render-component.ts, packages/renderer/src/data-source/data-source-runtime.ts

**Lines:** 47, 125

**Recommended correction:** Gate mount on the render call's effective mode (pass mode into mount, or validate that a provided runtime's mode matches options.mode).

### 8. NOTE (confirmed) — The commit includes regenerated tracked build artifacts (apps/builder/tsconfig.tsbuildinfo, packages/renderer/tsconfig.tsbuildinfo), producing large noisy diffs. This matches existing repo convention (the files were already tracked), so no action is required for this task.

**Evidence:** .orchestrator-review/changed-files.txt lines 1 and 10.

**Files:** apps/builder/tsconfig.tsbuildinfo, packages/renderer/tsconfig.tsbuildinfo

**Recommended correction:** Optionally untrack tsbuildinfo files in a separate housekeeping change.
