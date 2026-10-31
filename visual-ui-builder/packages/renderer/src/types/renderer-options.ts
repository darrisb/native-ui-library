import type { ComponentRegistry } from "@visual-ui/core";
import type { NativeComponentRegistry } from "@visual-ui/components";
import type { ActionExecutor } from "../action/execute-action.js";
import type { DataSourceRuntime } from "../data-source/data-source-runtime.js";
import type { DataBindingAdapterRegistry } from "../data-source/data-binding-adapter.js";

/**
 * Rendering mode for the component renderer.
 *
 * - `"edit"` (default): No action listeners are attached. Existing callers
 *   (e.g. the builder canvas) are unaffected and selection behavior is
 *   preserved.
 * - `"interactive"`: Configured action listeners are attached to rendered
 *   elements using the component definition's supported event metadata.
 */
export type RendererMode = "interactive" | "edit";

export interface RendererOptions {
  metadataRegistry: ComponentRegistry;
  nativeRegistry: NativeComponentRegistry;

  /**
   * Rendering mode. Defaults to `"edit"`, which attaches no action listeners
   * and preserves existing caller behavior.
   */
  readonly mode?: RendererMode;

  /**
   * Action executor used to dispatch actions in interactive mode. When omitted
   * in interactive mode, a default {@link ActionExecutor} is created.
   */
  readonly actionExecutor?: ActionExecutor;

  /**
   * Data source runtime used to resolve declarative data sources in
   * interactive mode. When omitted in interactive mode, a default
   * {@link DataSourceRuntime} is created per render tree.
   *
   * Sharing one runtime across multiple renders scopes that runtime's
   * in-flight request tracking and staleness epoch to those renders. For
   * independent trees, omit this and let each render create its own.
   */
  readonly dataSourceRuntime?: DataSourceRuntime;

  /**
   * Binding adapter registry mapping each binding target to an application
   * strategy. When omitted, the default registry (with adapters for
   * "options" and "rows") is used.
   */
  readonly dataSourceBindingAdapters?: DataBindingAdapterRegistry;
}
