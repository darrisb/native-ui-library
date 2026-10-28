import type { ComponentDefinition } from "../types/component-definition.js";

export class ComponentRegistry {
  readonly #definitions = new Map<string, ComponentDefinition>();

  /**
   * Registers a component definition.
   * @throws Error if a definition with the same type identifier is already registered.
   */
  register(definition: ComponentDefinition): void {
    if (this.#definitions.has(definition.type)) {
      throw new Error(
        `Component type "${definition.type}" is already registered.`
      );
    }
    this.#definitions.set(definition.type, definition);
  }

  /** Looks up a definition by its type identifier. */
  lookup(type: string): ComponentDefinition | undefined {
    return this.#definitions.get(type);
  }

  /** Lists all registered definitions. */
  list(): ComponentDefinition[] {
    return Array.from(this.#definitions.values());
  }

  /** Filters registered definitions by category. */
  filterByCategory(category: string): ComponentDefinition[] {
    return this.list().filter(
      (definition) => definition.category === category
    );
  }
}
