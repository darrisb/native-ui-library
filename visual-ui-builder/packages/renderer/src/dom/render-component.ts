import type { ComponentDefinition, ComponentInstance } from "@visual-ui/core";
import { validateComponentInstance } from "@visual-ui/components";
import { ActionExecutor } from "../action/execute-action.js";
import type { RendererMode, RendererOptions } from "../types/renderer-options.js";
import { applyComponentProperties } from "./apply-component-properties.js";
import { bindActionEvents } from "./bind-action-events.js";
import {
  DataSourceRuntime,
  type DataBindingAdapterRegistry
} from "../data-source/index.js";

const MAX_DEPTH = 64;

/**
 * Key under which the per-tree data source runtime is stored on the rendered
 * root element so it can later be torn down via {@link unmountDataSources}.
 */
const RUNTIME_KEY = "__uiDataSourceRuntime";

/**
 * Shared executor used across a single renderComponent call tree. Created lazily
 * so edit-mode renders (the default) never instantiate one.
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

/**
 * Shared data source runtime used across a single renderComponent call tree.
 * Created lazily so edit-mode renders (the default) never instantiate one and
 * therefore never issue network requests.
 */
function createRuntimeForTree(
  options: RendererOptions,
  mode: string | undefined
): DataSourceRuntime | null {
  if (mode !== "interactive") {
    return null;
  }

  if (options.dataSourceRuntime) {
    return options.dataSourceRuntime;
  }

  const runtimeOptions: { mode?: RendererMode; bindingAdapters?: DataBindingAdapterRegistry } = {
    mode: options.mode,
  };
  if (options.dataSourceBindingAdapters) {
    runtimeOptions.bindingAdapters = options.dataSourceBindingAdapters;
  }

  return new DataSourceRuntime(runtimeOptions);
}

function renderComponentInternal(
  instance: ComponentInstance,
  options: RendererOptions,
  executor: ActionExecutor | null,
  runtime: DataSourceRuntime | null,
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
      bindActionEvents(
        element,
        instance,
        definition,
        executor,
        options.mode ?? "edit"
      );
    }

    // In interactive mode, resolve declarative data sources for this instance.
    // In edit mode (the default) this is a no-op, keeping the builder canvas
    // network-inert. Interactive preview/export renders may load data.
    if (runtime) {
      runtime.mount(instance, element);
    }

    const children = instance.children ?? [];
    for (const child of children) {
      const childElement = renderComponentInternal(
        child,
        options,
        executor,
        runtime,
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
  const runtime = createRuntimeForTree(options, options.mode);
  const root = renderComponentInternal(
    instance,
    options,
    executor,
    runtime,
    new Set(),
    0
  );

  // Stash the runtime on the root element so the tree can be torn down later
  // (abort outstanding requests, invalidate stale responses) via
  // unmountDataSources. No-op in edit mode where no runtime exists.
  if (runtime) {
    (root as unknown as Record<string, unknown>)[RUNTIME_KEY] = runtime;
  }

  return root;
}

/**
 * Tears down the data source runtime associated with a rendered root element,
 * aborting any outstanding requests and invalidating pending responses so that
 * stale arrivals are ignored. Safe to call even when no runtime is attached
 * (e.g. an edit-mode render) or after a previous unmount.
 *
 * @param root  The root element returned by {@link renderComponent}.
 */
export function unmountDataSources(root: HTMLElement): void {
  const runtime = (root as unknown as Record<string, unknown>)[RUNTIME_KEY] as
    | DataSourceRuntime
    | undefined;
  if (!runtime) {
    return;
  }
  runtime.unmount();
  delete (root as unknown as Record<string, unknown>)[RUNTIME_KEY];
}
