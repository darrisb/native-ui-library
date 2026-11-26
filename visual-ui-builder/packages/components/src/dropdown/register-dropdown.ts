import { ComponentRegistry, dropdownDefinition } from "@visual-ui/core";
import {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} from "../registry/native-component-registry.js";
import { registerUIDropdown } from "./ui-dropdown.js";

/**
 * Registers the Dropdown component in both the metadata registry and the native
 * registry, then defines its custom element.
 *
 * Calling this function multiple times is safe: duplicate metadata and mapping
 * registrations are ignored, and the custom element definition is itself
 * guarded against re-definition.
 */
export function registerDropdown(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry(),
): void {
  if (!metadataRegistry.lookup(dropdownDefinition.type)) {
    metadataRegistry.register(dropdownDefinition);
  }

  nativeRegistry.register(dropdownDefinition.type, "ui-dropdown");

  registerUIDropdown();
}
