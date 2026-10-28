import type { ComponentInstance } from "@visual-ui/core";
import { renderComponent } from "@visual-ui/renderer";
import type { RendererOptions } from "@visual-ui/renderer";

export interface RenderError {
  /** Instance id, when available. */
  readonly id?: string;

  /** Component type, when available. */
  readonly type?: string;

  /** Human-readable error message. */
  readonly message: string;
}

export interface RenderDocumentResult {
  /** Rendered native elements when no errors occurred. */
  readonly elements: HTMLElement[];

  /** Errors encountered during rendering. */
  readonly errors: RenderError[];
}

/**
 * Validates the top-level shape of a JSON document.
 *
 * The document must be an array. Each entry must be an object with a non-empty
 * string `id`, a non-empty string `type`, and an object `properties`.
 *
 * @throws Error when the document shape is invalid.
 */
export function validateDocumentShape(document: unknown): ComponentInstance[] {
  if (!Array.isArray(document)) {
    throw new Error("Document must be an array of component instances.");
  }

  for (let index = 0; index < document.length; index++) {
    const entry = document[index];
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Document entry at index ${index} must be an object.`);
    }

    const instance = entry as Record<string, unknown>;
    const id = instance.id;
    const type = instance.type;

    if (typeof id !== "string" || id.length === 0) {
      throw new Error(
        `Document entry at index ${index} must have a non-empty "id" string.`
      );
    }

    if (typeof type !== "string" || type.length === 0) {
      throw new Error(
        `Document entry at index ${index} (id: ${id}) must have a non-empty "type" string.`
      );
    }

    const properties = instance.properties;
    if (
      properties === null ||
      typeof properties !== "object" ||
      Array.isArray(properties)
    ) {
      throw new Error(
        `Document entry at index ${index} (id: ${id}, type: ${type}) must have a "properties" object.`
      );
    }
  }

  return document as ComponentInstance[];
}

/**
 * Renders every root instance in the document into native elements.
 *
 * The complete document is validated and rendered before anything is appended
 * to the DOM by the caller. If any instance fails to render, no elements are
 * returned so that a partially rendered page is never produced.
 */
export function renderDocument(
  document: unknown,
  options: RendererOptions
): RenderDocumentResult {
  const instances = validateDocumentShape(document);
  const elements: HTMLElement[] = [];
  const errors: RenderError[] = [];

  for (const instance of instances) {
    try {
      const element = renderComponent(instance, options);
      elements.push(element);
    } catch (error) {
      errors.push({
        id: instance.id,
        type: instance.type,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    return { elements: [], errors };
  }

  return { elements, errors };
}
