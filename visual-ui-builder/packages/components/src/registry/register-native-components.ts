import { cardDefinition, ComponentRegistry } from "@visual-ui/core";
import { registerButton } from "../button/register-button.js";
import { registerDropdown } from "../dropdown/register-dropdown.js";
import { registerInput } from "../input/register-input.js";
import { registerTable } from "../table/register-table.js";
import { registerUICard } from "../card/ui-card.js";
import { registerText } from "../text/register-text.js";
import {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} from "./native-component-registry.js";

export { registerButton, registerDropdown, registerInput, registerTable, registerText };

/**
 * Registers the Card component in both the metadata registry and the native
 * registry, then defines its custom element.
 *
 * Calling this function multiple times is safe: duplicate metadata and mapping
 * registrations are ignored, and the custom element definition is itself
 * guarded against re-definition.
 */
export function registerCard(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry()
): void {
  if (!metadataRegistry.lookup(cardDefinition.type)) {
    metadataRegistry.register(cardDefinition);
  }

  nativeRegistry.register(cardDefinition.type, "ui-card");

  registerUICard();
}

/**
 * Registers all native components supported by this package.
 *
 * Currently registers Card, Text, Button, Dropdown, Input, and Table. Other
 * components will be added here as their native implementations are introduced.
 */
export function registerNativeComponents(
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry = getNativeComponentRegistry()
): void {
  registerCard(metadataRegistry, nativeRegistry);
  registerText(metadataRegistry, nativeRegistry);
  registerButton(metadataRegistry, nativeRegistry);
  registerDropdown(metadataRegistry, nativeRegistry);
  registerInput(metadataRegistry, nativeRegistry);
  registerTable(metadataRegistry, nativeRegistry);
}
