import type { ComponentInstance } from "@visual-ui/core";
import { validateComponentInstance } from "@visual-ui/components";
import type { RendererOptions } from "../types/renderer-options.js";
import { applyComponentProperties } from "./apply-component-properties.js";

const MAX_DEPTH = 64;

function renderComponentInternal(
  instance: ComponentInstance,
  options: RendererOptions,
  seen: Set<ComponentInstance>,
  depth: number
): HTMLElement {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Cannot render component "${instance.type}" (id: ${instance.id}): maximum nesting depth exceeded.`
    );
  }

  if (seen.has(instance)) {
    throw new Error(
      `Cannot render component "${instance.type}" (id: ${instance.id}): cyclic reference detected in component tree.`
    );
  }

  seen.add(instance);

  try {
    const { metadataRegistry, nativeRegistry } = options;

    const validationErrors = validateComponentInstance(
      instance,
      metadataRegistry
    );
    if (validationErrors.length > 0) {
      const messages = validationErrors
        .map((error) => error.message)
        .join("; ");
      throw new Error(
        `Cannot render component "${instance.type}" (id: ${instance.id}): ${messages}`
      );
    }

    const tagName = nativeRegistry.lookupTag(instance.type);
    if (!tagName) {
      throw new Error(
        `Cannot render component "${instance.type}" (id: ${instance.id}): no native tag mapping registered.`
      );
    }

    if (
      typeof customElements !== "undefined" &&
      customElements.get(tagName) === undefined
    ) {
      throw new Error(
        `Cannot render component "${instance.type}" (id: ${instance.id}): custom element "${tagName}" is not defined.`
      );
    }

    const element = document.createElement(tagName);
    applyComponentProperties(element, instance);

    const children = instance.children ?? [];
    for (const child of children) {
      const childElement = renderComponentInternal(child, options, seen, depth + 1);
      element.appendChild(childElement);
    }

    return element;
  } finally {
    seen.delete(instance);
  }
}

export function renderComponent(
  instance: ComponentInstance,
  options: RendererOptions
): HTMLElement {
  return renderComponentInternal(instance, options, new Set(), 0);
}
