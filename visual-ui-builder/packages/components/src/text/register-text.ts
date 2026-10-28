import { ComponentRegistry, textDefinition } from "@visual-ui/core";
import {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} from "../registry/native-component-registry.js";
import { registerUIText } from "./ui-text.js";

/**
 * Registers the Text component in both the metadata registry and the native
 * registry, then defines its custom element.
 *
 * Calling this function multiple times is safe: duplicate metadata and mapping
 * registrations are ignored, and the custom element definition is itself
 * guarded against re-definition.
 */
export function registerText(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry(),
): void {
  if (!metadataRegistry.lookup(textDefinition.type)) {
    metadataRegistry.register(textDefinition);
  }

  nativeRegistry.register(textDefinition.type, "ui-text");

  registerUIText();
}
