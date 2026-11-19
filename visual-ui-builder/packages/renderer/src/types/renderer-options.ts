import type { ComponentRegistry } from "@visual-ui/core";
import type { NativeComponentRegistry } from "@visual-ui/components";
import type { ActionExecutor } from "../action/execute-action.js";

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
}
