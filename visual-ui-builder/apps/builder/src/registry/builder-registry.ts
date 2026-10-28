import { ComponentRegistry } from "@visual-ui/core";
import { registerSampleDefinitions } from "@visual-ui/core";
import type { NativeComponentRegistry } from "@visual-ui/components";
import {
  registerCard,
  registerText,
  registerButton,
} from "@visual-ui/components";

/**
 * Shared component metadata registry for the builder application.
 *
 * Only core metadata is registered here. Browser custom elements are registered
 * separately through {@link registerBuilderNativeComponents} so the same
 * metadata registry can be imported by parts of the app that do not need native
 * tag mappings or custom element definitions.
 */
export const builderComponentRegistry = new ComponentRegistry();
registerSampleDefinitions(builderComponentRegistry);

/**
 * Registers all supported native component tag mappings and custom element
 * definitions on the supplied native registry.
 *
 * This is the single builder-side entry point for native registration. It
 * delegates to the shared component registration utilities and is called by
 * the app shell before the canvas renders.
 */
export function registerBuilderNativeComponents(
  nativeRegistry: NativeComponentRegistry
): void {
  registerCard(builderComponentRegistry, nativeRegistry);
  registerText(builderComponentRegistry, nativeRegistry);
  registerButton(builderComponentRegistry, nativeRegistry);
}
