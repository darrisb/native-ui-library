import type { ComponentInstance } from "@visual-ui/core";
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
export declare function validateDocumentShape(document: unknown): ComponentInstance[];
/**
 * Renders every root instance in the document into native elements.
 *
 * The complete document is validated and rendered before anything is appended
 * to the DOM by the caller. If any instance fails to render, no elements are
 * returned so that a partially rendered page is never produced.
 */
export declare function renderDocument(document: unknown, options: RendererOptions): RenderDocumentResult;
//# sourceMappingURL=renderer.d.ts.map