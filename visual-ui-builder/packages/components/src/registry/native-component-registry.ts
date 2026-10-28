/**
 * Maps component type identifiers to native custom-element tag names.
 *
 * This registry is intentionally separate from the core metadata registry so
 * that core can remain free of browser-specific APIs.
 */
export class NativeComponentRegistry {
  readonly #mappings = new Map<string, string>();

  /**
   * Associates a component type with a custom-element tag name.
   *
   * The same mapping may be registered repeatedly without error. Conflicting
   * mappings for a previously-registered type are rejected.
   */
  register(type: string, tagName: string): void {
    const existing = this.#mappings.get(type);
    if (existing !== undefined) {
      if (existing === tagName) {
        return;
      }
      throw new Error(
        `Component type "${type}" is already mapped to tag "${existing}". Cannot remap to "${tagName}".`
      );
    }
    this.#mappings.set(type, tagName);
  }

  /** Looks up the custom-element tag name for a component type, if any. */
  lookupTag(type: string): string | undefined {
    return this.#mappings.get(type);
  }

  /** Lists all registered type-to-tag mappings. */
  list(): Array<{ readonly type: string; readonly tagName: string }> {
    return Array.from(this.#mappings.entries()).map(([type, tagName]) => ({
      type,
      tagName,
    }));
  }
}

let sharedRegistry: NativeComponentRegistry | undefined;

/** Returns the shared native component registry, lazily creating it. */
export function getNativeComponentRegistry(): NativeComponentRegistry {
  if (!sharedRegistry) {
    sharedRegistry = new NativeComponentRegistry();
  }
  return sharedRegistry;
}
