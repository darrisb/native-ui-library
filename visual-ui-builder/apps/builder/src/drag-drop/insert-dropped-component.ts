import type { ComponentInstance, ComponentRegistry } from "@visual-ui/core";
import { createComponentInstance } from "../factories/component-instance-factory.ts";
import type { BuilderState } from "../state/builder-state.ts";

/**
 * Creates a new instance of `componentType` from registered metadata and inserts
 * it through builder state.
 *
 * When `parentId` is `null`, the instance is inserted at the document root.
 * Otherwise it is inserted as a child of the matching parent at `index`.
 * The newly created instance is selected on success.
 *
 * The canvas renders from document state, so no DOM is created here.
 *
 * @throws Error when the type is unregistered, the target is invalid, or the
 *   index is out of range. Nothing is inserted and selection is unchanged in
 *   that case.
 */
export function insertDroppedComponent(
  state: BuilderState,
  registry: ComponentRegistry,
  componentType: string,
  parentId: string | null,
  index: number
): ComponentInstance {
  const instance = createComponentInstance(componentType, registry);
  if (parentId === null) {
    state.insertRootInstance(instance, index, registry);
  } else {
    state.insertChildInstance(parentId, instance, index, registry);
  }
  state.selectInstance(instance.id);
  return instance;
}

/**
 * Moves an existing instance to a new location through builder state.
 *
 * When `parentId` is `null`, the instance is moved to the document root.
 * Otherwise it is moved under the matching parent at `index`. The moved
 * instance remains selected on success.
 *
 * The canvas renders from document state, so no DOM is changed here.
 *
 * @throws Error when the instance or target is invalid, or the index is out of
 *   range. The document is unchanged in that case.
 */
export function moveDroppedComponent(
  state: BuilderState,
  registry: ComponentRegistry,
  componentId: string,
  parentId: string | null,
  index: number
): void {
  state.moveComponent(componentId, parentId, index, registry);
  state.selectInstance(componentId);
}
