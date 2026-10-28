import { buttonDefinition, ComponentRegistry } from "@visual-ui/core";
import {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} from "../registry/native-component-registry.js";
import { registerUIButton } from "./ui-button.js";

/**
 * Registers the Button component in both the metadata registry and the native
 * registry, then defines its custom element.
 *
 * Calling this function multiple times is safe: duplicate metadata and mapping
 * registrations are ignored, and the custom element definition is itself
 * guarded against re-definition.
 */
export function registerButton(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry(),
): void {
  if (!metadataRegistry.lookup(buttonDefinition.type)) {
    metadataRegistry.register(buttonDefinition);
  }

  nativeRegistry.register(buttonDefinition.type, "ui-button");

  registerUIButton();
}
