import type {
  ActionEvent,
  ComponentAction,
  ComponentDefinition,
  ComponentEventCapability,
  ComponentInstance,
  NavigateAction,
  NavigateTarget,
  ComponentPropertyDefinition,
  ComponentRegistry,
  DataSource,
  DataMapping,
  RestDataSource,
  StaticDataSource,
} from "@visual-ui/core";
import { isValidDataPath } from "@visual-ui/core";

export type PropertyChangeHandler = (
  instanceId: string,
  patch: Record<string, string | number | boolean>
) => void;

/** Called when the user requests deletion of the supplied instance. */
export type DeleteComponentHandler = (instanceId: string) => void;

/** Called when the user adds, edits, or removes an action on the instance. */
export type ActionChangeHandler = (
  instanceId: string,
  actions: ComponentAction[]
) => void;

/** Called when the user configures or clears the data source on the instance. */
export type DataSourceChangeHandler = (
  instanceId: string,
  dataSource: DataSource | undefined
) => void;

export interface PropertiesPanelApi {
  /** Id of the instance currently being edited, or null in empty state. */
  readonly instanceId: string | null;

  /** Updates control values from the supplied instance without rebuilding. */
  updateValues(instance: ComponentInstance): void;

  /** Removes the panel contents and releases event listeners. */
  destroy(): void;
}

function createEmptyState(): HTMLElement {
  const message = document.createElement("p");
  message.className = "properties-empty-message";
  message.textContent = "Select a component to edit its properties.";
  return message;
}

function createHeader(name: string): HTMLElement {
  const heading = document.createElement("h3");
  heading.className = "properties-component-name";
  heading.textContent = name;
  return heading;
}

function createFieldLabel(
  property: ComponentPropertyDefinition,
  controlId: string
): HTMLElement {
  const label = document.createElement("label");
  label.htmlFor = controlId;
  label.className = "properties-field-label";
  label.textContent = property.label;
  return label;
}

function createValidationMessage(): HTMLElement {
  const message = document.createElement("span");
  message.className = "properties-validation-message";
  message.setAttribute("role", "alert");
  message.setAttribute("aria-live", "polite");
  return message;
}

function buildControlId(instanceId: string, propertyName: string): string {
  return `property-${instanceId}-${propertyName}`;
}

function convertInputValue(
  property: ComponentPropertyDefinition,
  value: string
): { value: string | number | boolean; valid: true } | { valid: false } {
  switch (property.type) {
    case "string":
    case "color":
      return { value, valid: true };
    case "number": {
      if (value.trim() === "") {
        return { valid: false };
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        return { valid: false };
      }
      return { value: parsed, valid: true };
    }
    case "boolean":
      return { value: value === "true", valid: true };
    case "select":
      return { value, valid: true };
    default:
      return { valid: false };
  }
}

interface FieldState {
  readonly property: ComponentPropertyDefinition;
  readonly input: HTMLElement;
  lastValidValue: string | number | boolean;
}

function createStringControl(
  property: ComponentPropertyDefinition,
  value: string,
  controlId: string
): HTMLInputElement | HTMLTextAreaElement {
  if (property.multiline) {
    const textarea = document.createElement("textarea");
    textarea.id = controlId;
    textarea.className = "properties-control properties-control--multiline";
    textarea.value = value;
    return textarea;
  }

  const input = document.createElement("input");
  input.setAttribute("type", "text");
  input.id = controlId;
  input.className = "properties-control";
  input.value = value;
  return input;
}

function createNumberControl(
  _property: ComponentPropertyDefinition,
  value: number,
  controlId: string
): HTMLInputElement {
  const input = document.createElement("input");
  input.setAttribute("type", "number");
  input.id = controlId;
  input.className = "properties-control";
  input.value = String(value);
  return input;
}

function createBooleanControl(
  _property: ComponentPropertyDefinition,
  value: boolean,
  controlId: string
): HTMLInputElement {
  const input = document.createElement("input");
  input.setAttribute("type", "checkbox");
  input.id = controlId;
  input.className = "properties-control properties-control--checkbox";
  input.checked = value;
  return input;
}

function createColorControl(
  _property: ComponentPropertyDefinition,
  value: string,
  controlId: string
): HTMLInputElement {
  const input = document.createElement("input");
  input.setAttribute("type", "color");
  input.id = controlId;
  input.className = "properties-control properties-control--color";
  input.value = String(value);
  return input;
}

function createSelectControl(
  property: ComponentPropertyDefinition,
  value: string,
  controlId: string
): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = controlId;
  select.className = "properties-control";

  for (const choice of property.choices ?? []) {
    const option = document.createElement("option");
    option.value = choice;
    option.textContent = choice;
    if (choice === value) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  select.value = value;
  return select;
}

function createUnsupportedControl(
  property: ComponentPropertyDefinition,
  controlId: string
): HTMLElement {
  const note = document.createElement("span");
  note.id = controlId;
  note.className = "properties-unsupported-message";
  note.textContent = `${property.label} editing is not supported.`;
  return note;
}

function createFieldControl(
  property: ComponentPropertyDefinition,
  value: string | number | boolean,
  controlId: string
): HTMLElement {
  switch (property.type) {
    case "string":
      return createStringControl(property, String(value), controlId);
    case "number":
      return createNumberControl(property, Number(value), controlId);
    case "boolean":
      return createBooleanControl(property, Boolean(value), controlId);
    case "color":
      return createColorControl(property, String(value), controlId);
    case "select":
      return createSelectControl(property, String(value), controlId);
    default:
      return createUnsupportedControl(property, controlId);
  }
}

function getInputValue(input: HTMLElement): string {
  if (
    input.nodeName.toLowerCase() === "input" &&
    input.getAttribute("type") === "checkbox"
  ) {
    return String((input as HTMLInputElement).checked);
  }
  return (input as HTMLInputElement | HTMLSelectElement).value;
}

function setInputValue(input: HTMLElement, value: string | number | boolean): void {
  const tagName = input.nodeName.toLowerCase();
  if (tagName === "input") {
    if (input.getAttribute("type") === "checkbox") {
      (input as HTMLInputElement).checked = Boolean(value);
    } else {
      (input as HTMLInputElement).value = String(value);
    }
  } else if (tagName === "textarea") {
    (input as HTMLTextAreaElement).value = String(value);
  } else if (tagName === "select") {
    (input as HTMLSelectElement).value = String(value);
  }
}

function createField(
  instanceId: string,
  property: ComponentPropertyDefinition,
  value: string | number | boolean,
  onChange: PropertyChangeHandler,
  validationMessage: HTMLElement
): { field: HTMLElement; state: FieldState } {
  const controlId = buildControlId(instanceId, property.name);
  const field = document.createElement("div");
  field.className = "properties-field";

  const label = createFieldLabel(property, controlId);
  const input = createFieldControl(property, value, controlId);

  field.appendChild(label);
  field.appendChild(input);

  const state: FieldState = {
    property,
    input,
    lastValidValue: value,
  };

  const handleChange = (): void => {
    const currentInputValue = getInputValue(input);

    const result = convertInputValue(property, currentInputValue);

    if (!result.valid) {
      if (property.type === "number") {
        validationMessage.textContent = `${property.label} must be a valid number.`;
      }
      return;
    }

    validationMessage.textContent = "";
    state.lastValidValue = result.value;

    try {
      onChange(instanceId, { [property.name]: result.value });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update property.";
      validationMessage.textContent = message;
    }
  };

  const handleBlur = (): void => {
    if (property.type === "number" && input.nodeName.toLowerCase() === "input") {
      const inputElement = input as HTMLInputElement;
      if (inputElement.value.trim() === "") {
        inputElement.value = String(state.lastValidValue);
        validationMessage.textContent = "";
      }
    }
  };

  const inputTagName = input.nodeName.toLowerCase();
  if (inputTagName === "select") {
    input.addEventListener("change", handleChange);
  } else if (inputTagName === "textarea") {
    input.addEventListener("input", handleChange);
  } else if (inputTagName === "input") {
    const inputType = input.getAttribute("type") ?? "text";
    if (inputType === "checkbox") {
      input.addEventListener("change", handleChange);
    } else if (inputType === "color") {
      input.addEventListener("input", handleChange);
    } else if (inputType === "number") {
      input.addEventListener("input", handleChange);
      input.addEventListener("blur", handleBlur);
    } else {
      input.addEventListener("input", handleChange);
    }
  }

  return { field, state };
}

/**
 * Generates a unique action id that does not collide with any action already
 * present in the list. Uses the event name as a readable prefix so generated
 * ids are stable within a single editing session.
 */
function generateActionId(
  actions: readonly ComponentAction[],
  event: ActionEvent
): string {
  const existing = new Set(actions.map((action) => action.id));
  const base = `${event}-navigate`;
  if (!existing.has(base)) {
    return base;
  }
  let counter = 2;
  while (existing.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

/** Returns a sanitized copy of `actions` with the action matching `id` removed. */
function removeActionById(
  actions: readonly ComponentAction[],
  id: string
): ComponentAction[] {
  return actions.filter((action) => action.id !== id);
}

interface ActionEditorState {
  readonly container: HTMLElement;
  readonly validationMessage: HTMLElement;
  render(
    actions: readonly ComponentAction[],
    capabilities: readonly ComponentEventCapability[]
  ): void;
}

/**
 * Builds a self-contained action editor for a single instance. The editor is
 * rendered into its own container so it can be refreshed independently of the
 * property fields (which are driven by `updateValues`).
 *
 * `onCommit` fires with the full replacement action list whenever the user
 * makes a change. The parent is responsible for validation/persistence; the
 * editor only shows inline feedback and never commits an invalid draft.
 */
function createActionEditor(
  instanceId: string,
  capabilities: readonly ComponentEventCapability[],
  initialActions: readonly ComponentAction[],
  onCommit: ActionChangeHandler
): ActionEditorState {
  const container = document.createElement("div");
  container.className = "properties-actions";

  const validationMessage = document.createElement("span");
  validationMessage.className = "properties-actions-validation-message";
  validationMessage.setAttribute("role", "alert");
  validationMessage.setAttribute("aria-live", "polite");

  // Mutable working copy; re-rendered on every commit.
  let workingActions: ComponentAction[] = [...initialActions];

  function setValidation(message: string): void {
    validationMessage.textContent = message;
  }

  function render(
    actions: readonly ComponentAction[],
    _capabilities: readonly ComponentEventCapability[]
  ): void {
    workingActions = [...actions];
    container.innerHTML = "";
    container.appendChild(buildActionSection());
    container.appendChild(validationMessage);
  }

  function buildActionSection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "properties-actions-section";

    const heading = document.createElement("h4");
    heading.className = "properties-actions-heading";
    heading.textContent = "Actions";
    section.appendChild(heading);

    for (let index = 0; index < workingActions.length; index++) {
      const action = workingActions[index];
      section.appendChild(buildActionRow(action, index));
    }

    section.appendChild(buildAddButton());

    return section;
  }

  function buildActionRow(action: ComponentAction, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "properties-action-row";

    // Event select.
    const eventSelect = document.createElement("select");
    eventSelect.className = "properties-control properties-action-event";
    eventSelect.setAttribute("aria-label", `Action ${index + 1} event`);

    for (const capability of capabilities) {
      const option = document.createElement("option");
      option.value = capability.event;
      option.textContent = capability.label;
      if (capability.event === action.event) {
        option.selected = true;
      }
      eventSelect.appendChild(option);
    }

    eventSelect.value = action.event;

    // Navigate type label (only type available today).
    const typeSpan = document.createElement("span");
    typeSpan.className = "properties-action-type";
    typeSpan.textContent = "Navigate";

    // URL input.
    const urlInput = document.createElement("input");
    urlInput.setAttribute("type", "text");
    urlInput.className = "properties-control properties-action-url";
    urlInput.setAttribute("aria-label", `Action ${index + 1} URL`);
    urlInput.value = (action as NavigateAction).config.url;

    // Target select.
    const targetSelect = document.createElement("select");
    targetSelect.className = "properties-control properties-action-target";
    targetSelect.setAttribute("aria-label", `Action ${index + 1} target`);

    const selfOption = document.createElement("option");
    selfOption.value = "_self";
    selfOption.textContent = "Same tab";
    targetSelect.appendChild(selfOption);

    const blankOption = document.createElement("option");
    blankOption.value = "_blank";
    blankOption.textContent = "New tab";
    targetSelect.appendChild(blankOption);

    targetSelect.value = (action as NavigateAction).config.target ?? "_self";

    // Remove button.
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "properties-action-remove";
    removeButton.setAttribute("aria-label", `Remove action ${index + 1}`);
    removeButton.textContent = "✕";

    // Row-level validation message.
    const rowError = document.createElement("span");
    rowError.className = "properties-action-row-error";
    rowError.setAttribute("role", "alert");

    const applyChanges = (): void => {
      const newEvent = eventSelect.value as ActionEvent;
      const newUrl = urlInput.value.trim();
      const newTarget = targetSelect.value as NavigateTarget;

      if (newUrl.length === 0) {
        rowError.textContent = "URL is required.";
        return;
      }

      const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(
        newUrl.replace(/^[\s\u0000-\u001f]+/, "")
      );
      if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        if (
          scheme === "javascript" ||
          scheme === "data" ||
          scheme === "vbscript" ||
          scheme === "file"
        ) {
          rowError.textContent = `URL uses a disallowed scheme: ${scheme}.`;
          return;
        }
      }

      rowError.textContent = "";

      const updated: NavigateAction = {
        id: action.id,
        event: newEvent,
        type: "navigate",
        config: {
          url: newUrl,
          target: newTarget,
        },
      };

      const next = [...workingActions];
      next[index] = updated;
      // Update workingActions so further edits operate on latest data.
      workingActions = next;
      onCommit(instanceId, workingActions);
    };

    eventSelect.addEventListener("change", applyChanges);
    urlInput.addEventListener("input", applyChanges);
    targetSelect.addEventListener("change", applyChanges);

    removeButton.addEventListener("click", () => {
      const next = removeActionById(workingActions, action.id);
      // Update workingActions so re-render reflects the removal immediately.
      workingActions = next;
      onCommit(instanceId, workingActions);
      // Re-render so the row disappears immediately.
      render(workingActions, capabilities);
    });

    const controlsRow = document.createElement("div");
    controlsRow.className = "properties-action-controls";
    controlsRow.appendChild(eventSelect);
    controlsRow.appendChild(typeSpan);
    controlsRow.appendChild(urlInput);
    controlsRow.appendChild(targetSelect);
    controlsRow.appendChild(removeButton);

    row.appendChild(controlsRow);
    row.appendChild(rowError);

    return row;
  }

  function buildAddButton(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "properties-action-add";
    button.textContent = "Add Action";

    button.addEventListener("click", () => {
      if (capabilities.length === 0) {
        setValidation("No events available for this component.");
        return;
      }

      // Pick the first declared capability's event as a sensible default.
      const defaultEvent = capabilities[0].event;
      const newAction: NavigateAction = {
        id: generateActionId(workingActions, defaultEvent),
        event: defaultEvent,
        type: "navigate",
        config: { url: "", target: "_self" },
      };

      workingActions = [...workingActions, newAction];
      // Commit so the action persists even if the user never edits URL.
      onCommit(instanceId, workingActions);
      // Re-render so the new row appears immediately.
      render(workingActions, capabilities);
    });

    return button;
  }

  container.appendChild(buildActionSection());
  container.appendChild(validationMessage);

  return { container, validationMessage, render };
}

function buildForm(
  instance: ComponentInstance,
  definition: ComponentDefinition,
  onChange: PropertyChangeHandler,
  onDelete?: DeleteComponentHandler,
  onActionsChange?: ActionChangeHandler,
  onDataSourceChange?: DataSourceChangeHandler
): {
  root: HTMLElement;
  fields: FieldState[];
  validationMessage: HTMLElement;
  actionEditor?: ActionEditorState;
  dataSourceEditor?: DataSourceEditorState;
} {
  const root = document.createElement("div");
  root.className = "properties-form";

  root.appendChild(createHeader(definition.name));

  const validationMessage = createValidationMessage();
  root.appendChild(validationMessage);

  const fields: FieldState[] = [];

  for (const property of definition.properties) {
    const value =
      instance.properties[property.name] ??
      property.defaultValue ??
      getFallbackDefault(property);

    const { field, state } = createField(
      instance.id,
      property,
      value,
      onChange,
      validationMessage
    );
    root.appendChild(field);
    fields.push(state);
  }

  // Action editor — only when the definition declares supported events and
  // a change handler is supplied.
  let actionEditor: ActionEditorState | undefined;
  const capabilities = definition.events;
  if (onActionsChange && capabilities && capabilities.length > 0) {
    const separator = document.createElement("hr");
    separator.className = "properties-action-separator";
    root.appendChild(separator);

    actionEditor = createActionEditor(
      instance.id,
      capabilities,
      instance.actions ?? [],
      (id, actions) => {
        // Surface validation feedback from the state layer in the editor.
        try {
          onActionsChange(id, actions);
          actionEditor!.validationMessage.textContent = "";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid action.";
          actionEditor!.validationMessage.textContent = message;
        }
      }
    );
    root.appendChild(actionEditor.container);
  }

  // Data source editor — only when the definition declares a dataBinding
  // capability and a change handler is supplied.
  let dataSourceEditor: DataSourceEditorState | undefined;
  const bindingTargets = definition.dataBinding;
  if (onDataSourceChange && bindingTargets && bindingTargets.length > 0) {
    const separator = document.createElement("hr");
    separator.className = "properties-action-separator";
    root.appendChild(separator);

    dataSourceEditor = createDataSourceEditor(
      instance.id,
      instance.dataSource,
      (id, dataSource) => {
        try {
          onDataSourceChange(id, dataSource);
          dataSourceEditor!.validationMessage.textContent = "";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid data source.";
          dataSourceEditor!.validationMessage.textContent = message;
        }
      }
    );
    root.appendChild(dataSourceEditor.container);
  }

  if (onDelete) {
    const separator = document.createElement("hr");
    separator.className = "properties-action-separator";
    root.appendChild(separator);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "properties-delete-button";
    deleteButton.textContent = "Delete Component";
    deleteButton.addEventListener("click", () => {
      onDelete(instance.id);
    });
    root.appendChild(deleteButton);
  }

  return { root, fields, validationMessage, actionEditor, dataSourceEditor };
}

function getFallbackDefault(
  property: ComponentPropertyDefinition
): string | number | boolean {
  switch (property.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "color":
      return "#000000";
    case "string":
    case "select":
    default:
      return "";
  }
}

/**
 * Renders a metadata-driven property editor for the supplied instance.
 *
 * When `instance` is null, an empty-state message is shown. The returned API
 * can be used to refresh control values without rebuilding the form, which
 * preserves input focus while the document updates.
 *
 * When `onDelete` is provided and `instance` is not null, a native Delete
 * Component button is rendered at the bottom of the form. The empty state
 * never renders the delete action.
 *
 * When `onActionsChange` is provided and the component definition declares
 * supported events, an Actions section is rendered after the property fields.
 * Changes are committed as full replacement lists; validation errors from the
 * state layer are surfaced inline and never persisted.
 *
 * When `onDataSourceChange` is provided and the component definition declares
 * a `dataBinding` capability, a Data Source section is rendered after the
 * property fields (and after the Actions section, when present). Changes are
 * committed as full replacement data sources; validation errors from the state
 * layer are surfaced inline and never persisted.
 */
export function renderPropertiesPanel(
  container: HTMLElement,
  instance: ComponentInstance | null,
  registry: ComponentRegistry,
  onChange: PropertyChangeHandler,
  onDelete?: DeleteComponentHandler,
  onActionsChange?: ActionChangeHandler,
  onDataSourceChange?: DataSourceChangeHandler
): PropertiesPanelApi {
  container.innerHTML = "";

  if (!instance) {
    container.appendChild(createEmptyState());
    return {
      instanceId: null,
      updateValues() {
        // No controls to update in empty state.
      },
      destroy() {
        container.innerHTML = "";
      },
    };
  }

  const definition = registry.lookup(instance.type);
  if (!definition) {
    const message = createEmptyState();
    message.textContent = `Unknown component type "${instance.type}".`;
    container.appendChild(message);
    return {
      instanceId: instance.id,
      updateValues() {
        // Cannot update without metadata.
      },
      destroy() {
        container.innerHTML = "";
      },
    };
  }

  const { root, fields, validationMessage, actionEditor, dataSourceEditor } =
    buildForm(
      instance,
      definition,
      onChange,
      onDelete,
      onActionsChange,
      onDataSourceChange
    );
  container.appendChild(root);

  return {
    instanceId: instance.id,
    updateValues(updatedInstance) {
      if (updatedInstance.id !== instance.id) {
        return;
      }

      for (const state of fields) {
        if (state.input === document.activeElement) {
          continue;
        }

        const value =
          updatedInstance.properties[state.property.name] ??
          state.property.defaultValue ??
          getFallbackDefault(state.property);

        setInputValue(state.input, value);
      }

      // Refresh the action editor so it reflects the persisted state (e.g.
      // after undo/redo). Skipped while a control inside the editor is
      // focused to avoid clobbering the user's in-progress edits.
      if (actionEditor && !isActionEditorFocused(actionEditor)) {
        const capabilities = definition.events ?? [];
        actionEditor.render(updatedInstance.actions ?? [], capabilities);
      }

      // Refresh the data source editor so it reflects the persisted state
      // (e.g. after undo/redo). Skipped while a control inside the editor is
      // focused to avoid clobbering the user's in-progress edits.
      if (dataSourceEditor && !isDataSourceEditorFocused(dataSourceEditor)) {
        dataSourceEditor.render(updatedInstance.dataSource);
      }

      validationMessage.textContent = "";
    },
    destroy() {
      container.innerHTML = "";
    },
  };
}

/**
 * Returns true when any element inside the action editor currently holds focus.
 * Used by `updateValues` to avoid clobbering in-progress edits during
 * document refreshes (undo/redo).
 */
function isActionEditorFocused(editor: ActionEditorState): boolean {
  const active = document.activeElement;
  if (!active) {
    return false;
  }
  let node: HTMLElement | null = active as HTMLElement;
  while (node) {
    if (node === editor.container) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Data Source editor.
// ---------------------------------------------------------------------------

interface DataSourceEditorState {
  readonly container: HTMLElement;
  readonly validationMessage: HTMLElement;
  render(dataSource: DataSource | undefined): void;
}

/**
 * Maps the supported load triggers for a REST data source.
 * Only `"mount"` is offered initially; the list is open for future expansion.
 */
const LOAD_TRIGGERS = [
  { value: "mount", label: "On mount" },
] as const;

/**
 * Builds a self-contained data source editor for a single instance. The editor
 * is rendered into its own container so it can be refreshed independently of
 * the property fields (which are driven by `updateValues`).
 *
 * `onCommit` fires with the full replacement data source (or `undefined` for
 * static) whenever the user makes a change. The parent is responsible for
 * validation/persistence; the editor only shows inline feedback and never
 * commits an invalid draft.
 *
 * The editor shows CORS / auth limitation messaging inline: no request headers
 * are supported by the contract, so authenticated endpoints require a
 * CORS-friendly proxy or public data.
 */
function createDataSourceEditor(
  instanceId: string,
  initialDataSource: DataSource | undefined,
  onCommit: DataSourceChangeHandler
): DataSourceEditorState {
  const container = document.createElement("div");
  container.className = "properties-data-source";

  const validationMessage = document.createElement("span");
  validationMessage.className = "properties-datasource-validation-message";
  validationMessage.setAttribute("role", "alert");
  validationMessage.setAttribute("aria-live", "polite");

  let workingDataSource: DataSource | undefined = initialDataSource;

  function setValidation(message: string): void {
    validationMessage.textContent = message;
  }

  /**
   * Updates the working data source and re-renders the editor so the UI
   * reflects the new state immediately. Does not fire onCommit — used for
   * type switching where the intermediate state is not yet valid to persist.
   */
  function setWorkingAndRender(next: DataSource | undefined): void {
    workingDataSource = next;
    render(workingDataSource);
  }

  function render(dataSource: DataSource | undefined): void {
    workingDataSource = dataSource;
    container.innerHTML = "";
    container.appendChild(buildDataSourceSection());
    container.appendChild(validationMessage);
  }

  function buildDataSourceSection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "properties-datasource-section";

    const heading = document.createElement("h4");
    heading.className = "properties-datasource-heading";
    heading.textContent = "Data Source";
    section.appendChild(heading);

    section.appendChild(buildTypeSelect());

    if (workingDataSource && workingDataSource.type === "rest") {
      section.appendChild(buildRestFields(workingDataSource));
    }

    section.appendChild(buildLimitationNotice());

    return section;
  }

  function buildTypeSelect(): HTMLElement {
    const field = document.createElement("div");
    field.className = "properties-field";

    const label = document.createElement("label");
    label.className = "properties-field-label";
    label.textContent = "Source type";
    field.appendChild(label);

    const select = document.createElement("select");
    select.className = "properties-control properties-datasource-type";
    select.setAttribute("aria-label", "Data source type");

    const staticOption = document.createElement("option");
    staticOption.value = "static";
    staticOption.textContent = "Static (no fetch)";
    select.appendChild(staticOption);

    const restOption = document.createElement("option");
    restOption.value = "rest";
    select.appendChild(restOption);
    restOption.textContent = "REST GET";

    const currentType = workingDataSource?.type ?? "static";
    select.value = currentType;

    select.addEventListener("change", () => {
      const nextType = select.value;
      if (nextType === "static") {
        setWorkingAndRender({ type: "static" });
        onCommit(instanceId, { type: "static" });
      } else {
        // Immediately re-render the REST fields so the user can fill them in.
        // Field-level validation gates commits as the user types.
        setWorkingAndRender({
          type: "rest",
          method: "GET",
          url: "",
          loadOn: "mount",
        });
      }
    });

    field.appendChild(select);
    return field;
  }

  function buildRestFields(dataSource: RestDataSource): HTMLElement {
    const restFields = document.createElement("div");
    restFields.className = "properties-datasource-rest";

    // Endpoint URL.
    const urlField = document.createElement("div");
    urlField.className = "properties-field";
    const urlLabel = document.createElement("label");
    urlLabel.className = "properties-field-label";
    urlLabel.textContent = "Endpoint URL";
    urlField.appendChild(urlLabel);
    const urlInput = document.createElement("input");
    urlInput.setAttribute("type", "text");
    urlInput.className = "properties-control properties-datasource-url";
    urlInput.setAttribute("aria-label", "Endpoint URL");
    urlInput.setAttribute("placeholder", "https://api.example.com/items");
    urlInput.value = dataSource.url;
    urlInput.addEventListener("input", () => {
      const base = workingDataSource as RestDataSource;
      const next: RestDataSource = { ...base, url: urlInput.value };
      commit(next);
    });
    urlField.appendChild(urlInput);
    restFields.appendChild(urlField);

    // Response path.
    const responsePathField = document.createElement("div");
    responsePathField.className = "properties-field";
    const responsePathLabel = document.createElement("label");
    responsePathLabel.className = "properties-field-label";
    responsePathLabel.textContent = "Response path (optional)";
    responsePathField.appendChild(responsePathLabel);
    const responsePathInput = document.createElement("input");
    responsePathInput.setAttribute("type", "text");
    responsePathInput.className =
      "properties-control properties-datasource-response-path";
    responsePathInput.setAttribute("aria-label", "Response path");
    responsePathInput.setAttribute("placeholder", "data.items");
    responsePathInput.value = dataSource.responsePath ?? "";
    responsePathInput.addEventListener("input", () => {
      const raw = responsePathInput.value.trim();
      const base = workingDataSource as RestDataSource;
      const next: RestDataSource = {
        ...base,
        responsePath: raw.length > 0 ? raw : undefined,
      };
      commit(next);
    });
    responsePathField.appendChild(responsePathInput);
    restFields.appendChild(responsePathField);

    // Label mapping.
    const mapping = dataSource.mapping ?? {};
    const labelField = document.createElement("div");
    labelField.className = "properties-field";
    const labelMappingLabel = document.createElement("label");
    labelMappingLabel.className = "properties-field-label";
    labelMappingLabel.textContent = "Label field path";
    labelField.appendChild(labelMappingLabel);
    const labelMappingInput = document.createElement("input");
    labelMappingInput.setAttribute("type", "text");
    labelMappingInput.className =
      "properties-control properties-datasource-label-mapping";
    labelMappingInput.setAttribute("aria-label", "Label field path");
    labelMappingInput.setAttribute("placeholder", "name");
    labelMappingInput.value = mapping.label ?? "";
    labelMappingInput.addEventListener("input", () => {
      commit(updateMapping("label", labelMappingInput.value.trim()));
    });
    labelField.appendChild(labelMappingInput);
    restFields.appendChild(labelField);

    // Value mapping.
    const valueField = document.createElement("div");
    valueField.className = "properties-field";
    const valueMappingLabel = document.createElement("label");
    valueMappingLabel.className = "properties-field-label";
    valueMappingLabel.textContent = "Value field path";
    valueField.appendChild(valueMappingLabel);
    const valueMappingInput = document.createElement("input");
    valueMappingInput.setAttribute("type", "text");
    valueMappingInput.className =
      "properties-control properties-datasource-value-mapping";
    valueMappingInput.setAttribute("aria-label", "Value field path");
    valueMappingInput.setAttribute("placeholder", "id");
    valueMappingInput.value = mapping.value ?? "";
    valueMappingInput.addEventListener("input", () => {
      commit(updateMapping("value", valueMappingInput.value.trim()));
    });
    valueField.appendChild(valueMappingInput);
    restFields.appendChild(valueField);

    // Load trigger.
    const loadOnField = document.createElement("div");
    loadOnField.className = "properties-field";
    const loadOnLabel = document.createElement("label");
    loadOnLabel.className = "properties-field-label";
    loadOnLabel.textContent = "Load trigger";
    loadOnField.appendChild(loadOnLabel);
    const loadOnSelect = document.createElement("select");
    loadOnSelect.className =
      "properties-control properties-datasource-load-on";
    loadOnSelect.setAttribute("aria-label", "Load trigger");
    for (const trigger of LOAD_TRIGGERS) {
      const option = document.createElement("option");
      option.value = trigger.value;
      option.textContent = trigger.label;
      loadOnSelect.appendChild(option);
    }
    loadOnSelect.value = dataSource.loadOn;
    loadOnSelect.addEventListener("change", () => {
      const base = workingDataSource as RestDataSource;
      const next: RestDataSource = {
        ...base,
        loadOn: loadOnSelect.value as RestDataSource["loadOn"],
      };
      commit(next);
    });
    loadOnField.appendChild(loadOnSelect);
    restFields.appendChild(loadOnField);

    return restFields;
  }

  function buildLimitationNotice(): HTMLElement {
    const notice = document.createElement("p");
    notice.className = "properties-datasource-notice";
    notice.textContent =
      "No auth headers or tokens are supported — keep secrets out of project " +
      "JSON. Requests require CORS-enabled endpoints.";
    return notice;
  }

  /**
   * Returns a new RestDataSource with the supplied mapping field updated.
   * Empty values drop the key entirely so validation doesn't trip on blanks.
   */
  function updateMapping(
    field: keyof DataMapping,
    rawValue: string
  ): RestDataSource {
    const existing = (workingDataSource as RestDataSource).mapping ?? {};
    const nextMapping: Record<string, string> = { ...existing };
    if (rawValue.length === 0) {
      delete nextMapping[field];
    } else {
      nextMapping[field] = rawValue;
    }
    const hasMappings = Object.keys(nextMapping).length > 0;
    return {
      ...workingDataSource! as RestDataSource,
      mapping: hasMappings ? (nextMapping as DataMapping) : undefined,
    };
  }

  /**
   * Validates the draft data source and commits only when it passes. Invalid
   * drafts surface inline feedback without mutating persisted state.
   */
  function commit(next: DataSource | StaticDataSource): void {
    // Validate mapping paths before committing so bad paths never reach the
    // state layer.
    if (next.type === "rest") {
      const rest = next;
      if (rest.url.trim().length === 0) {
        setValidation("Endpoint URL is required.");
        return;
      }
      if (rest.responsePath !== undefined && !isValidDataPath(rest.responsePath)) {
        setValidation("Response path is not a valid safe path.");
        return;
      }
      if (rest.mapping !== undefined) {
        for (const [key, value] of Object.entries(rest.mapping)) {
          if (!isValidDataPath(value)) {
            setValidation(
              `Mapping path for "${key}" is not a valid safe path.`
            );
            return;
          }
        }
      }
    }

    setValidation("");
    workingDataSource = next;
    onCommit(instanceId, next);
  }

  container.appendChild(buildDataSourceSection());
  container.appendChild(validationMessage);

  return { container, validationMessage, render };
}

/**
 * Returns true when any element inside the data source editor currently holds
 * focus. Used by `updateValues` to avoid clobbering in-progress edits during
 * document refreshes (undo/redo).
 */
function isDataSourceEditorFocused(editor: DataSourceEditorState): boolean {
  const active = document.activeElement;
  if (!active) {
    return false;
  }
  let node: HTMLElement | null = active as HTMLElement;
  while (node) {
    if (node === editor.container) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}
