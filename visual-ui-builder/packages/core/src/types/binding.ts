/**
 * Declarative binding contracts for component instances.
 *
 * A binding describes *where* resolved data source output should be delivered
 * on a component instance. The named `target` identifies the render slot the
 * data populates (e.g. the options list of a future Dropdown, the rows of a
 * future Table). Components do not fetch or bind themselves — a runtime
 * orchestrator resolves the data source and applies bindings.
 *
 * All data is plain serializable data so instances survive JSON round-tripping
 * for import/export.
 */

/**
 * Named render slots that resolved data can populate.
 *
 * Declared as a closed union so that typos in project JSON are caught during
 * validation. New targets are added here as components declare data-driven
 * slots in later tasks.
 */
export type BindingTarget =
  /** Options list for a future Dropdown component. */
  | "options"
  /** Row collection for a future Table component. */
  | "rows";

/**
 * A single declarative binding from a resolved data source to a render target.
 *
 * `target` names the slot to populate. `path` optionally narrows the data to a
 * sub-section using the safe path grammar (see {@link isValidDataPath}); when
 * omitted the entire resolved data set is delivered to the target.
 */
export interface Binding {
  /** The render target this binding populates. */
  readonly target: BindingTarget;

  /**
   * Optional safe path into the resolved data. When omitted the whole resolved
   * data set (after `responsePath` / `mapping` are applied) is bound.
   */
  readonly path?: string;
}
