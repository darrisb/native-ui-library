/**
 * Binding adapter contract for applying resolved data to rendered elements.
 *
 * The data source runtime never hardcodes component-specific (e.g. dropdown /
 * table) fetch or binding logic. It resolves data generically — fetch, then
 * extract+map — and delegates application to an adapter registered for each
 * binding target. This keeps the fetch -> map -> bind pipeline target-agnostic
 * while letting each component type interpret the mapped records in its own
 * way, and lets consumers extend it with custom targets without touching the
 * runtime.
 *
 * A future Dropdown registers an adapter for the "options" target; a future
 * Table registers one for "rows". Neither exists yet, so default adapters
 * store the resolved records on the element for downstream consumption.
 */

import { mapDropdownOptions } from "@visual-ui/core";
import type {
  BindingTarget,
  DropdownOption,
  MappedRecord
} from "@visual-ui/core";

/**
 * Applies resolved, mapped records to a rendered element for a binding target.
 *
 * The runtime guarantees `records` are already extracted from the response
 * (via `responsePath`) and mapped (via the data source `mapping`) to a stable
 * `MappedRecord[]` shape. The adapter is responsible for interpreting those
 * records for its target — e.g. projecting label/value for an "options"
 * target, or passing rows through unchanged for a "rows" target.
 */
export type DataBindingAdapter = (
  element: HTMLElement,
  records: readonly MappedRecord[]
) => void;

/** Lookup of binding target -> adapter. */
export interface DataBindingAdapterRegistry {
  get(target: BindingTarget): DataBindingAdapter | undefined;
}

/**
 * Default adapter for the "options" target.
 *
 * Expects each mapped record to carry `label` and `value` fields — the
 * convention a Dropdown's data source mapping projects to. Projects the
 * records to {@link DropdownOption}s and stores them on the element so a
 * future Dropdown component can consume them.
 */
function defaultOptionsAdapter(
  element: HTMLElement,
  records: readonly MappedRecord[]
): void {
  const mapped = mapDropdownOptions(records, { label: "label", value: "value" });
  const data: readonly DropdownOption[] = mapped.ok ? mapped.records : [];
  element.setAttribute("data-bound-options", JSON.stringify(data));
}

/**
 * Default adapter for the "rows" target.
 *
 * Stores the mapped records directly; a future Table component consumes them.
 */
function defaultRowsAdapter(
  element: HTMLElement,
  records: readonly MappedRecord[]
): void {
  element.setAttribute("data-bound-rows", JSON.stringify(records));
}

const DEFAULT_ADAPTERS: ReadonlyMap<BindingTarget, DataBindingAdapter> =
  new Map<BindingTarget, DataBindingAdapter>([
    ["options", defaultOptionsAdapter],
    ["rows", defaultRowsAdapter],
  ]);

/**
 * Creates a {@link DataBindingAdapterRegistry}. Callers may override individual
 * target adapters; unregistered targets resolve to `undefined`, which the
 * runtime skips gracefully.
 */
export function createBindingAdapterRegistry(
  overrides: Partial<Record<BindingTarget, DataBindingAdapter>> = {}
): DataBindingAdapterRegistry {
  const adapters = new Map<BindingTarget, DataBindingAdapter>(DEFAULT_ADAPTERS);
  for (const [target, adapter] of Object.entries(overrides)) {
    adapters.set(target as BindingTarget, adapter);
  }
  return {
    get(target: BindingTarget): DataBindingAdapter | undefined {
      return adapters.get(target);
    },
  };
}

let defaultRegistry: DataBindingAdapterRegistry | null = null;

/** Shared default registry. */
export function getDefaultBindingAdapterRegistry(): DataBindingAdapterRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createBindingAdapterRegistry();
  }
  return defaultRegistry;
}
