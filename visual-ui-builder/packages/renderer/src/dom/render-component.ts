import type { ComponentDefinition, ComponentInstance } from "@visual-ui/core";
import { validateComponentInstance } from "@visual-ui/components";
import { ActionExecutor } from "../action/execute-action.js";
import type { RendererOptions } from "../types/renderer-options.js";
import { applyComponentProperties } from "./apply-component-properties.js";
import { bindActionEvents } from "./bind-action-events.js";

const MAX_DEPTH = 64;

/**
 * Shared executor used across a single renderComponent call tree. Created
 * lazily so edit-mode renders (the default) never instantiate one.
 */
function createExecutorForTree(
  options: RendererOptions,
  mode: string | undefined
): ActionExecutor | null {
  if (mode !== "interactive") {
    return null;
  }
  return options.actionExecutor ?? new ActionExecutor();
}

function renderComponentInternal(
  instance: ComponentInstance,
  options: RendererOptions,
  executor: ActionExecutor | null,
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

    // Resolve the definition for event metadata lookup. Done after property
    // application so listener wiring is independent of attribute mapping.
    const definition: ComponentDefinition | undefined =
      metadataRegistry.lookup(instance.type);

    // In interactive mode, attach declarative action listeners. In edit mode
    // (the default) this is a no-op, preserving existing caller behavior.
    if (executor) {
      bindActionEvents(element, instance, definition, executor, options.mode);
    }

    const children = instance.children ?? [];
    for (const child of children) {
      const childElement = renderComponentInternal(
        child,
        options,
        executor,
        seen,
        depth + 1
      );
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
  const executor = createExecutorForTree(options, options.mode);
  return renderComponentInternal(
    instance,
    options,
    executor,
    new Set(),
    0
  );
}
