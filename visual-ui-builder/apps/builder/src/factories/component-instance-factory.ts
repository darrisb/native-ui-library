import type {
  ComponentInstance,
  ComponentRegistry,
} from "@visual-ui/core";
import { validateComponentInstance } from "@visual-ui/components";

function generateInstanceId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(6, "0");
  return `inst-${timestamp}-${random}`;
}

function buildDefaultProperties(
  registry: ComponentRegistry,
  type: string
): Record<string, string | number | boolean> {
  const definition = registry.lookup(type);
  if (!definition) {
    return {};
  }

  const properties: Record<string, string | number | boolean> = {};
  for (const property of definition.properties) {
    if (property.defaultValue !== undefined) {
      properties[property.name] = property.defaultValue;
    }
  }
  return properties;
}

/**
 * Creates a validated component instance for the supplied type.
 *
 * Property defaults are read from the registered component metadata.
 *
 * @throws Error when the type is not registered or the resulting instance is
 *   invalid.
 */
export function createComponentInstance(
  type: string,
  registry: ComponentRegistry
): ComponentInstance {
  const definition = registry.lookup(type);
  if (!definition) {
    throw new Error(`Component type "${type}" is not registered.`);
  }

  const instance: ComponentInstance = {
    id: generateInstanceId(),
    type,
    properties: buildDefaultProperties(registry, type),
  };

  const errors = validateComponentInstance(instance, registry);
  if (errors.length > 0) {
    const messages = errors.map((error) => error.message).join("; ");
    throw new Error(`Invalid ${type} instance: ${messages}`);
  }

  return instance;
}
