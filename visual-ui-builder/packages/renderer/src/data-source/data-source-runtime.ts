/**
 * Data source runtime lifecycle for the renderer.
 *
 * Connects declarative {@link DataSource} contracts to the renderer lifecycle:
 * fetch (via {@link RestFetchAdapter}) -> extract+map (via core's
 * {@link extractAndMapRecords}) -> bind (via a target-agnostic
 * {@link DataBindingAdapter}).
 *
 * Lifecycle:
 *   - {@link DataSourceRuntime.mount} resolves a component instance's data
 *     source when it is rendered in interactive mode with `loadOn: "mount"`.
 *   - {@link DataSourceRuntime.unmount} aborts every in-flight request and
 *     invalidates pending responses so late arrivals are ignored.
 *
 * Edit mode is network-inert: {@link DataSourceRuntime.mount} short-circuits
 * before any fetch, keeping the builder canvas free of network activity.
 *
 * Concurrency / correctness:
 *   - A global epoch counter is captured at the start of every resolve cycle
 *     and checked before mutating state, so a response that arrives after
 *     unmount is discarded rather than applied.
 *   - A per-instance request counter invalidates the instance's earlier
 *     in-flight response whenever a newer resolve cycle starts (e.g. after
 *     {@link DataSourceRuntime.updateQuery}), so a slow older response can
 *     never overwrite a newer one.
 *   - A per-runtime "mounted" set prevents duplicate concurrent requests for
 *     the same instance id, avoiding refetch loops on re-render.
 *
 * Query parameters:
 *   - A mounted REST instance keeps a mutable copy of its data source's
 *     declarative `query`. Every resolve cycle fetches the URL built from
 *     that copy via {@link buildRestUrl}.
 *   - {@link DataSourceRuntime.updateQuery} merges changes (a `null` value
 *     removes a key) into that copy and re-fetches exactly once.
 *   - Mounted table instances (`<ui-table>`) additionally have their
 *     `page-change` and `sort-change` events wired to {@link
 *     DataSourceRuntime.updateQuery}, so paging and sorting re-fetch the
 *     backing endpoint.
 *
 * Filter links:
 *   - A dropdown or input that declares `filterTarget` (an instance id) and
 *     a valid `filterField` re-queries the target table on its `change`
 *     event — plus `submit` for inputs — via {@link
 *     DataSourceRuntime.updateQuery} with `eq.<field>` or
 *     `contains.<field>` and the offset reset to the first page. An empty
 *     value removes the filter key while still resetting the table to its
 *     first page.
 *   - Keystrokes on an input never fetch: only the `change` and `submit`
 *     events are wired, so filtering fires on commit, not on every key.
 *   - Filter wiring is independent of the control's own data source, and a
 *     target that is not (yet) mounted is a harmless no-op via
 *     {@link DataSourceRuntime.updateQuery}.
 */

import type {
  ComponentInstance,
  DataSourceRuntimeState,
  MappedRecord,
  RestDataSource
} from "@visual-ui/core";
import {
  buildRestUrl,
  extractAndMapRecords,
  isValidFilterField,
  resolveResponsePath
} from "@visual-ui/core";
import {
  createRestFetchAdapter,
  type RestFetchAdapter,
  type RestFetchResult
} from "./rest-fetch-adapter.js";
import {
  getDefaultBindingAdapterRegistry,
  type DataBindingAdapterRegistry
} from "./data-binding-adapter.js";
import type { RendererMode } from "../types/renderer-options.js";

/** Options for constructing a {@link DataSourceRuntime}. */
export interface DataSourceRuntimeOptions {
  /**
   * Fetch adapter. A dedicated adapter per runtime scopes
   * {@link RestFetchAdapter.abortAll} to this runtime's requests. Defaults to
   * a fresh adapter backed by `globalThis.fetch`.
   */
  readonly fetchAdapter?: RestFetchAdapter;

  /**
   * Binding adapter registry mapping each binding target to an application
   * strategy. Defaults to the shared registry with adapters for "options" and
   * "rows".
   */
  readonly bindingAdapters?: DataBindingAdapterRegistry;

  /**
   * Renderer mode. When not `"interactive"`, every {@link DataSourceRuntime.mount}
   * is a no-op so the builder canvas stays network-inert.
   */
  readonly mode?: RendererMode;
}

/** Constant-time check that a value is a plain primitive record. */
function isMappedRecord(value: unknown): value is MappedRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      return false;
    }
  }
  return true;
}

/** Per-instance bookkeeping for a mounted REST data source. */
interface MountedInstanceContext {
  /** The REST data source this instance resolved. */
  readonly dataSource: RestDataSource;
  /** Bindings the resolved records are applied to. */
  readonly bindings: ComponentInstance["bindings"];
  /** The rendered element the state and bindings are applied to. */
  readonly element: HTMLElement;
  /**
   * Mutable query state for this instance. Starts as a copy of the data
   * source's declarative `query`; {@link DataSourceRuntime.updateQuery}
   * merges changes into it.
   */
  query: Record<string, string>;
  /**
   * Detaches the table event listeners attached at mount (present only for
   * mounted table instances). Called on teardown.
   */
  detachTableListeners?: () => void;
}

export class DataSourceRuntime {
  private readonly fetchAdapter: RestFetchAdapter;
  private readonly bindingAdapters: DataBindingAdapterRegistry;
  private readonly mode: RendererMode | undefined;

  /**
   * Global monotonic counter. Incremented on every {@link unmount}. Each
   * resolve cycle captures the value at its start and discards its work
   * unless the counter is unchanged when the async result arrives.
   */
  private epoch = 0;

  /** Instance ids currently mounted — guards against duplicate requests. */
  private readonly mounted = new Set<string>();

  /** Bookkeeping per mounted REST instance (query state, element, ...). */
  private readonly instances = new Map<string, MountedInstanceContext>();

  /**
   * Per-instance monotonic request counter. Every new resolve cycle for an
   * instance bumps it; in-flight responses started under an earlier value
   * are stale and ignored.
   */
  private readonly instanceEpochs = new Map<string, number>();

  /**
   * Detach functions for filter-component listeners, keyed by instance id.
   * Present for dropdown/input instances that declare a filter link —
   * whether or not the control carries its own data source. Called on
   * teardown (or when the same instance is mounted onto a new element).
   */
  private readonly filterListeners = new Map<string, () => void>();

  /** Latest runtime state per mounted instance id (for introspection/tests). */
  private readonly states = new Map<string, DataSourceRuntimeState>();

  constructor(options: DataSourceRuntimeOptions = {}) {
    this.fetchAdapter = options.fetchAdapter ?? createRestFetchAdapter();
    this.bindingAdapters =
      options.bindingAdapters ?? getDefaultBindingAdapterRegistry();
    this.mode = options.mode;
  }

  /**
   * Begins the fetch -> map -> bind lifecycle for one rendered instance.
   *
   * No-op when:
   *   - the runtime is not in interactive mode (builder edit canvas), or
   *   - the instance has no data source, or
   *   - the data source does not request loading on mount, or
   *   - the instance is already mounted in this runtime.
   *
   * @param instance  The component instance carrying an optional data source.
   * @param element   The rendered native element the data will be bound to.
   */
  mount(instance: ComponentInstance, element: HTMLElement): void {
    // Keep the builder edit canvas network-inert.
    if (this.mode !== "interactive") {
      return;
    }

    // Filter links are wired before the data source checks below because a
    // filter control (dropdown/input) usually has no data source of its own —
    // it only updates the query of the table it targets.
    const detachFilterListeners = this.attachFilterListeners(instance, element);
    if (detachFilterListeners) {
      // Re-mounting the same instance (e.g. after a re-render) replaces the
      // previous listeners instead of stacking duplicates on a stale element.
      this.filterListeners.get(instance.id)?.();
      this.filterListeners.set(instance.id, detachFilterListeners);
    }

    const dataSource = instance.dataSource;
    if (!dataSource) {
      return;
    }
    if (dataSource.type !== "rest" || dataSource.loadOn !== "mount") {
      return;
    }

    // Idempotent: never issue a second request for an instance that is already
    // mounted, preventing refetch loops across re-renders.
    if (this.mounted.has(instance.id)) {
      return;
    }

    this.mounted.add(instance.id);
    const context: MountedInstanceContext = {
      dataSource,
      bindings: instance.bindings,
      element,
      // Mutable copy: runtime query state never mutates the declarative source.
      query: { ...(dataSource.query ?? {}) },
    };

    // Tables re-fetch when the user pages or sorts, so wire their events into
    // updateQuery. Other component types fetch once on mount only.
    if (instance.type === "table") {
      context.detachTableListeners = this.attachTableListeners(
        instance.id,
        element
      );
    }

    this.instances.set(instance.id, context);
    this.startResolve(instance.id);
  }

  /**
   * Updates a mounted instance's query parameters and re-fetches exactly once.
   *
   * `changes` maps parameter names to their new values; a `null` value removes
   * the key. Changes merge into the instance's current query state (which
   * started as a copy of the data source's declarative `query`). Unknown
   * instance ids are ignored, so stale or foreign callers are harmless.
   */
  updateQuery(
    instanceId: string,
    changes: Readonly<Record<string, string | null>>
  ): void {
    const context = this.instances.get(instanceId);
    if (!context) {
      return;
    }

    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        delete context.query[key];
      } else {
        context.query[key] = value;
      }
    }

    this.startResolve(instanceId);
  }

  /**
   * Tears down the runtime. Aborts every outstanding request and invalidates
   * all pending responses so nothing mutates state after teardown.
   */
  unmount(): void {
    this.epoch++;
    this.fetchAdapter.abortAll();
    for (const context of this.instances.values()) {
      context.detachTableListeners?.();
    }
    for (const detach of this.filterListeners.values()) {
      detach();
    }
    this.filterListeners.clear();
    this.mounted.clear();
    this.instances.clear();
    this.instanceEpochs.clear();
    this.states.clear();
  }

  /**
   * Tears down a single instance. The instance's pending response is
   * invalidated on arrival (it will fail the staleness check) and the instance
   * is removed from the mounted set. The runtime's adapter is shared, so a
   * per-instance abort is not possible here; use {@link unmount} for a full
   * abort.
   */
  unmountInstance(instanceId: string): void {
    const context = this.instances.get(instanceId);
    if (context) {
      context.detachTableListeners?.();
    }
    this.filterListeners.get(instanceId)?.();
    this.filterListeners.delete(instanceId);
    this.mounted.delete(instanceId);
    this.instances.delete(instanceId);
    this.instanceEpochs.delete(instanceId);
    this.states.delete(instanceId);
  }

  /** Returns the latest runtime state for an instance, or `undefined`. */
  getState(instanceId: string): DataSourceRuntimeState | undefined {
    return this.states.get(instanceId);
  }

  /** True when an instance is currently mounted in this runtime. */
  isMounted(instanceId: string): boolean {
    return this.mounted.has(instanceId);
  }

  /**
   * True when a resolve cycle is stale: the runtime (or the instance) was
   * torn down, or a newer resolve cycle for the same instance has started
   * (bumping its per-instance counter).
   */
  private isStale(
    requestEpoch: number,
    instanceId: string,
    instanceEpoch: number
  ): boolean {
    return (
      this.epoch !== requestEpoch ||
      !this.mounted.has(instanceId) ||
      this.instanceEpochs.get(instanceId) !== instanceEpoch
    );
  }

  /**
   * Starts one fetch -> map -> bind cycle for a mounted instance using its
   * current query state. Bumps the instance's request counter first so any
   * in-flight response from an earlier cycle becomes stale and is ignored on
   * arrival.
   */
  private startResolve(instanceId: string): void {
    const context = this.instances.get(instanceId);
    if (!context) {
      return;
    }

    const requestEpoch = this.epoch;
    const instanceEpoch = (this.instanceEpochs.get(instanceId) ?? 0) + 1;
    this.instanceEpochs.set(instanceId, instanceEpoch);

    this.setState(instanceId, context.element, { status: "loading" });
    void this.resolve(instanceId, context, requestEpoch, instanceEpoch);
  }

  /**
   * Wires a mounted table element's `page-change` and `sort-change` events
   * into {@link DataSourceRuntime.updateQuery}, so paging and sorting re-fetch
   * the backing endpoint with the new query parameters. Returns the detach
   * function the runtime calls on teardown.
   */
  private attachTableListeners(
    instanceId: string,
    element: HTMLElement
  ): () => void {
    const onPageChange = (event: Event): void => {
      const detail = (event as CustomEvent).detail as
        | { offset?: unknown; limit?: unknown }
        | null
        | undefined;
      if (detail === null || typeof detail !== "object") {
        return;
      }
      const changes: Record<string, string> = {};
      if (typeof detail.limit === "number" && Number.isFinite(detail.limit)) {
        changes.limit = String(detail.limit);
      }
      if (typeof detail.offset === "number" && Number.isFinite(detail.offset)) {
        changes.offset = String(detail.offset);
      }
      if (Object.keys(changes).length === 0) {
        return;
      }
      this.updateQuery(instanceId, changes);
    };

    const onSortChange = (event: Event): void => {
      const detail = (event as CustomEvent).detail as
        | { sort?: unknown }
        | null
        | undefined;
      if (
        detail === null ||
        typeof detail !== "object" ||
        typeof detail.sort !== "string" ||
        detail.sort.length === 0
      ) {
        return;
      }
      // The table resets its own page on a sort, so the host reloads from the
      // first page to stay in sync (see the <ui-table> event contract).
      this.updateQuery(instanceId, { sort: detail.sort, offset: "0" });
    };

    element.addEventListener("page-change", onPageChange);
    element.addEventListener("sort-change", onSortChange);

    return () => {
      element.removeEventListener("page-change", onPageChange);
      element.removeEventListener("sort-change", onSortChange);
    };
  }

  /**
   * Wires a filter component (dropdown or input) to a target table's query
   * state.
   *
   * When the instance declares a non-empty `filterTarget` and a valid
   * `filterField`, the control's `change` event — plus `submit` for inputs —
   * calls {@link DataSourceRuntime.updateQuery} on the target with
   * `eq.<field>` or `contains.<field>` and the offset reset to `"0"` (a new
   * filter starts from the first page). An empty value removes the filter
   * key while still resetting the target to its first page.
   *
   * Only the commit events are wired — an input's `input` event fires on
   * every keystroke and deliberately does not fetch.
   *
   * Returns a detach function, or `null` when the instance is not a filter
   * component or its filter properties are absent or invalid. Malformed
   * documents are ignored rather than rejected here: validation runs before
   * rendering, and a target that is never mounted makes
   * {@link DataSourceRuntime.updateQuery} a harmless no-op.
   */
  private attachFilterListeners(
    instance: ComponentInstance,
    element: HTMLElement
  ): (() => void) | null {
    if (instance.type !== "dropdown" && instance.type !== "input") {
      return null;
    }

    const properties = instance.properties;
    const filterTarget = properties.filterTarget;
    const filterField = properties.filterField;
    if (typeof filterTarget !== "string" || filterTarget.length === 0) {
      return null;
    }
    if (!isValidFilterField(filterField)) {
      return null;
    }

    // `contains` is only valid on inputs (the document validator enforces
    // this); anything else falls back to the default mode.
    const filterMode = properties.filterMode === "contains" ? "contains" : "eq";
    const filterKey = `${filterMode}.${filterField}`;

    const onFilter = (event: Event): void => {
      const detail = (event as CustomEvent).detail as
        | { value?: unknown }
        | null
        | undefined;
      if (detail === null || typeof detail !== "object") {
        return;
      }
      // Trimmed: a whitespace-only entry counts as clearing the filter.
      const value =
        typeof detail.value === "string" ? detail.value.trim() : "";
      if (value.length === 0) {
        // Empty value removes only the filter key for the column. Clearing a
        // filter is still a query change, so restart the table at page one.
        this.updateQuery(filterTarget, { [filterKey]: null, offset: "0" });
      } else {
        // A new filter starts from the first page of the result set.
        this.updateQuery(filterTarget, { [filterKey]: value, offset: "0" });
      }
    };

    // Inputs also fire on submit (Enter); keystrokes (the `input` event)
    // never fetch.
    const eventTypes =
      instance.type === "input" ? ["change", "submit"] : ["change"];
    for (const type of eventTypes) {
      element.addEventListener(type, onFilter);
    }

    return () => {
      for (const type of eventTypes) {
        element.removeEventListener(type, onFilter);
      }
    };
  }

  private setState(
    instanceId: string,
    element: HTMLElement,
    state: DataSourceRuntimeState
  ): void {
    this.states.set(instanceId, state);
    element.setAttribute("data-ds-status", state.status);
    if (state.status === "error") {
      element.setAttribute("data-ds-error", state.message);
    } else {
      element.removeAttribute("data-ds-error");
    }
  }

  private async resolve(
    instanceId: string,
    context: MountedInstanceContext,
    requestEpoch: number,
    instanceEpoch: number
  ): Promise<void> {
    const { dataSource, element } = context;
    let result: RestFetchResult<unknown>;
    try {
      result = await this.fetchAdapter.fetchJson(
        buildRestUrl(dataSource.url, context.query)
      );
    } catch {
      // The adapter never throws, but guard defensively.
      return;
    }

    if (this.isStale(requestEpoch, instanceId, instanceEpoch)) {
      return;
    }

    if (!result.ok) {
      this.setState(instanceId, element, {
        status: "error",
        message: result.error.message,
      });
      return;
    }

    const mapped = extractAndMapRecords(
      result.data,
      dataSource.responsePath,
      dataSource.mapping ?? {}
    );

    if (this.isStale(requestEpoch, instanceId, instanceEpoch)) {
      return;
    }

    if (!mapped.ok) {
      this.setState(instanceId, element, {
        status: "error",
        message: mapped.error.message,
      });
      return;
    }

    if (mapped.records.length === 0) {
      this.setState(instanceId, element, { status: "empty" });
      return;
    }

    this.applyBindings(
      instanceId,
      mapped.records,
      context.bindings,
      element,
      requestEpoch,
      instanceEpoch
    );
  }

  private applyBindings(
    instanceId: string,
    records: readonly MappedRecord[],
    bindings: ComponentInstance["bindings"],
    element: HTMLElement,
    requestEpoch: number,
    instanceEpoch: number
  ): void {
    if (this.isStale(requestEpoch, instanceId, instanceEpoch)) {
      return;
    }

    const bindingList = bindings ?? [];
    for (const binding of bindingList) {
      const adapter = this.bindingAdapters.get(binding.target);
      if (!adapter) {
        continue;
      }

      let data: readonly MappedRecord[] = records;
      if (binding.path) {
        const resolved = resolveResponsePath(records, binding.path);
        if (resolved.ok && Array.isArray(resolved.value)) {
          data = resolved.value.filter(isMappedRecord);
        } else if (resolved.ok && isMappedRecord(resolved.value)) {
          data = [resolved.value];
        } else {
          // Path resolution failed or yielded a non-record; skip this binding.
          continue;
        }
      }

      adapter(element, data);
    }

    if (this.isStale(requestEpoch, instanceId, instanceEpoch)) {
      return;
    }
    this.setState(instanceId, element, { status: "ready", data: records });
  }
}
