import type { ComponentInstance, ComponentRegistry } from "@visual-ui/core";
import type { BuilderDocument } from "../state/builder-document.ts";
import {
  findComponentById,
  findComponentLocationById,
} from "../state/builder-document.ts";
import type { NativeComponentRegistry } from "@visual-ui/components";
import { renderComponent } from "@visual-ui/renderer";
import {
  CANVAS_DRAG_MIME_TYPE,
  PALETTE_DRAG_MIME_TYPE,
  hasBuilderDragType,
  hasCanvasDragType,
  hasPaletteDragType,
  isRootInsertableComponentType,
  parseCanvasMovePayload,
  parsePaletteDragPayload,
} from "../drag-drop/drag-payload.ts";
import {
  calculateDropIndex,
  getIndicatorY,
} from "../drag-drop/drop-position.ts";

/** Canvas rendering options controlling selection and user interaction. */
export interface RenderCanvasOptions {
  /** Id of the currently selected instance, if any. */
  readonly selectedInstanceId?: string | null;

  /** Called when an instance is selected or selection is cleared. */
  readonly onSelectInstance?: (id: string | null) => void;

  /**
   * Called once for each valid palette drop with the component type, the
   * parent instance id (`null` for the document root), and the insertion index
   * within that parent. When omitted, the canvas does not accept palette drops.
   */
  readonly onDropComponent?: (
    componentType: string,
    parentId: string | null,
    index: number
  ) => void;

  /**
   * Called once for each valid canvas move drop with the id of the moved
   * instance, the destination parent instance id (`null` for the document
   * root), and the insertion index within that parent. When omitted, the canvas
   * does not accept move drops.
   */
  readonly onMoveComponent?: (
    componentId: string,
    parentId: string | null,
    index: number
  ) => void;
}

const DROP_ACTIVE_CLASS = "canvas-boundary--drop-active";
const DROP_INDICATOR_CLASS = "canvas-drop-indicator";
const DROP_INDICATOR_EMPTY_CLASS = "canvas-drop-indicator--empty";
const DROP_INDICATOR_NESTED_CLASS = "canvas-drop-indicator--nested";
const DROP_TARGET_ACTIVE_CLASS = "canvas-instance-wrapper--drop-target";
const SELECTED_CLASS = "canvas-instance-wrapper--selected";
const INSTANCE_ID_DATASET = "instanceId";
const COMPONENT_TYPE_DATASET = "componentType";
const SELECTION_SURFACE_CLASS = "canvas-selection-surface";
const DRAG_HANDLE_CLASS = "canvas-drag-handle";
const DRAGGING_CLASS = "canvas-instance-wrapper--dragging";

/**
 * Id of the canvas component currently being dragged, if any.
 *
 * HTML5 drag-and-drop hides `DataTransfer` data during `dragover`, so the
 * canvas stores the source id on `dragstart` to validate move indicators
 * before the drop. The payload itself is still parsed and validated on drop.
 */
let currentCanvasDragId: string | null = null;

function createEmptyState(): HTMLElement {
  const message = document.createElement("p");
  message.className = "canvas-empty-message";
  message.textContent = "Drop components here to start building.";
  return message;
}

/**
 * Adds a transparent, builder-owned selection surface on top of a leaf
 * component host. The surface lives in the component's own Shadow DOM (when
 * present) so it is rendered above the native control and can capture pointer
 * events even when the native control is disabled.
 *
 * The surface is only created for components that cannot contain children.
 * Container components continue to rely on delegated boundary click handling,
 * preserving nested child selection.
 */
function attachSelectionSurface(
  element: HTMLElement,
  instanceId: string,
  onSelect?: (id: string | null) => void
): void {
  if (!element.shadowRoot) {
    return;
  }

  const surface = document.createElement("div");
  surface.className = SELECTION_SURFACE_CLASS;
  surface.setAttribute("aria-hidden", "true");
  surface.style.setProperty("position", "absolute");
  surface.style.setProperty("inset", "0");
  surface.style.setProperty("background", "transparent");
  surface.style.setProperty("pointer-events", "auto");

  surface.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect?.(instanceId);
  });

  element.shadowRoot.appendChild(surface);
}

/**
 * Adds a small canvas-owned drag handle to an element. The handle starts a
 * builder-canvas move drag carrying the instance id. It lives outside the
 * public component API and is only used for builder interactions.
 *
 * The handle is appended to the supplied element directly when it is a root
 * wrapper, or to the element's Shadow DOM when present, so it remains above
 * native controls without altering the component's public behavior.
 */
function attachDragHandle(
  element: HTMLElement,
  instanceId: string
): void {
  const handle = document.createElement("div");
  handle.className = DRAG_HANDLE_CLASS;
  handle.setAttribute("aria-hidden", "true");
  handle.setAttribute("draggable", "true");
  handle.title = "Drag to move";
  handle.textContent = "⋮⋮";

  // Inline styles ensure the handle is visible and correctly positioned
  // whether it lives in the document or inside a component Shadow DOM.
  handle.style.setProperty("position", "absolute");
  handle.style.setProperty("top", "0.25rem");
  handle.style.setProperty("right", "0.25rem");
  handle.style.setProperty("width", "1.25rem");
  handle.style.setProperty("height", "1.25rem");
  handle.style.setProperty("display", "flex");
  handle.style.setProperty("align-items", "center");
  handle.style.setProperty("justify-content", "center");
  handle.style.setProperty("border-radius", "0.25rem");
  handle.style.setProperty("background-color", "rgba(37, 99, 235, 0.12)");
  handle.style.setProperty("color", "var(--focus-ring, #2563eb)");
  handle.style.setProperty("cursor", "grab");
  handle.style.setProperty("pointer-events", "auto");
  handle.style.setProperty("z-index", "2");
  handle.style.setProperty("font-size", "0.625rem");
  handle.style.setProperty("letter-spacing", "-0.05em");
  handle.style.setProperty("line-height", "1");
  handle.style.setProperty("opacity", "0.5");
  handle.style.setProperty("transition", "opacity 0.15s ease");

  handle.addEventListener("mouseenter", () => {
    handle.style.setProperty("opacity", "1");
  });
  handle.addEventListener("mouseleave", () => {
    handle.style.setProperty("opacity", "0.5");
  });

  handle.addEventListener("dragstart", (event: DragEvent) => {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      event.preventDefault();
      return;
    }

    currentCanvasDragId = instanceId;
    dataTransfer.setData(
      CANVAS_DRAG_MIME_TYPE,
      JSON.stringify({ source: "builder-canvas", componentId: instanceId })
    );
    dataTransfer.effectAllowed = "move";

    let dragRoot: HTMLElement | null = element;
    while (dragRoot && !dragRoot.classList.contains("canvas-instance-wrapper")) {
      dragRoot = dragRoot.parentElement;
    }
    dragRoot?.classList.add(DRAGGING_CLASS);
  });

  handle.addEventListener("dragend", () => {
    currentCanvasDragId = null;
    let dragRoot: HTMLElement | null = element;
    while (dragRoot && !dragRoot.classList.contains("canvas-instance-wrapper")) {
      dragRoot = dragRoot.parentElement;
    }
    dragRoot?.classList.remove(DRAGGING_CLASS);
  });

  if (element.shadowRoot) {
    element.shadowRoot.appendChild(handle);
  } else {
    element.appendChild(handle);
  }
}

/**
 * Recursively annotates every rendered component host element with its
 * instance id and applies selection styling to nested selected components.
 *
 * The renderer appends child component elements as direct children of their
 * parent element, so the light-DOM child list is walked in order to match
 * nested instances with their rendered elements.
 */
function annotateRenderedComponent(
  element: HTMLElement,
  instance: ComponentInstance,
  selectedInstanceId: string | null,
  metadataRegistry: ComponentRegistry,
  onSelect?: (id: string | null) => void,
  isRoot = true
): void {
  element.dataset[INSTANCE_ID_DATASET] = instance.id;
  element.dataset[COMPONENT_TYPE_DATASET] = instance.type;
  element.style.setProperty("position", "relative");

  if (!isRoot && instance.id === selectedInstanceId) {
    element.classList.add(SELECTED_CLASS);
  }

  const definition = metadataRegistry.lookup(instance.type);
  if (definition?.allowChildren === false) {
    attachSelectionSurface(element, instance.id, onSelect);
  }

  attachDragHandle(element, instance.id);

  const children = instance.children ?? [];
  for (let index = 0; index < children.length; index++) {
    const childElement = element.children[index];
    if (childElement instanceof HTMLElement) {
      annotateRenderedComponent(
        childElement,
        children[index],
        selectedInstanceId,
        metadataRegistry,
        onSelect,
        false
      );
    }
  }
}

function createInstanceWrapper(
  instance: BuilderDocument["rootInstances"][number],
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry,
  selectedInstanceId: string | null,
  onSelect?: (id: string | null) => void
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "canvas-instance-wrapper";
  wrapper.dataset[INSTANCE_ID_DATASET] = instance.id;

  if (instance.id === selectedInstanceId) {
    wrapper.classList.add(SELECTED_CLASS);
  }

  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  annotateRenderedComponent(
    element,
    instance,
    selectedInstanceId,
    metadataRegistry,
    onSelect
  );
  wrapper.appendChild(element);

  wrapper.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // Only handle clicks that are directly on the wrapper or the root
    // component host. Clicks on nested components bubble to the boundary
    // listener so the deepest clicked instance is selected.
    if (target !== wrapper && target !== element) {
      return;
    }
    event.stopPropagation();
    onSelect?.(instance.id);
  });

  return wrapper;
}

/**
 * Palette or canvas move drag currently being handled by the boundary.
 */
interface ActiveDrag {
  readonly componentType: string;
  readonly componentId?: string;
}

/**
 * Wires palette and canvas move drag-and-drop onto the canvas boundary.
 *
 * The boundary accepts drags carrying either a palette MIME type or a canvas
 * move MIME type. Browsers hide drag data until the drop, so payload validation
 * happens on `drop`. The insertion indicator and target highlight are
 * transient, builder-owned UI that is never part of the document.
 */
function attachDropHandling(
  boundary: HTMLElement,
  wrappers: readonly HTMLElement[],
  metadataRegistry: ComponentRegistry,
  builderDocument: BuilderDocument,
  onDropComponent: (componentType: string, parentId: string | null, index: number) => void,
  onMoveComponent: (componentId: string, parentId: string | null, index: number) => void
): void {
  let indicator: HTMLElement | null = null;
  let activeTarget: DropTarget | null = null;
  let activeDrag: ActiveDrag | null = null;

  const getRootBounds = () =>
    wrappers.map((wrapper) => wrapper.getBoundingClientRect());

  const clearIndicator = (): void => {
    boundary.classList.remove(DROP_ACTIVE_CLASS);
    if (activeTarget?.kind === "card") {
      activeTarget.element.classList.remove(DROP_TARGET_ACTIVE_CLASS);
    }
    activeTarget = null;
    activeDrag = null;
    if (indicator) {
      boundary.removeChild(indicator);
      indicator = null;
    }
  };

  const setActiveTarget = (target: DropTarget): void => {
    if (activeTarget?.kind === "card" && activeTarget.element !== target.element) {
      activeTarget.element.classList.remove(DROP_TARGET_ACTIVE_CLASS);
    }
    activeTarget = target;
    if (target.kind === "card") {
      target.element.classList.add(DROP_TARGET_ACTIVE_CLASS);
    }
  };

  const isDescendantOf = (ancestorId: string, candidateId: string): boolean => {
    if (candidateId === ancestorId) {
      return true;
    }

    const ancestor = findComponentById(builderDocument, ancestorId);
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

    return search(ancestor.children ?? []);
  };

  const isDropAllowed = (target: DropTarget): boolean => {
    if (!activeDrag) {
      return false;
    }

    if (activeDrag.componentId !== undefined) {
      const draggedId = activeDrag.componentId;
      if (target.parentId === draggedId) {
        return false;
      }
      if (target.parentId !== null && isDescendantOf(draggedId, target.parentId)) {
        return false;
      }
    }

    if (target.kind === "root") {
      return isRootInsertableComponentType(activeDrag.componentType);
    }

    return true;
  };

  const showIndicator = (target: DropTarget, pointerY: number): void => {
    boundary.classList.add(DROP_ACTIVE_CLASS);
    setActiveTarget(target);

    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = DROP_INDICATOR_CLASS;
      indicator.setAttribute("aria-hidden", "true");
      boundary.appendChild(indicator);
    }

    const boundaryRect = boundary.getBoundingClientRect();

    if (target.kind === "root") {
      const bounds = getRootBounds();
      const index = calculateDropIndex(pointerY, bounds);
      const y = getIndicatorY(index, bounds);
      if (y === null) {
        indicator.className = `${DROP_INDICATOR_CLASS} ${DROP_INDICATOR_EMPTY_CLASS}`;
        indicator.style.setProperty("top", "");
        return;
      }
      indicator.className = DROP_INDICATOR_CLASS;
      indicator.style.setProperty("top", `${y - boundaryRect.top}px`);
      return;
    }

    const cardElement = target.element;
    const index = calculateNestedDropIndex(pointerY, cardElement);
    const childElements = Array.from(cardElement.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );
    const bounds = childElements.map((child) => child.getBoundingClientRect());
    const y = getIndicatorY(index, bounds);

    if (y === null) {
      const cardRect = cardElement.getBoundingClientRect();
      indicator.className = `${DROP_INDICATOR_CLASS} ${DROP_INDICATOR_NESTED_CLASS} ${DROP_INDICATOR_EMPTY_CLASS}`;
      indicator.style.setProperty("top", `${cardRect.top - boundaryRect.top + 16}px`);
      indicator.style.setProperty("left", `${cardRect.left - boundaryRect.left + 16}px`);
      indicator.style.setProperty("width", `${cardRect.width - 32}px`);
      return;
    }

    indicator.className = `${DROP_INDICATOR_CLASS} ${DROP_INDICATOR_NESTED_CLASS}`;
    indicator.style.setProperty("top", `${y - boundaryRect.top}px`);
    indicator.style.setProperty("left", "");
    indicator.style.setProperty("width", "");
  };

  const buildActiveDrag = (
    componentType: string,
    componentId?: string
  ): ActiveDrag => {
    return componentId !== undefined
      ? { componentType, componentId }
      : { componentType };
  };

  const resolveActiveDrag = (event: DragEvent): ActiveDrag | null => {
    if (hasCanvasDragType(event.dataTransfer) && currentCanvasDragId !== null) {
      const instance = findComponentById(builderDocument, currentCanvasDragId);
      if (!instance) {
        return null;
      }
      return buildActiveDrag(instance.type, currentCanvasDragId);
    }

    if (hasPaletteDragType(event.dataTransfer)) {
      // Palette payload data is not readable during dragover in browsers, so
      // the drag is accepted and the type is validated on drop.
      return buildActiveDrag("card");
    }

    return null;
  };

  const parseActiveDragFromDrop = (event: DragEvent): ActiveDrag | null => {
    if (hasCanvasDragType(event.dataTransfer)) {
      const payload = parseCanvasMovePayload(
        event.dataTransfer?.getData(CANVAS_DRAG_MIME_TYPE)
      );
      if (!payload) {
        return null;
      }
      const instance = findComponentById(builderDocument, payload.componentId);
      if (!instance) {
        return null;
      }
      return buildActiveDrag(instance.type, payload.componentId);
    }

    if (hasPaletteDragType(event.dataTransfer)) {
      const payload = parsePaletteDragPayload(
        event.dataTransfer?.getData(PALETTE_DRAG_MIME_TYPE)
      );
      if (!payload) {
        return null;
      }
      return buildActiveDrag(payload.componentType);
    }

    return null;
  };

  const handleDragEnterOrOver = (event: DragEvent): void => {
    if (!hasBuilderDragType(event.dataTransfer)) {
      return;
    }
    event.preventDefault();

    const drag = resolveActiveDrag(event);
    if (!drag) {
      clearIndicator();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      return;
    }

    activeDrag = drag;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        drag.componentId !== undefined ? "move" : "copy";
    }

    const draggedId = drag.componentId ?? null;
    const target = resolveDropTarget(
      event,
      boundary,
      metadataRegistry,
      draggedId,
      isDescendantOf
    );
    if (!isDropAllowed(target)) {
      clearIndicator();
      return;
    }

    showIndicator(target, event.clientY);
  };

  boundary.addEventListener("dragenter", handleDragEnterOrOver);
  boundary.addEventListener("dragover", handleDragEnterOrOver);

  boundary.addEventListener("dragleave", (event: DragEvent) => {
    if (!hasBuilderDragType(event.dataTransfer)) {
      return;
    }
    // dragleave also fires when the pointer moves between child elements, so
    // only clear once the pointer has actually left the boundary.
    const rect = boundary.getBoundingClientRect();
    const stillInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!stillInside) {
      clearIndicator();
    }
  });

  boundary.addEventListener("drop", (event: DragEvent) => {
    if (!hasBuilderDragType(event.dataTransfer)) {
      return;
    }
    event.preventDefault();

    const drag = parseActiveDragFromDrop(event);
    if (!drag) {
      clearIndicator();
      return;
    }

    activeDrag = drag;
    const target = resolveDropTarget(
      event,
      boundary,
      metadataRegistry,
      drag.componentId ?? null,
      isDescendantOf
    );
    const dropAllowed = isDropAllowed(target);
    clearIndicator();

    if (!dropAllowed) {
      return;
    }

    const isMove = drag.componentId !== undefined;

    if (target.kind === "root") {
      const index = calculateDropIndex(event.clientY, getRootBounds());
      if (isMove) {
        const sourceLocation = findComponentLocationById(
          builderDocument,
          drag.componentId!
        );
        const adjustedIndex =
          sourceLocation?.parentId === null && index > sourceLocation.index
            ? index - 1
            : index;
        onMoveComponent(drag.componentId!, null, adjustedIndex);
      } else {
        onDropComponent(drag.componentType, null, index);
      }
      return;
    }

    const visualIndex = calculateNestedDropIndex(event.clientY, target.element);
    if (isMove) {
      const sourceLocation = findComponentLocationById(
        builderDocument,
        drag.componentId!
      );
      const adjustedIndex =
        sourceLocation?.parentId === target.parentId &&
        visualIndex > sourceLocation.index
          ? visualIndex - 1
          : visualIndex;
      onMoveComponent(drag.componentId!, target.parentId, adjustedIndex);
    } else {
      onDropComponent(drag.componentType, target.parentId, visualIndex);
    }
  });
}

/**
 * Resolves the id of the instance that was clicked from a canvas event.
 *
 * Because every nested component is rendered inside a Shadow DOM host, events
 * that originate inside a shadow root are retargeted. `composedPath()` is used
 * to walk the full event path from the deepest target upward and find the
 * first annotated component host.
 */
function resolveClickedInstanceId(event: MouseEvent): string | null {
  const path = event.composedPath?.() ?? [event.target];

  for (const node of path) {
    if (
      node instanceof HTMLElement &&
      node.dataset[INSTANCE_ID_DATASET] !== undefined
    ) {
      return node.dataset[INSTANCE_ID_DATASET] ?? null;
    }
  }

  return null;
}

/** A builder drop target: either the document root or a container component. */
interface DropTarget {
  readonly kind: "root" | "card";
  readonly parentId: string | null;
  readonly element: HTMLElement;
}

/**
 * Resolves the deepest valid container drop target for a drag event.
 *
 * Walks `composedPath()` so that drops inside Shadow DOM content (including
 * slotted children) resolve to the actual host. The deepest Card under the
 * pointer is chosen; Text and Button hosts are skipped so that a drop on their
 * visible content lands in the containing Card instead. When no Card is under
 * the pointer, the canvas root is returned.
 *
 * For canvas move drags, the dragged component and its descendants are skipped
 * so that a move cannot target itself or its own subtree.
 */
function resolveDropTarget(
  event: DragEvent,
  boundary: HTMLElement,
  metadataRegistry: ComponentRegistry,
  draggedId: string | null,
  isDescendantOf: (ancestorId: string, candidateId: string) => boolean
): DropTarget {
  const path = event.composedPath?.() ?? [event.target];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const id = node.dataset[INSTANCE_ID_DATASET];
    const componentType = node.dataset[COMPONENT_TYPE_DATASET];
    if (!id || !componentType) {
      continue;
    }

    if (draggedId !== null) {
      if (id === draggedId || isDescendantOf(draggedId, id)) {
        continue;
      }
    }

    const definition = metadataRegistry.lookup(componentType);
    if (definition?.allowChildren) {
      return { kind: "card", parentId: id, element: node };
    }
  }

  return { kind: "root", parentId: null, element: boundary };
}

/**
 * Determines the insertion index for a drop inside a Card based on the pointer
 * position relative to the Card's visible children.
 */
function calculateNestedDropIndex(
  pointerY: number,
  cardElement: HTMLElement
): number {
  const childElements = Array.from(cardElement.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  const bounds = childElements.map((child) => child.getBoundingClientRect());
  return calculateDropIndex(pointerY, bounds);
}

/**
 * Renders the builder document's root-level instances into the supplied
 * container.
 *
 * The container is cleared before rendering. When the document contains no
 * instances, the existing empty state is displayed.
 *
 * Each root-level instance is wrapped in a builder-owned element so root-level
 * selection styling, drag-and-drop positioning, and click handling can live
 * outside the native component's Shadow DOM. Nested component host elements
 * are annotated with their instance ids so a single delegated click listener
 * on the canvas boundary can select the deepest clicked component using
 * `composedPath()`. Leaf components additionally receive a transparent
 * builder-owned selection surface inside their Shadow DOM; this surface
 * captures pointer events independently of the native control's disabled
 * state, so disabled Buttons remain selectable. Native element creation and
 * property application are delegated to the shared {@link renderComponent}
 * renderer.
 */
export function renderBuilderCanvas(
  container: HTMLElement,
  builderDocument: BuilderDocument,
  metadataRegistry: ComponentRegistry,
  nativeRegistry: NativeComponentRegistry,
  options: RenderCanvasOptions = {}
): void {
  const {
    selectedInstanceId = null,
    onSelectInstance,
    onDropComponent,
    onMoveComponent,
  } = options;

  container.innerHTML = "";

  const boundary = document.createElement("div");
  boundary.className = "canvas-boundary";

  boundary.addEventListener("click", (event) => {
    const clickedId = resolveClickedInstanceId(event);
    if (clickedId !== null) {
      onSelectInstance?.(clickedId);
      event.stopPropagation();
      return;
    }
    onSelectInstance?.(null);
  });

  const wrappers: HTMLElement[] = [];
  if (onDropComponent || onMoveComponent) {
    attachDropHandling(
      boundary,
      wrappers,
      metadataRegistry,
      builderDocument,
      onDropComponent ?? (() => {}),
      onMoveComponent ?? (() => {})
    );
  }

  if (builderDocument.rootInstances.length === 0) {
    boundary.appendChild(createEmptyState());
    container.appendChild(boundary);
    return;
  }

  const content = document.createElement("div");
  content.className = "canvas-content";

  for (const instance of builderDocument.rootInstances) {
    const wrapper = createInstanceWrapper(
      instance,
      metadataRegistry,
      nativeRegistry,
      selectedInstanceId,
      onSelectInstance
    );
    wrappers.push(wrapper);
    content.appendChild(wrapper);
  }

  boundary.appendChild(content);
  container.appendChild(boundary);
}
