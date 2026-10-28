import type { ComponentInstance, ComponentRegistry } from "@visual-ui/core";
import { validateComponentInstance } from "@visual-ui/components";
import {
  addRootInstance,
  findComponentById,
  insertChildInstanceAt,
  insertRootInstanceAt,
  moveComponentById,
  updateComponentById,
  type BuilderDocument,
} from "./builder-document.ts";

/** Listener notified whenever the builder document changes. */
export type DocumentChangeListener = (document: BuilderDocument) => void;

/** Listener notified whenever the selected instance changes. */
export type SelectionChangeListener = (
  selectedInstanceId: string | null
) => void;

/** Minimal immutable builder state with subscription support. */
export interface BuilderState {
  /** Returns the current document snapshot. */
  getDocument(): BuilderDocument;

  /**
   * Returns the id of the currently selected instance, if any.
   *
   * The id may reference a root-level instance or any nested component.
   */
  getSelectedInstanceId(): string | null;

  /**
   * Appends a root-level instance and notifies subscribers.
   *
   * The supplied instance is validated by the caller before being passed here.
   */
  addRootInstance(instance: ComponentInstance): void;

  /**
   * Inserts a root-level instance at `index` and notifies subscribers once.
   *
   * Only Card instances may be inserted at the root; other types are rejected.
   *
   * Index 0 inserts first and an index equal to the current length appends.
   * Existing instances keep their order and ids. Selection is not changed.
   *
   * @throws Error when the type is not allowed at the root, when the index is
   *   not an integer within `0..length`, when the instance fails validation
   *   against the registry, or when its id is already present. State is left
   *   untouched in every failure case.
   */
  insertRootInstance(
    instance: ComponentInstance,
    index: number,
    registry: ComponentRegistry
  ): void;

  /**
   * Inserts `instance` as a child of the instance matching `parentId` at
   * `index` and notifies subscribers once.
   *
   * The parent may be anywhere in the document tree. The parent must allow
   * children according to the metadata registry.
   *
   * @throws Error when the parent is not found, when the parent does not allow
   *   children, when the index is not an integer within `0..length`, when the
   *   instance fails validation, or when its id is already present. State is
   *   left untouched in every failure case.
   */
  insertChildInstance(
    parentId: string,
    instance: ComponentInstance,
    index: number,
    registry: ComponentRegistry
  ): void;

  /**
   * Selects an instance by id, or clears selection when `null`.
   *
   * The id may reference a root-level instance or any nested component.
   * Unknown ids are ignored. Re-selecting the current id is a no-op.
   */
  selectInstance(id: string | null): void;

  /**
   * Moves an existing instance to `targetParentId` at `targetIndex` and notifies
   * subscribers once.
   *
   * The instance may be anywhere in the document tree. When `targetParentId` is
   * `null`, the instance is moved to the document root. The target index is
   * interpreted after the instance is removed from its original location.
   *
   * Only Card instances may be moved to the root. The target parent must allow
   * children according to the metadata registry. Moving an instance into itself
   * or into one of its descendants is rejected.
   *
   * @throws Error when the instance or target parent is not found, when the
   *   destination does not accept children, when the type is not allowed at the
   *   root, when the index is out of range, or when the move would create a
   *   cycle. State is left untouched in every failure case.
   */
  moveComponent(
    componentId: string,
    targetParentId: string | null,
    targetIndex: number,
    registry: ComponentRegistry
  ): void;

  /**
   * Merges the supplied property patch into the instance's existing properties,
   * validates the result against the metadata registry, and updates the
   * document when validation succeeds.
   *
   * The instance may be anywhere in the document tree.
   *
   * @throws Error when the instance is not found or validation fails.
   */
  updateInstanceProperties(
    id: string,
    patch: Record<string, string | number | boolean>,
    registry: ComponentRegistry
  ): void;

  /**
   * Subscribes to document changes.
   * @returns A function that unsubscribes the listener.
   */
  subscribe(listener: DocumentChangeListener): () => void;

  /**
   * Subscribes to selection changes.
   * @returns A function that unsubscribes the listener.
   */
  subscribeToSelection(listener: SelectionChangeListener): () => void;
}

/** Creates a fresh builder state instance. */
export function createBuilderState(
  initialDocument: BuilderDocument = { rootInstances: [] }
): BuilderState {
  let document: BuilderDocument = initialDocument;
  let selectedInstanceId: string | null = null;
  const documentListeners = new Set<DocumentChangeListener>();
  const selectionListeners = new Set<SelectionChangeListener>();

  function notifyDocument(): void {
    for (const listener of documentListeners) {
      listener(document);
    }
  }

  function notifySelection(): void {
    for (const listener of selectionListeners) {
      listener(selectedInstanceId);
    }
  }

  return {
    getDocument(): BuilderDocument {
      return document;
    },

    getSelectedInstanceId(): string | null {
      return selectedInstanceId;
    },

    addRootInstance(instance: ComponentInstance): void {
      document = addRootInstance(document, instance);
      notifyDocument();
    },

    insertRootInstance(
      instance: ComponentInstance,
      index: number,
      registry: ComponentRegistry
    ): void {
      if (instance.type !== "card") {
        throw new Error(
          `Component type "${instance.type}" cannot be inserted at the document root; only Card is allowed.`
        );
      }

      const length = document.rootInstances.length;
      if (!Number.isInteger(index) || index < 0 || index > length) {
        throw new Error(
          `Invalid insertion index ${String(index)}; expected an integer from 0 to ${length}.`
        );
      }

      const errors = validateComponentInstance(instance, registry);
      if (errors.length > 0) {
        const messages = errors.map((error) => error.message).join("; ");
        throw new Error(`Invalid instance: ${messages}`);
      }

      if (findComponentById(document, instance.id) !== undefined) {
        throw new Error(`Instance "${instance.id}" already exists.`);
      }

      document = insertRootInstanceAt(document, instance, index);
      notifyDocument();
    },

    insertChildInstance(
      parentId: string,
      instance: ComponentInstance,
      index: number,
      registry: ComponentRegistry
    ): void {
      const parent = findComponentById(document, parentId);
      if (!parent) {
        throw new Error(`Parent instance "${parentId}" not found.`);
      }

      const parentDefinition = registry.lookup(parent.type);
      if (!parentDefinition || !parentDefinition.allowChildren) {
        throw new Error(
          `Component "${parent.type}" does not allow children.`
        );
      }

      const length = parent.children?.length ?? 0;
      if (!Number.isInteger(index) || index < 0 || index > length) {
        throw new Error(
          `Invalid insertion index ${String(index)}; expected an integer from 0 to ${length}.`
        );
      }

      const errors = validateComponentInstance(instance, registry);
      if (errors.length > 0) {
        const messages = errors.map((error) => error.message).join("; ");
        throw new Error(`Invalid instance: ${messages}`);
      }

      if (findComponentById(document, instance.id) !== undefined) {
        throw new Error(`Instance "${instance.id}" already exists.`);
      }

      document = insertChildInstanceAt(document, parentId, instance, index);
      notifyDocument();
    },

    moveComponent(
      componentId: string,
      targetParentId: string | null,
      targetIndex: number,
      registry: ComponentRegistry
    ): void {
      const instance = findComponentById(document, componentId);
      if (!instance) {
        throw new Error(`Instance "${componentId}" not found.`);
      }

      if (targetParentId !== null) {
        const targetParent = findComponentById(document, targetParentId);
        if (!targetParent) {
          throw new Error(`Target parent "${targetParentId}" not found.`);
        }

        const targetDefinition = registry.lookup(targetParent.type);
        if (!targetDefinition || !targetDefinition.allowChildren) {
          throw new Error(
            `Component "${targetParent.type}" does not allow children.`
          );
        }
      } else if (instance.type !== "card") {
        throw new Error(
          `Component type "${instance.type}" cannot be moved to the document root; only Card is allowed.`
        );
      }

      const beforeDocument = document;
      document = moveComponentById(
        document,
        componentId,
        targetParentId,
        targetIndex
      );

      if (document !== beforeDocument) {
        notifyDocument();
      }
    },

    selectInstance(id: string | null): void {
      if (id === selectedInstanceId) {
        return;
      }

      if (id !== null && findComponentById(document, id) === undefined) {
        return;
      }

      selectedInstanceId = id;
      notifySelection();
    },

    updateInstanceProperties(
      id: string,
      patch: Record<string, string | number | boolean>,
      registry: ComponentRegistry
    ): void {
      const target = findComponentById(document, id);
      if (!target) {
        throw new Error(`Instance "${id}" does not exist.`);
      }

      const updatedInstance: ComponentInstance = {
        ...target,
        properties: { ...target.properties, ...patch },
      };

      const errors = validateComponentInstance(updatedInstance, registry);
      if (errors.length > 0) {
        const messages = errors.map((error) => error.message).join("; ");
        throw new Error(`Invalid property update: ${messages}`);
      }

      document = updateComponentById(document, id, () => updatedInstance);
      notifyDocument();
    },

    subscribe(listener: DocumentChangeListener): () => void {
      documentListeners.add(listener);
      return () => {
        documentListeners.delete(listener);
      };
    },

    subscribeToSelection(listener: SelectionChangeListener): () => void {
      selectionListeners.add(listener);
      return () => {
        selectionListeners.delete(listener);
      };
    },
  };
}
