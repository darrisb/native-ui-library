import type { ComponentAction } from "./action.js";
import type { Binding } from "./binding.js";
import type { DataSource } from "./data-source.js";

export interface ComponentInstance {
  /** Unique instance identifier. */
  readonly id: string;

  /** Component type identifier matching a registered definition. */
  readonly type: string;

  /** Editable property values keyed by property name. */
  readonly properties: Readonly<Record<string, string | number | boolean>>;

  /** Optional nested child instances. */
  readonly children?: readonly ComponentInstance[];

  /**
   * Optional declarative actions bound to the rendered element.
   *
   * When omitted the instance behaves exactly as before, preserving
   * import/export compatibility with legacy JSON. Each action is validated
   * against the shared action contracts; malformed, unknown, or unsafe actions
   * are rejected during validation.
   */
  readonly actions?: readonly ComponentAction[];

  /**
   * Optional declarative data source describing where this instance's data
   * comes from.
   *
   * When omitted the instance behaves exactly as before — it renders from
   * static properties alone — preserving import/export compatibility with
   * legacy JSON. The data source is a pure declaration; components never
   * fetch it themselves. A runtime orchestrator resolves the data source and
   * applies the instance's `bindings`.
   */
  readonly dataSource?: DataSource;

  /**
   * Optional declarative bindings mapping resolved data to render targets.
   *
   * When omitted the instance has no data-driven render slots. Each binding
   * names a target (e.g. `"options"` for a future Dropdown, `"rows"` for a
   * future Table) and an optional safe path into the resolved data. Bindings
   * are validated independently of the data source so malformed bindings are
   * flagged even when no data source is present.
   */
  readonly bindings?: readonly Binding[];
}
