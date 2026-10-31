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
 *   - An epoch counter is captured at the start of every resolve cycle and
 *     checked before mutating state, so a response that arrives after unmount
 *     (or after a re-mount of the same instance) is discarded rather than
 *     applied.
 *   - A per-runtime "mounted" set prevents duplicate concurrent requests for
 *     the same instance id, avoiding refetch loops on re-render.
 */

import type {
  ComponentInstance,
  DataSourceRuntimeState,
  MappedRecord,
  RestDataSource
} from "@visual-ui/core";
import { extractAndMapRecords, resolveResponsePath } from "@visual-ui/core";
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

export class DataSourceRuntime {
  private readonly fetchAdapter: RestFetchAdapter;
  private readonly bindingAdapters: DataBindingAdapterRegistry;
  private readonly mode: RendererMode | undefined;

  /**
   * Monotonic counter. Incremented on every {@link unmount}. Each resolve
   * cycle captures the value at its start and discards its work unless the
   * counter is unchanged when the async result arrives.
   */
  private epoch = 0;

  /** Instance ids currently mounted — guards against duplicate requests. */
  private readonly mounted = new Set<string>();

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
    const requestEpoch = this.epoch;
    this.setState(instance.id, element, { status: "loading" });

    void this.resolve(
      instance.id,
      dataSource,
      instance.bindings,
      element,
      requestEpoch
    );
  }

  /**
   * Tears down the runtime. Aborts every outstanding request and invalidates
   * all pending responses so nothing mutates state after teardown.
   */
  unmount(): void {
    this.epoch++;
    this.fetchAdapter.abortAll();
    this.mounted.clear();
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
    this.mounted.delete(instanceId);
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

  private isStale(requestEpoch: number, instanceId: string): boolean {
    return this.epoch !== requestEpoch || !this.mounted.has(instanceId);
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
    dataSource: RestDataSource,
    bindings: ComponentInstance["bindings"],
    element: HTMLElement,
    requestEpoch: number
  ): Promise<void> {
    let result: RestFetchResult<unknown>;
    try {
      result = await this.fetchAdapter.fetchJson(dataSource.url);
    } catch {
      // The adapter never throws, but guard defensively.
      return;
    }

    if (this.isStale(requestEpoch, instanceId)) {
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

    if (this.isStale(requestEpoch, instanceId)) {
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
      bindings,
      element,
      requestEpoch
    );
  }

  private applyBindings(
    instanceId: string,
    records: readonly MappedRecord[],
    bindings: ComponentInstance["bindings"],
    element: HTMLElement,
    requestEpoch: number
  ): void {
    if (this.isStale(requestEpoch, instanceId)) {
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

    if (this.isStale(requestEpoch, instanceId)) {
      return;
    }
    this.setState(instanceId, element, { status: "ready", data: records });
  }
}
