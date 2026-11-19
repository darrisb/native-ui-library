import type {
  ComponentDefinition,
  ComponentInstance,
  ComponentPropertyDefinition,
  ComponentRegistry,
} from "@visual-ui/core";

/** Value a property editor can commit. `undefined` clears an optional property. */
export type PropertyValue = string | number | boolean;

/** Property patch committed by the panel; `undefined` removes the property. */
export type PropertyPatch = Record<string, PropertyValue | undefined>;

export type PropertyChangeHandler = (
  instanceId: string,
  patch: PropertyPatch
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

/**
 * Returns true for optional number properties that have no default value.
 *
 * Clearing these properties in the panel removes them from the instance so the
 * component metadata default (or the absence of a value) applies.
 */
function isClearableNumber(property: ComponentPropertyDefinition): boolean {
  return (
    property.type === "number" &&
    property.defaultValue === undefined &&
    !property.required
  );
}

function convertInputValue(
  property: ComponentPropertyDefinition,
  value: string
): { value: PropertyValue | undefined; valid: true } | { valid: false } {
  switch (property.type) {
    case "string":
    case "color":
      return { value, valid: true };
    case "number": {
      if (value.trim() === "") {
        return isClearableNumber(property)
          ? { value: undefined, valid: true }
          : { valid: false };
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
  lastValidValue: PropertyValue | undefined;
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
  value: number | undefined,
  controlId: string
): HTMLInputElement {
  const input = document.createElement("input");
  input.setAttribute("type", "number");
  input.id = controlId;
  input.className = "properties-control";
  input.value = value === undefined ? "" : String(value);
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

function valueToString(value: PropertyValue | undefined): string {
  return value === undefined ? "" : String(value);
}

function createFieldControl(
  property: ComponentPropertyDefinition,
  value: PropertyValue | undefined,
  controlId: string
): HTMLElement {
  switch (property.type) {
    case "string":
      return createStringControl(property, valueToString(value), controlId);
    case "number":
      return createNumberControl(
        property,
        value === undefined ? undefined : Number(value),
        controlId
      );
    case "boolean":
      return createBooleanControl(property, Boolean(value), controlId);
    case "color":
      return createColorControl(property, valueToString(value), controlId);
    case "select":
      return createSelectControl(property, valueToString(value), controlId);
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

function setInputValue(
  input: HTMLElement,
  value: PropertyValue | undefined
): void {
  const tagName = input.nodeName.toLowerCase();
  if (tagName === "input") {
    if (input.getAttribute("type") === "checkbox") {
      (input as HTMLInputElement).checked = Boolean(value);
    } else {
      (input as HTMLInputElement).value = value === undefined ? "" : String(value);
    }
  } else if (tagName === "textarea") {
    (input as HTMLTextAreaElement).value =
      value === undefined ? "" : String(value);
  } else if (tagName === "select") {
    (input as HTMLSelectElement).value = value === undefined ? "" : String(value);
  }
}

function createField(
  instanceId: string,
  property: ComponentPropertyDefinition,
  value: PropertyValue | undefined,
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
    if (
      property.type === "number" &&
      !isClearableNumber(property) &&
      input.nodeName.toLowerCase() === "input"
    ) {
      const inputElement = input as HTMLInputElement;
      if (inputElement.value.trim() === "") {
        inputElement.value = String(state.lastValidValue ?? "");
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
  onChange: PropertyChangeHandler
): {
  root: HTMLElement;
  fields: FieldState[];
  validationMessage: HTMLElement;
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

  return { root, fields, validationMessage };
}

function getFallbackDefault(
  property: ComponentPropertyDefinition
): PropertyValue | undefined {
  switch (property.type) {
    case "number":
      // Optional numbers (such as maxLength) have no meaningful zero default;
      // leaving the control empty keeps the property unset.
      return undefined;
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
 */
export function renderPropertiesPanel(
  container: HTMLElement,
  instance: ComponentInstance | null,
  registry: ComponentRegistry,
  onChange: PropertyChangeHandler
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
    onChange
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
