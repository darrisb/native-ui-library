import type { ComponentInstance } from "@visual-ui/core";

/**
 * Immutable builder document containing the root-level component instances
 * rendered on the canvas.
 */
export interface BuilderDocument {
  /** Root-level component instances in insertion order. */
  readonly rootInstances: readonly ComponentInstance[];
}

/**
 * Finds a component instance anywhere in the document tree by its id.
 *
 * Searches root instances and all nested children recursively. Returns
 * `undefined` when no matching instance exists.
 */
export function findComponentById(
  document: BuilderDocument,
  id: string
): ComponentInstance | undefined {
  function search(
    instances: readonly ComponentInstance[]
  ): ComponentInstance | undefined {
    for (const instance of instances) {
      if (instance.id === id) {
        return instance;
      }

      const children = instance.children ?? [];
      if (children.length > 0) {
        const found = search(children);
        if (found) {
          return found;
        }
      }
    }

    return undefined;
  }

  return search(document.rootInstances);
}

/**
 * Returns a new document with the instance matching the supplied id replaced
 * by the result of the update function.
 *
 * The search recurses through nested children. If no matching instance exists,
 * the original document is returned unchanged. Sibling order, parent-child
 * relationships, and unrelated instance object references are preserved. The
 * original document and instance objects are not mutated.
 */
export function updateComponentById(
  document: BuilderDocument,
  id: string,
  update: (instance: ComponentInstance) => ComponentInstance
): BuilderDocument {
  function updateInstances(
    instances: readonly ComponentInstance[]
  ): readonly ComponentInstance[] {
    let changed = false;

    const updated = instances.map((instance) => {
      if (instance.id === id) {
        changed = true;
        return update(instance);
      }

      const children = instance.children ?? [];
      if (children.length === 0) {
        return instance;
      }

      const updatedChildren = updateInstances(children);
      if (updatedChildren === children) {
        return instance;
      }

      changed = true;
      return { ...instance, children: updatedChildren };
    });

    return changed ? updated : instances;
  }

  const updatedRoots = updateInstances(document.rootInstances);
  if (updatedRoots === document.rootInstances) {
    return document;
  }

  return { ...document, rootInstances: updatedRoots };
}

/** Creates a new empty builder document. */
export function createEmptyBuilderDocument(): BuilderDocument {
  return { rootInstances: [] };
}

/**
 * Returns a new document with the supplied instance appended to the root level.
 *
 * The original document is not mutated.
 */
export function addRootInstance(
  document: BuilderDocument,
  instance: ComponentInstance
): BuilderDocument {
  return {
    ...document,
    rootInstances: [...document.rootInstances, instance],
  };
}

/**
 * Returns a new document with the supplied instance inserted at the given
 * root-level position. Index 0 inserts first; an index equal to the current
 * length appends.
 *
 * The caller is responsible for supplying an index within `0..length`. The
 * original document is not mutated.
 */
export function insertRootInstanceAt(
  document: BuilderDocument,
  instance: ComponentInstance,
  index: number
): BuilderDocument {
  return {
    ...document,
    rootInstances: [
      ...document.rootInstances.slice(0, index),
      instance,
      ...document.rootInstances.slice(index),
    ],
  };
}

/**
 * Returns a new document with the supplied instance inserted as a child of the
 * instance matching `parentId` at the given index.
 *
 * The parent is located recursively through the document tree. The parent's
 * existing children are preserved and the new instance is inserted without
 * mutating the original document or any unrelated instance objects.
 *
 * @throws Error when the parent is not found.
 */
export function insertChildInstanceAt(
  document: BuilderDocument,
  parentId: string,
  instance: ComponentInstance,
  index: number
): BuilderDocument {
  function insertInInstances(
    instances: readonly ComponentInstance[]
  ): { updated: readonly ComponentInstance[]; found: boolean } {
    for (let i = 0; i < instances.length; i++) {
      const current = instances[i];
      if (current.id === parentId) {
        const children = current.children ?? [];
        const newChildren = [
          ...children.slice(0, index),
          instance,
          ...children.slice(index),
        ];
        const updatedParent: ComponentInstance = { ...current, children: newChildren };
        return {
          updated: [
            ...instances.slice(0, i),
            updatedParent,
            ...instances.slice(i + 1),
          ],
          found: true,
        };
      }

      const children = current.children ?? [];
      if (children.length === 0) {
        continue;
      }

      const result = insertInInstances(children);
      if (result.found) {
        return {
          updated: [
            ...instances.slice(0, i),
            { ...current, children: result.updated },
            ...instances.slice(i + 1),
          ],
          found: true,
        };
      }
    }

    return { updated: instances, found: false };
  }

  const result = insertInInstances(document.rootInstances);
  if (!result.found) {
    throw new Error(`Parent instance "${parentId}" not found.`);
  }

  return { ...document, rootInstances: result.updated };
}

export interface ComponentLocation {
  /** The id of the parent containing the instance, or `null` when it is a root. */
  readonly parentId: string | null;
  /** The index of the instance within its parent's children. */
  readonly index: number;
}

interface LocatedInstance extends ComponentLocation {
  /** The array that contains the located instance (either roots or a parent's children). */
  readonly parentInstances: readonly ComponentInstance[];
  /** The id of the parent containing the instance, or `null` when it is a root. */
  readonly parentId: string | null;
  /** The index of the instance within `parentInstances`. */
  readonly index: number;
  /** The located instance itself. */
  readonly instance: ComponentInstance;
}

/**
 * Returns the parent id and index of the instance matching `id`, or `undefined`
 * when the instance is not found.
 */
export function findComponentLocationById(
  document: BuilderDocument,
  id: string
): ComponentLocation | undefined {
  const found = locateComponent(document.rootInstances, null, id);
  if (!found) {
    return undefined;
  }
  return { parentId: found.parentId, index: found.index };
}

function locateComponent(
  instances: readonly ComponentInstance[],
  parentId: string | null,
  id: string
): LocatedInstance | undefined {
  for (let index = 0; index < instances.length; index++) {
    const instance = instances[index];
    if (instance.id === id) {
      return { parentInstances: instances, parentId, index, instance };
    }

    const children = instance.children ?? [];
    if (children.length > 0) {
      const found = locateComponent(children, instance.id, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/**
 * Returns true when `candidateId` identifies an instance that is the same as or
 * a descendant of `ancestorId` within the document tree.
 */
function isDescendantOf(
  document: BuilderDocument,
  ancestorId: string,
  candidateId: string
): boolean {
  if (candidateId === ancestorId) {
    return true;
  }

  const ancestor = findComponentById(document, ancestorId);
  if (!ancestor) {
    return false;
  }

  function search(instances: readonly ComponentInstance[]): boolean {
    for (const instance of instances) {
      if (instance.id === candidateId) {
        return true;
      }
      const children = instance.children ?? [];
      if (children.length > 0 && search(children)) {
        return true;
      }
    }
    return false;
  }

  const children = ancestor.children ?? [];
  return search(children);
}

/**
 * Returns a new document with the instance matching `componentId` removed from
 * its current location.
 *
 * If the instance is not found, the original document is returned unchanged.
 */
function removeComponentById(
  document: BuilderDocument,
  componentId: string
): { document: BuilderDocument; removed: ComponentInstance | undefined } {
  const location = locateComponent(document.rootInstances, null, componentId);
  if (!location) {
    return { document, removed: undefined };
  }

  if (location.parentId === null) {
    const rootInstances = document.rootInstances.filter(
      (instance) => instance.id !== componentId
    );
    return {
      document: { ...document, rootInstances },
      removed: location.instance,
    };
  }

  const parentId = location.parentId;

  function removeFromInstances(
    instances: readonly ComponentInstance[]
  ): { updated: readonly ComponentInstance[]; removed: boolean } {
    for (let i = 0; i < instances.length; i++) {
      const current = instances[i];
      if (current.id === parentId) {
        const children = current.children ?? [];
        const newChildren = children.filter(
          (child) => child.id !== componentId
        );
        const updatedParent: ComponentInstance = { ...current, children: newChildren };
        return {
          updated: [
            ...instances.slice(0, i),
            updatedParent,
            ...instances.slice(i + 1),
          ],
          removed: true,
        };
      }

      const children = current.children ?? [];
      if (children.length === 0) {
        continue;
      }

      const result = removeFromInstances(children);
      if (result.removed) {
        return {
          updated: [
            ...instances.slice(0, i),
            { ...current, children: result.updated },
            ...instances.slice(i + 1),
          ],
          removed: true,
        };
      }
    }

    return { updated: instances, removed: false };
  }

  const result = removeFromInstances(document.rootInstances);
  return { document: { ...document, rootInstances: result.updated }, removed: location.instance };
}

/**
 * Moves an existing component instance to a new location in the document tree.
 *
 * The instance is removed from its original location and inserted at
 * `targetIndex` within `targetParentId` (or the document root when
 * `targetParentId` is `null`). `targetIndex` is interpreted in the destination
 * after the source has been removed, so callers do not need to adjust indices
 * for same-parent moves.
 *
 * The instance, its id, its properties, and its entire subtree are preserved.
 * The original document is not mutated.
 *
 * Moving the instance to the exact position it already occupies returns the
 * original document unchanged. Invalid moves throw an error and leave the
 * supplied document untouched.
 */
export function moveComponentById(
  document: BuilderDocument,
  componentId: string,
  targetParentId: string | null,
  targetIndex: number
): BuilderDocument {
  const source = locateComponent(document.rootInstances, null, componentId);
  if (!source) {
    throw new Error(`Instance "${componentId}" not found.`);
  }

  if (targetParentId !== null) {
    const targetParent = findComponentById(document, targetParentId);
    if (!targetParent) {
      throw new Error(`Target parent "${targetParentId}" not found.`);
    }

    if (targetParent.id === componentId) {
      throw new Error(`Cannot move instance "${componentId}" into itself.`);
    }

    if (isDescendantOf(document, componentId, targetParentId)) {
      throw new Error(
        `Cannot move instance "${componentId}" into one of its descendants.`
      );
    }
  }

  const destinationLength =
    targetParentId === null
      ? source.parentId === null
        ? document.rootInstances.length - 1
        : document.rootInstances.length
      : source.parentId === targetParentId
        ? (findComponentById(document, targetParentId)?.children?.length ?? 0) - 1
        : findComponentById(document, targetParentId)?.children?.length ?? 0;

  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex > destinationLength
  ) {
    throw new Error(
      `Invalid insertion index ${String(targetIndex)}; expected an integer from 0 to ${destinationLength}.`
    );
  }

  if (source.parentId === targetParentId && targetIndex === source.index) {
    return document;
  }

  const { document: documentWithoutSource, removed } = removeComponentById(
    document,
    componentId
  );
  if (!removed) {
    throw new Error(`Instance "${componentId}" not found.`);
  }

  if (targetParentId === null) {
    return insertRootInstanceAt(documentWithoutSource, removed, targetIndex);
  }

  return insertChildInstanceAt(
    documentWithoutSource,
    targetParentId,
    removed,
    targetIndex
  );
}

/**
 * Returns a new document with the root-level instance matching the supplied id
 * replaced by the result of the update function.
 *
 * If no matching instance exists, the original document is returned unchanged.
 * The original document and instance objects are not mutated.
 */
export function updateRootInstance(
  document: BuilderDocument,
  id: string,
  update: (instance: ComponentInstance) => ComponentInstance
): BuilderDocument {
  const index = document.rootInstances.findIndex((instance) => instance.id === id);
  if (index === -1) {
    return document;
  }

  const rootInstances = [...document.rootInstances];
  rootInstances[index] = update(rootInstances[index]);

  return {
    ...document,
    rootInstances,
  };
}
