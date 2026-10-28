export interface ComponentInstance {
  /** Unique instance identifier. */
  readonly id: string;

  /** Component type identifier matching a registered definition. */
  readonly type: string;

  /** Editable property values keyed by property name. */
  readonly properties: Readonly<Record<string, string | number | boolean>>;

  /** Optional nested child instances. */
  readonly children?: readonly ComponentInstance[];
}
