import type { ComponentAction, ComponentInstance, ComponentRegistry, DataSource } from "@visual-ui/core";
import { validateComponentInstance } from "@visual-ui/components";
import {
  addRootInstance,
  findComponentById,
  insertChildInstanceAt,
  insertRootInstanceAt,
  moveComponentById,
  removeComponentById,
  updateComponentById,
  type BuilderDocument,
} from "./builder-document.ts";
import { createDocumentHistory } from "./document-history.ts";

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
   * Removes the instance matching `componentId` together with its entire
   * descendant subtree and notifies document subscribers exactly once.
   *
   * When the currently selected instance is the deleted instance or one of its
   * descendants, selection is cleared and selection subscribers are notified.
   * Unrelated selection is preserved and no selection notification is emitted.
   *
   * If the instance is not found, the state is left untouched and no
   * subscribers are notified.
   */
  deleteComponent(componentId: string): void;

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
   * Replaces the entire action list on the instance matching `id`, validates
   * the result against the metadata registry, and updates the document when
   * validation succeeds.
   *
   * The instance may be anywhere in the document tree. The full replacement
   * (rather than a per-field patch) keeps action validation atomic: invalid
   * intermediate states are never persisted, and undo/redo restores the exact
   * previous action set.
   *
   * @throws Error when the instance is not found or validation fails.
   */
  updateInstanceActions(
    id: string,
    actions: ComponentAction[],
    registry: ComponentRegistry
  ): void;

  /**
   * Replaces the entire data source on the instance matching `id`, validates
   * the result against the metadata registry, and updates the document when
   * validation succeeds.
   *
   * The instance may be anywhere in the document tree. The full replacement
   * (rather than a per-field patch) keeps data source validation atomic:
   * invalid intermediate states are never persisted, and undo/redo restores the
   * exact previous data source.
   *
   * Pass `undefined` to clear the data source (revert to static rendering).
   *
   * @throws Error when the instance is not found or validation fails.
   */
  updateInstanceDataSource(
    id: string,
    dataSource: DataSource | undefined,
    registry: ComponentRegistry
  ): void;

  /**
   * Reverts the most recent document mutation and notifies subscribers once.
   *
   * When the currently selected instance does not exist in the restored
   * document, selection is cleared and selection subscribers are notified.
   * Unrelated selection is preserved. If there is nothing to undo, state is
   * left untouched and no subscribers are notified.
   */
  undo(): void;

  /**
   * Re-applies the most recently undone mutation and notifies subscribers once.
   *
   * When the currently selected instance does not exist in the restored
   * document, selection is cleared and selection subscribers are notified.
   * Unrelated selection is preserved. If there is nothing to redo, state is
   * left untouched and no subscribers are notified.
   */
  redo(): void;

  /** Returns true when at least one undo operation is available. */
  canUndo(): boolean;

  /** Returns true when at least one redo operation is available. */
  canRedo(): boolean;

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
  let history = createDocumentHistory(initialDocument);
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

  /**
   * Records a new document in history after a successful mutation.
   *
   * The history module ignores identical references, so this is safe to call
   * after every mutation.
   */
  function recordHistory(nextDocument: BuilderDocument): void {
    history = history.record(nextDocument);
  }

  /**
   * Restores the document and selection from the supplied history snapshot.
   *
   * If the snapshot's present document matches the current document reference,
   * no changes are made and no subscribers are notified. Otherwise, the document
   * is replaced, selection is validated against the restored document, and
   * subscribers are notified exactly once for each changed channel.
   */
  function restoreFromHistory(
    nextHistory: typeof history
  ): void {
    if (nextHistory.present === document) {
      return;
    }

    const nextDocument = nextHistory.present;
    const previousSelection = selectedInstanceId;

    document = nextDocument;
    history = nextHistory;

    if (
      previousSelection !== null &&
      findComponentById(nextDocument, previousSelection) === undefined
    ) {
      selectedInstanceId = null;
      notifySelection();
    }

    notifyDocument();
  }

  return {
    getDocument(): BuilderDocument {
      return document;
    },

    getSelectedInstanceId(): string | null {
      return selectedInstanceId;
    },

    addRootInstance(instance: ComponentInstance): void {
      const nextDocument = addRootInstance(document, instance);
      document = nextDocument;
      recordHistory(nextDocument);
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

      const nextDocument = insertRootInstanceAt(document, instance, index);
      document = nextDocument;
      recordHistory(nextDocument);
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

      const nextDocument = insertChildInstanceAt(document, parentId, instance, index);
      document = nextDocument;
      recordHistory(nextDocument);
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
      const nextDocument = moveComponentById(
        document,
        componentId,
        targetParentId,
        targetIndex
      );

      if (nextDocument === beforeDocument) {
        return;
      }

      document = nextDocument;
      recordHistory(nextDocument);
      notifyDocument();
    },

    deleteComponent(componentId: string): void {
      const beforeDocument = document;
      const afterDocument = removeComponentById(document, componentId);

      if (afterDocument === beforeDocument) {
        return;
      }

      document = afterDocument;
      recordHistory(afterDocument);

      if (
        selectedInstanceId !== null &&
        findComponentById(document, selectedInstanceId) === undefined
      ) {
        selectedInstanceId = null;
        notifySelection();
      }

      notifyDocument();
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

      const nextDocument = updateComponentById(document, id, () => updatedInstance);
      document = nextDocument;
      recordHistory(nextDocument);
      notifyDocument();
    },

    updateInstanceActions(
      id: string,
      actions: ComponentAction[],
      registry: ComponentRegistry
    ): void {
      const target = findComponentById(document, id);
      if (!target) {
        throw new Error(`Instance "${id}" does not exist.`);
      }

      const updatedInstance: ComponentInstance = {
        ...target,
        actions,
      };

      const errors = validateComponentInstance(updatedInstance, registry);
      if (errors.length > 0) {
        const messages = errors.map((error) => error.message).join("; ");
        throw new Error(`Invalid action update: ${messages}`);
      }

      const nextDocument = updateComponentById(document, id, () => updatedInstance);
      document = nextDocument;
      recordHistory(nextDocument);
      notifyDocument();
    },

    updateInstanceDataSource(
      id: string,
      dataSource: DataSource | undefined,
      registry: ComponentRegistry
    ): void {
      const target = findComponentById(document, id);
      if (!target) {
        throw new Error(`Instance "${id}" does not exist.`);
      }

      const updatedInstance: ComponentInstance = {
        ...target,
        dataSource,
      };

      const errors = validateComponentInstance(updatedInstance, registry);
      if (errors.length > 0) {
        const messages = errors.map((error) => error.message).join("; ");
        throw new Error(`Invalid data source update: ${messages}`);
      }

      const nextDocument = updateComponentById(document, id, () => updatedInstance);
      document = nextDocument;
      recordHistory(nextDocument);
      notifyDocument();
    },

    undo(): void {
      restoreFromHistory(history.undo());
    },

    redo(): void {
      restoreFromHistory(history.redo());
    },

    canUndo(): boolean {
      return history.canUndo;
    },

    canRedo(): boolean {
      return history.canRedo;
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
