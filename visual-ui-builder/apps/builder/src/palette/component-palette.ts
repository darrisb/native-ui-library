import type { ComponentDefinition, ComponentRegistry } from "@visual-ui/core";
import { getPaletteGroups } from "./component-palette-data.ts";
import {
  PALETTE_DRAG_MIME_TYPE,
  createPaletteDragPayload,
  isInsertableComponentType,
  isRootInsertableComponentType,
  serializePaletteDragPayload,
} from "../drag-drop/drag-payload.ts";

function isSupportedForInsertion(definition: ComponentDefinition): boolean {
  return isInsertableComponentType(definition.type);
}

function isSupportedForRootInsertion(definition: ComponentDefinition): boolean {
  return isRootInsertableComponentType(definition.type);
}

const DRAGGING_CLASS = "palette-item--dragging";

/**
 * Makes a palette entry a drag source for its component type.
 *
 * The draggable element is the list item rather than the button: some browsers
 * do not start drags from `<button>` elements. The button keeps its click and
 * keyboard behavior untouched.
 */
function makeDraggable(item: HTMLElement, componentType: string): void {
  item.draggable = true;

  item.addEventListener("dragstart", (event: DragEvent) => {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer || !isInsertableComponentType(componentType)) {
      event.preventDefault();
      return;
    }

    dataTransfer.setData(
      PALETTE_DRAG_MIME_TYPE,
      serializePaletteDragPayload(createPaletteDragPayload(componentType))
    );
    dataTransfer.effectAllowed = "copy";
    item.classList.add(DRAGGING_CLASS);
  });

  item.addEventListener("dragend", () => {
    item.classList.remove(DRAGGING_CLASS);
  });
}

function createPaletteItem(
  definition: ComponentDefinition,
  onActivate?: (type: string) => void
): HTMLElement {
  const item = document.createElement("li");
  item.className = "palette-item";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "palette-item-button";

  const name = document.createElement("span");
  name.className = "palette-item-name";
  name.textContent = definition.name;

  const description = document.createElement("span");
  description.className = "palette-item-description";
  description.textContent = definition.description;

  button.appendChild(name);
  button.appendChild(description);

  if (isSupportedForInsertion(definition)) {
    if (isSupportedForRootInsertion(definition)) {
      button.addEventListener("click", () => {
        onActivate?.(definition.type);
      });
    }
    makeDraggable(item, definition.type);
  } else {
    button.disabled = true;
    button.title = `${definition.name} insertion is not available yet.`;

    const status = document.createElement("span");
    status.className = "palette-item-status";
    status.textContent = "Not available";
    status.setAttribute("aria-hidden", "true");
    button.appendChild(status);
  }

  item.appendChild(button);
  return item;
}

/**
 * Renders a dynamic component palette into the supplied container.
 *
 * The palette discovers metadata from the registry and presents it grouped by
 * category. An optional callback is invoked when a supported component is
 * activated for insertion.
 */
export function renderComponentPalette(
  container: HTMLElement,
  registry: ComponentRegistry,
  onActivate?: (type: string) => void
): void {
  container.innerHTML = "";

  const definitions = registry.list();

  if (definitions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "palette-empty-message";
    empty.textContent = "No components available.";
    container.appendChild(empty);
    return;
  }

  const root = document.createElement("div");
  root.className = "component-palette";

  for (const group of getPaletteGroups(registry)) {
    const section = document.createElement("section");
    section.className = "palette-category";

    const heading = document.createElement("h3");
    heading.className = "palette-category-title";
    heading.textContent = `${group.icon} ${group.category}`;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "palette-category-items";

    if (group.components.length > 0) {
      for (const definition of group.components) {
        list.appendChild(createPaletteItem(definition, onActivate));
      }
    } else {
      const empty = document.createElement("li");
      empty.className = "palette-empty-item";
      empty.textContent = "No components in this category.";
      list.appendChild(empty);
    }

    section.appendChild(list);
    root.appendChild(section);
  }

  container.appendChild(root);
}
