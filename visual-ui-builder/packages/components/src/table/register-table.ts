import { ComponentRegistry, tableDefinition } from "@visual-ui/core";
import {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} from "../registry/native-component-registry.js";
import { registerUITable } from "./ui-table.js";

/**
 * Registers the Table component in both the metadata registry and the native
 * registry, then defines its custom element.
 *
 * Calling this function multiple times is safe: duplicate metadata and mapping
 * registrations are ignored, and the custom element definition is itself
 * guarded against re-definition.
 */
export function registerTable(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry(),
): void {
  if (!metadataRegistry.lookup(tableDefinition.type)) {
    metadataRegistry.register(tableDefinition);
  }

  nativeRegistry.register(tableDefinition.type, "ui-table");

  registerUITable();
}
