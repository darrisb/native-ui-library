import type { ComponentAction } from "./action.js";

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
}
