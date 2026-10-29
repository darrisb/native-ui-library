import type {
  ComponentDefinition,
  ComponentInstance,
  ComponentPropertyDefinition,
  ComponentRegistry,
} from "@visual-ui/core";

export type PropertyChangeHandler = (
  instanceId: string,
  patch: Record<string, string | number | boolean>
) => void;

/** Called when the user requests deletion of the supplied instance. */
export type DeleteComponentHandler = (instanceId: string) => void;

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

function buildForm(
  instance: ComponentInstance,
  definition: ComponentDefinition,
  onChange: PropertyChangeHandler,
  onDelete?: DeleteComponentHandler
): { root: HTMLElement; fields: FieldState[]; validationMessage: HTMLElement } {
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

  return { root, fields, validationMessage };
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
 */
export function renderPropertiesPanel(
  container: HTMLElement,
  instance: ComponentInstance | null,
  registry: ComponentRegistry,
  onChange: PropertyChangeHandler,
  onDelete?: DeleteComponentHandler
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

  const { root, fields, validationMessage } = buildForm(
    instance,
    definition,
    onChange,
    onDelete
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

      validationMessage.textContent = "";
    },
    destroy() {
      container.innerHTML = "";
    },
  };
}
