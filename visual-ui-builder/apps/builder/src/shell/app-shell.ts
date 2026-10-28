import "./app-shell.css";
import "../palette/component-palette.css";
import "../canvas/builder-canvas.css";
import "../properties/properties-panel.css";
import { renderComponentPalette } from "../palette/component-palette.js";
import {
  builderComponentRegistry,
  registerBuilderNativeComponents,
} from "../registry/builder-registry.js";
import { createBuilderState } from "../state/builder-state.js";
import { findComponentById } from "../state/builder-document.js";
import { createComponentInstance } from "../factories/component-instance-factory.js";
import { renderBuilderCanvas } from "../canvas/builder-canvas.js";
import {
  insertDroppedComponent,
  moveDroppedComponent,
} from "../drag-drop/insert-dropped-component.js";
import { renderPropertiesPanel } from "../properties/properties-panel.js";
import type { BuilderState } from "../state/builder-state.js";
import type { BuilderDocument } from "../state/builder-document.js";
import type { PropertiesPanelApi } from "../properties/properties-panel.js";
import type { ComponentInstance } from "@visual-ui/core";
import { getNativeComponentRegistry } from "@visual-ui/components";

export interface AppShellOptions {
  /** Optional initial document. When omitted, an empty document is used. */
  readonly initialDocument?: BuilderDocument;
}

function createToolbar(): HTMLElement {
  const header = document.createElement("header");
  header.className = "app-toolbar";

  const title = document.createElement("h1");
  title.className = "app-title";
  title.textContent = "Visual UI Builder";

  const actions = document.createElement("div");
  actions.className = "app-toolbar-actions";

  const buttons = [
    { label: "Preview", hint: "Preview is not available in this layout preview." },
    { label: "Save", hint: "Save is not available in this layout preview." },
    { label: "Export", hint: "Export is not available in this layout preview." },
  ] as const;

  for (const { label, hint } of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = true;
    button.title = hint;
    actions.appendChild(button);
  }

  header.appendChild(title);
  header.appendChild(actions);

  return header;
}

function createPalettePanel(
  registry: typeof builderComponentRegistry,
  onActivate: (type: string) => void
): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "app-panel app-panel--palette";
  panel.setAttribute("aria-label", "Component palette");

  const heading = document.createElement("h2");
  heading.textContent = "Components";
  panel.appendChild(heading);

  const paletteContainer = document.createElement("div");
  paletteContainer.className = "palette-container";
  panel.appendChild(paletteContainer);

  renderComponentPalette(paletteContainer, registry, onActivate);

  return panel;
}

function createCanvasPanel(): HTMLElement {
  const panel = document.createElement("main");
  panel.className = "app-panel app-panel--canvas";
  panel.setAttribute("aria-label", "Builder canvas");

  const canvasContainer = document.createElement("div");
  canvasContainer.className = "canvas-container";
  panel.appendChild(canvasContainer);

  return panel;
}

function createPropertiesPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "app-panel app-panel--properties";
  panel.setAttribute("aria-label", "Property editor");

  const heading = document.createElement("h2");
  heading.textContent = "Properties";
  panel.appendChild(heading);

  const propertiesContainer = document.createElement("div");
  propertiesContainer.className = "properties-container";
  panel.appendChild(propertiesContainer);

  return panel;
}

function findSelectedInstance(
  state: BuilderState
): ComponentInstance | null {
  const selectedId = state.getSelectedInstanceId();
  if (!selectedId) {
    return null;
  }

  return findComponentById(state.getDocument(), selectedId) ?? null;
}

export function renderAppShell(
  container: HTMLElement,
  options: AppShellOptions = {}
): void {
  container.innerHTML = "";

  const nativeRegistry = getNativeComponentRegistry();
  registerBuilderNativeComponents(nativeRegistry);

  const state = createBuilderState(options.initialDocument);

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const workspace = document.createElement("div");
  workspace.className = "app-workspace";

  const canvasPanel = createCanvasPanel();
  const canvasContainer = canvasPanel.querySelector(
    ".canvas-container"
  ) as HTMLElement | null;
  if (!canvasContainer) {
    throw new Error("Canvas container was not created.");
  }

  const propertiesPanel = createPropertiesPanel();
  const propertiesContainer = propertiesPanel.querySelector(
    ".properties-container"
  ) as HTMLElement | null;
  if (!propertiesContainer) {
    throw new Error("Properties container was not created.");
  }

  let propertiesApi: PropertiesPanelApi | null = null;

  const refreshPropertiesPanel = (): void => {
    const selectedInstance = findSelectedInstance(state);

    if (!selectedInstance) {
      propertiesApi?.destroy();
      propertiesApi = renderPropertiesPanel(
        propertiesContainer,
        null,
        builderComponentRegistry,
        () => {}
      );
      return;
    }

    if (propertiesApi && propertiesApi.instanceId === selectedInstance.id) {
      propertiesApi.updateValues(selectedInstance);
      return;
    }

    propertiesApi?.destroy();
    propertiesApi = renderPropertiesPanel(
      propertiesContainer,
      selectedInstance,
      builderComponentRegistry,
      (instanceId, patch) => {
        state.updateInstanceProperties(
          instanceId,
          patch,
          builderComponentRegistry
        );
      }
    );
  };

  const renderCanvas = (): void => {
    renderBuilderCanvas(
      canvasContainer,
      state.getDocument(),
      builderComponentRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => {
          state.selectInstance(id);
        },
        onDropComponent: (componentType, parentId, index) => {
          try {
            insertDroppedComponent(
              state,
              builderComponentRegistry,
              componentType,
              parentId,
              index
            );
          } catch (error) {
            console.error("Could not insert the dropped component.", error);
          }
        },
        onMoveComponent: (componentId, parentId, index) => {
          try {
            moveDroppedComponent(
              state,
              builderComponentRegistry,
              componentId,
              parentId,
              index
            );
          } catch (error) {
            console.error("Could not move the dropped component.", error);
          }
        },
      }
    );
  };

  workspace.appendChild(
    createPalettePanel(builderComponentRegistry, (type) => {
      const instance = createComponentInstance(type, builderComponentRegistry);
      state.addRootInstance(instance);
    })
  );
  workspace.appendChild(canvasPanel);
  workspace.appendChild(propertiesPanel);

  shell.appendChild(createToolbar());
  shell.appendChild(workspace);
  container.appendChild(shell);

  renderCanvas();
  refreshPropertiesPanel();

  state.subscribe(() => {
    renderCanvas();
    refreshPropertiesPanel();
  });

  state.subscribeToSelection(() => {
    renderCanvas();
    refreshPropertiesPanel();
  });
}
