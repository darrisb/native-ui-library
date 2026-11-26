import { ComponentRegistry, inputDefinition } from "@visual-ui/core";
import {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} from "../registry/native-component-registry.js";
import { registerUIInput } from "./ui-input.js";

/**
 * Registers the Input component in both the metadata registry and the native
 * registry, then defines its custom element.
 *
 * Calling this function multiple times is safe: duplicate metadata and mapping
 * registrations are ignored, and the custom element definition is itself
 * guarded against re-definition.
 */
export function registerInput(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry(),
): void {
  if (!metadataRegistry.lookup(inputDefinition.type)) {
    metadataRegistry.register(inputDefinition);
  }

  nativeRegistry.register(inputDefinition.type, "ui-input");

  registerUIInput();
}
