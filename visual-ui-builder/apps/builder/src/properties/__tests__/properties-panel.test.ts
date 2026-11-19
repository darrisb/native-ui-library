interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${String(expected)}, but got ${String(actual)}.`
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

class MockStyle {
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? "";
  }
}

class MockElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly children: MockElement[] = [];
  readonly style = new MockStyle();
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  private valueInternal = "";
  private checkedInternal = false;
  private idInternal = "";
  private listeners: Record<string, ((event: Event) => void)[]> = {};

  constructor(nodeName: string) {
    this.nodeName = nodeName.toUpperCase();
  }

  set id(value: string) {
    this.idInternal = value;
    this.setAttribute("id", value);
  }

  get id(): string {
    return this.idInternal;
  }

  set value(value: string) {
    this.valueInternal = value;
  }

  get value(): string {
    return this.valueInternal;
  }

  set checked(value: boolean) {
    this.checkedInternal = value;
  }

  get checked(): boolean {
    return this.checkedInternal;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name.toLowerCase(), value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: MockElement[]): void {
    this.children.length = 0;
    this.children.push(...children);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  dispatchEvent(event: Event): boolean {
    const typeListeners = this.listeners[event.type];
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }
    return true;
  }
}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  class MockHTMLElement extends MockElement {}
  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => {
      return new MockElement(tagName);
    },
    activeElement: null,
  };
}

installMockDom();

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);
const { renderPropertiesPanel } = await import("../properties-panel.ts");
type PropertyPatch = import("../properties-panel.ts").PropertyPatch;
const { createBuilderState } = await import("../../state/builder-state.ts");
const { findComponentById } = await import("../../state/builder-document.ts");
type BuilderState = import("../../state/builder-state.ts").BuilderState;
type BuilderDocument = import("../../state/builder-document.ts").BuilderDocument;

const registry = new ComponentRegistry();
registerSampleDefinitions(registry);

const document = globalThis.document as {
  createElement: (tagName: string) => MockElement;
  activeElement: MockElement | null;
};

function createContainer(): MockElement {
  return document.createElement("div");
}

function findControl(
  container: MockElement,
  instanceId: string,
  propertyName: string
): MockElement | undefined {
  const controlId = `property-${instanceId}-${propertyName}`;
  const form = container.children[0];
  const walk = (element: MockElement): MockElement | undefined => {
    if (element.getAttribute("id") === controlId) {
      return element;
    }
    for (const child of element.children) {
      const found = walk(child);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return form ? walk(form) : undefined;
}

function createCardInstance(
  id: string,
  properties: Record<string, string | number | boolean>
) {
  return {
    id,
    type: "card",
    properties,
  };
}

test("Displays empty state when no component is selected", () => {
  const container = createContainer();
  renderPropertiesPanel(container as unknown as HTMLElement, null, registry, () => {});

  assertEqual(container.children.length, 1);
  assertTrue(
    container.children[0].textContent.includes(
      "Select a component to edit its properties"
    )
  );
});

test("Generates controls from metadata for a Card", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    description: "Card description.",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const titleControl = findControl(container, "card-1", "title");
  const descriptionControl = findControl(container, "card-1", "description");
  const paddingControl = findControl(container, "card-1", "padding");
  const colorControl = findControl(container, "card-1", "backgroundColor");

  assertTrue(titleControl !== undefined, "Title control should exist.");
  assertTrue(descriptionControl !== undefined, "Description control should exist.");
  assertTrue(paddingControl !== undefined, "Padding control should exist.");
  assertTrue(colorControl !== undefined, "Color control should exist.");

  assertEqual(titleControl!.value, "Hello");
  assertEqual(descriptionControl!.value, "Card description.");
  assertEqual(paddingControl!.value, "16");
  assertEqual(colorControl!.value, "#ffffff");
});

test("Description renders as a multiline textarea", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    description: "Line one\nLine two",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const descriptionControl = findControl(container, "card-1", "description");
  assertTrue(descriptionControl !== undefined, "Description control should exist.");
  assertEqual(descriptionControl!.nodeName, "TEXTAREA");
  assertTrue(
    descriptionControl!.className.includes("properties-control--multiline"),
    "Description control should use the multiline style."
  );
  assertEqual(descriptionControl!.value, "Line one\nLine two");
});

test("String input emits property changes", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  let changedId: string | null = null;
  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (id, patch) => {
      changedId = id;
      changedPatch = patch;
    }
  );

  const titleControl = findControl(container, "card-1", "title") as MockElement;
  titleControl.value = "First Card";
  titleControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedId, "card-1");
  assertEqual(changedPatch?.["title"], "First Card");
});

test("Multiline description input emits property changes", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    description: "Initial",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    }
  );

  const descriptionControl = findControl(
    container,
    "card-1",
    "description"
  ) as MockElement;
  descriptionControl.value = "Line one\nLine two";
  descriptionControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedPatch?.["description"], "Line one\nLine two");
});

test("Number input converts values and rejects invalid input", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  const changes: PropertyPatch[] = [];

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changes.push(patch);
    }
  );

  const paddingControl = findControl(container, "card-1", "padding") as MockElement;

  paddingControl.value = "24";
  paddingControl.dispatchEvent({ type: "input" } as unknown as Event);
  assertEqual(changes.length, 1);
  assertEqual(changes[0].padding, 24);

  paddingControl.value = "not-a-number";
  paddingControl.dispatchEvent({ type: "input" } as unknown as Event);
  assertEqual(changes.length, 1);
});

test("Color input emits property changes", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    }
  );

  const colorControl = findControl(container, "card-1", "backgroundColor") as MockElement;
  colorControl.value = "#ff0000";
  colorControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedPatch?.["backgroundColor"], "#ff0000");
});

test("UpdateValues refreshes unfocused controls", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  const api = renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const updatedInstance = createCardInstance("card-1", {
    title: "Updated",
    padding: 32,
    backgroundColor: "#000000",
  }) as unknown as import("@visual-ui/core").ComponentInstance;

  api.updateValues(updatedInstance);

  const titleControl = findControl(container, "card-1", "title") as MockElement;
  const paddingControl = findControl(container, "card-1", "padding") as MockElement;

  assertEqual(titleControl.value, "Updated");
  assertEqual(paddingControl.value, "32");
});

test("UpdateValues skips focused controls", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  const api = renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const titleControl = findControl(container, "card-1", "title") as MockElement;
  document.activeElement = titleControl;

  const updatedInstance = createCardInstance("card-1", {
    title: "Updated",
    padding: 16,
    backgroundColor: "#ffffff",
  }) as unknown as import("@visual-ui/core").ComponentInstance;

  api.updateValues(updatedInstance);

  assertEqual(titleControl.value, "Hello");
  document.activeElement = null;
});

test("Select control is generated for select properties", () => {
  const container = createContainer();
  const instance = {
    id: "button-1",
    type: "button",
    properties: {
      label: "Click",
      variant: "secondary",
      disabled: false,
    },
  };

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const variantControl = findControl(container, "button-1", "variant");
  assertTrue(variantControl !== undefined, "Variant control should exist.");
  assertEqual(variantControl!.nodeName, "SELECT");
  assertEqual(variantControl!.value, "secondary");
});

test("Boolean control is generated for boolean properties", () => {
  const container = createContainer();
  const instance = {
    id: "button-1",
    type: "button",
    properties: {
      label: "Click",
      variant: "primary",
      disabled: true,
    },
  };

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const disabledControl = findControl(container, "button-1", "disabled") as MockElement;
  assertTrue(disabledControl !== undefined, "Disabled control should exist.");
  assertEqual(disabledControl.getAttribute("type"), "checkbox");
  assertEqual(disabledControl.checked, true);
});

test("Does not render unknown property types as text inputs", () => {
  const customRegistry = new ComponentRegistry();
  customRegistry.register({
    type: "custom",
    name: "Custom",
    category: "content",
    description: "Custom component.",
    allowChildren: false,
    properties: [
      {
        name: "unknown",
        type: "unknown" as import("@visual-ui/core").ComponentPropertyType,
        label: "Unknown",
      },
    ],
  });

  const container = createContainer();
  const instance = {
    id: "custom-1",
    type: "custom",
    properties: {},
  };

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    customRegistry,
    () => {}
  );

  const unknownControl = findControl(container, "custom-1", "unknown");
  assertTrue(unknownControl !== undefined, "Unsupported control should exist.");
  assertEqual(unknownControl!.nodeName, "SPAN");
  assertTrue(
    unknownControl!.className.includes("properties-unsupported-message")
  );
});

// -----------------------------------------------------------------------------
// Nested component property controls.
// -----------------------------------------------------------------------------

test("Rendering Text metadata controls", () => {
  const container = createContainer();
  const instance = {
    id: "text-1",
    type: "text",
    properties: {
      content: "Hello",
      color: "#ff0000",
      align: "center",
    },
  };

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const contentControl = findControl(container, "text-1", "content");
  const colorControl = findControl(container, "text-1", "color");
  const alignControl = findControl(container, "text-1", "align");

  assertTrue(contentControl !== undefined, "Content control should exist.");
  assertTrue(colorControl !== undefined, "Color control should exist.");
  assertTrue(alignControl !== undefined, "Align control should exist.");

  assertEqual(contentControl!.value, "Hello");
  assertEqual(colorControl!.value, "#ff0000");
  assertEqual(alignControl!.value, "center");
});

test("Rendering Button metadata controls", () => {
  const container = createContainer();
  const instance = {
    id: "button-1",
    type: "button",
    properties: {
      label: "Submit",
      variant: "secondary",
      disabled: true,
    },
  };

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const labelControl = findControl(container, "button-1", "label");
  const variantControl = findControl(container, "button-1", "variant");
  const disabledControl = findControl(container, "button-1", "disabled");

  assertTrue(labelControl !== undefined, "Label control should exist.");
  assertTrue(variantControl !== undefined, "Variant control should exist.");
  assertTrue(disabledControl !== undefined, "Disabled control should exist.");

  assertEqual(labelControl!.value, "Submit");
  assertEqual(variantControl!.value, "secondary");
  assertEqual(disabledControl!.checked, true);
});

test("Updating nested Text content", () => {
  const container = createContainer();
  const instance = {
    id: "text-1",
    type: "text",
    properties: {
      content: "Initial",
      color: "#000000",
      align: "left",
    },
  };

  let changedId: string | null = null;
  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (id, patch) => {
      changedId = id;
      changedPatch = patch;
    }
  );

  const contentControl = findControl(container, "text-1", "content") as MockElement;
  contentControl.value = "Updated";
  contentControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedId, "text-1");
  assertEqual(changedPatch?.["content"], "Updated");
});

test("Updating nested Button label", () => {
  const container = createContainer();
  const instance = {
    id: "button-1",
    type: "button",
    properties: {
      label: "Old",
      variant: "primary",
      disabled: false,
    },
  };

  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    }
  );

  const labelControl = findControl(container, "button-1", "label") as MockElement;
  labelControl.value = "New";
  labelControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedPatch?.["label"], "New");
});

test("Updating nested Button disabled state", () => {
  const container = createContainer();
  const instance = {
    id: "button-1",
    type: "button",
    properties: {
      label: "Submit",
      variant: "primary",
      disabled: false,
    },
  };

  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    }
  );

  const disabledControl = findControl(
    container,
    "button-1",
    "disabled"
  ) as MockElement;
  disabledControl.checked = true;
  disabledControl.dispatchEvent({ type: "change" } as unknown as Event);

  assertEqual(changedPatch?.["disabled"], true);
});

test("Updating nested Card properties", () => {
  const container = createContainer();
  const instance = {
    id: "nested-card",
    type: "card",
    properties: {
      title: "Nested",
      description: "Desc",
      padding: 8,
      backgroundColor: "#eeeeee",
    },
  };

  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    }
  );

  const titleControl = findControl(container, "nested-card", "title") as MockElement;
  titleControl.value = "Updated Nested";
  titleControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedPatch?.["title"], "Updated Nested");
});

test("Preserving existing root-level Card editing", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Root",
    description: "Root description.",
    padding: 24,
    backgroundColor: "#ffffff",
  });

  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    }
  );

  const titleControl = findControl(container, "card-1", "title") as MockElement;
  titleControl.value = "Updated Root";
  titleControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedPatch?.["title"], "Updated Root");
});

test("Dropdown staticOptions renders as a multiline textarea", () => {
  const container = createContainer();
  const instance = {
    id: "dropdown-1",
    type: "dropdown",
    properties: {
      label: "Choose",
      placeholder: "Select…",
      name: "choice",
      required: false,
      disabled: false,
      staticOptions: "Option A\nOption B\nOption C",
    },
  };

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const staticOptionsControl = findControl(container, "dropdown-1", "staticOptions");
  assertTrue(staticOptionsControl !== undefined, "Static options control should exist.");
  assertEqual(staticOptionsControl!.nodeName, "TEXTAREA");
  assertTrue(
    staticOptionsControl!.className.includes("properties-control--multiline"),
    "Static options control should use the multiline style."
  );
  assertEqual(staticOptionsControl!.value, "Option A\nOption B\nOption C");
});

test("Editing staticOptions updates the instance", () => {
  const container = createContainer();
  const instance = {
    id: "dropdown-1",
    type: "dropdown",
    properties: {
      label: "Choose",
      placeholder: "Select…",
      name: "choice",
      required: false,
      disabled: false,
      staticOptions: "Option A\nOption B",
    },
  };

  let changedId: string | null = null;
  let changedPatch: PropertyPatch | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (id, patch) => {
      changedId = id;
      changedPatch = patch;
    }
  );

  const staticOptionsControl = findControl(container, "dropdown-1", "staticOptions") as MockElement;
  staticOptionsControl.value = "Alpha\nBeta\nGamma";
  staticOptionsControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedId, "dropdown-1");
  assertEqual(changedPatch?.["staticOptions"], "Alpha\nBeta\nGamma");
});

// -----------------------------------------------------------------------------
// Input property editing and undo/redo history.
// -----------------------------------------------------------------------------

function createInputInstance(
  id: string,
  properties: Record<string, string | number | boolean> = {}
) {
  return {
    id,
    type: "input",
    properties: {
      label: "",
      placeholder: "",
      name: "",
      inputType: "text",
      required: false,
      disabled: false,
      readonly: false,
      defaultValue: "",
      ...properties,
    },
  };
}

function inputProperties(
  state: BuilderState,
  id: string
): Record<string, string | number | boolean> {
  return findComponentById(state.getDocument(), id)!.properties;
}

function renderInputPanel(
  state: BuilderState,
  instanceId: string
): MockElement {
  const container = createContainer();
  const instance = findComponentById(state.getDocument(), instanceId)!;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (id, patch) => {
      state.updateInstanceProperties(id, patch, registry);
    }
  );

  return container;
}

test("Input properties render generic controls", () => {
  const container = createContainer();
  const instance = createInputInstance("input-1", {
    inputType: "email",
    maxLength: 20,
    defaultValue: "hello",
  });

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const inputTypeControl = findControl(
    container,
    "input-1",
    "inputType"
  ) as MockElement;
  assertTrue(inputTypeControl !== undefined, "Input type control should exist.");
  assertEqual(inputTypeControl.nodeName, "SELECT");
  const choices = inputTypeControl.children.map((option) => option.value);
  assertEqual(choices.join(","), "text,search,email,number,date,tel,url");
  assertEqual(inputTypeControl.value, "email");

  const maxLengthControl = findControl(
    container,
    "input-1",
    "maxLength"
  ) as MockElement;
  assertTrue(maxLengthControl !== undefined, "Max length control should exist.");
  assertEqual(maxLengthControl.getAttribute("type"), "number");
  assertEqual(maxLengthControl.value, "20");

  const defaultValueControl = findControl(
    container,
    "input-1",
    "defaultValue"
  ) as MockElement;
  assertTrue(
    defaultValueControl !== undefined,
    "Default value control should exist."
  );
  assertEqual(defaultValueControl.getAttribute("type"), "text");
  assertEqual(defaultValueControl.value, "hello");
});

test("Changing inputType, maxLength, and defaultValue updates the instance", () => {
  const state = createBuilderState();
  state.addRootInstance(createInputInstance("input-1"));
  const container = renderInputPanel(state, "input-1");

  const inputTypeControl = findControl(
    container,
    "input-1",
    "inputType"
  ) as MockElement;
  inputTypeControl.value = "email";
  inputTypeControl.dispatchEvent({ type: "change" } as unknown as Event);
  assertEqual(inputProperties(state, "input-1").inputType, "email");

  const maxLengthControl = findControl(
    container,
    "input-1",
    "maxLength"
  ) as MockElement;
  maxLengthControl.value = "20";
  maxLengthControl.dispatchEvent({ type: "input" } as unknown as Event);
  assertEqual(inputProperties(state, "input-1").maxLength, 20);

  const defaultValueControl = findControl(
    container,
    "input-1",
    "defaultValue"
  ) as MockElement;
  defaultValueControl.value = "hello";
  defaultValueControl.dispatchEvent({ type: "input" } as unknown as Event);
  assertEqual(inputProperties(state, "input-1").defaultValue, "hello");
});

test("Clearing maxLength removes the property", () => {
  const state = createBuilderState();
  state.addRootInstance(createInputInstance("input-1", { maxLength: 20 }));
  const container = renderInputPanel(state, "input-1");

  const maxLengthControl = findControl(
    container,
    "input-1",
    "maxLength"
  ) as MockElement;
  assertEqual(maxLengthControl.value, "20");

  maxLengthControl.value = "";
  maxLengthControl.dispatchEvent({ type: "input" } as unknown as Event);

  const properties = inputProperties(state, "input-1");
  assertEqual(properties.maxLength, undefined);
  assertTrue(
    !("maxLength" in properties),
    "maxLength should be removed from the instance."
  );

  maxLengthControl.dispatchEvent({ type: "blur" } as unknown as Event);
  assertEqual(
    maxLengthControl.value,
    "",
    "Cleared maxLength should stay empty."
  );
});

test("Undo and redo restore each input property change", () => {
  const state = createBuilderState();
  state.addRootInstance(createInputInstance("input-1"));
  const container = renderInputPanel(state, "input-1");

  const inputTypeControl = findControl(
    container,
    "input-1",
    "inputType"
  ) as MockElement;
  const maxLengthControl = findControl(
    container,
    "input-1",
    "maxLength"
  ) as MockElement;
  const defaultValueControl = findControl(
    container,
    "input-1",
    "defaultValue"
  ) as MockElement;

  inputTypeControl.value = "email";
  inputTypeControl.dispatchEvent({ type: "change" } as unknown as Event);
  maxLengthControl.value = "20";
  maxLengthControl.dispatchEvent({ type: "input" } as unknown as Event);
  defaultValueControl.value = "hello";
  defaultValueControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(inputProperties(state, "input-1").inputType, "email");
  assertEqual(inputProperties(state, "input-1").maxLength, 20);
  assertEqual(inputProperties(state, "input-1").defaultValue, "hello");
  assertTrue(state.canUndo(), "Expected undo to be available.");
  assertTrue(!state.canRedo(), "Redo should not be available before an undo.");

  state.undo();
  assertEqual(inputProperties(state, "input-1").defaultValue, "");
  assertEqual(inputProperties(state, "input-1").maxLength, 20);
  assertEqual(inputProperties(state, "input-1").inputType, "email");
  assertTrue(state.canRedo(), "Expected redo to be available.");

  state.redo();
  assertEqual(inputProperties(state, "input-1").defaultValue, "hello");

  state.undo();
  state.undo();
  assertEqual(inputProperties(state, "input-1").maxLength, undefined);
  assertEqual(inputProperties(state, "input-1").inputType, "email");

  state.redo();
  state.redo();
  assertEqual(inputProperties(state, "input-1").maxLength, 20);
  assertEqual(inputProperties(state, "input-1").defaultValue, "hello");

  state.undo();
  state.undo();
  state.undo();
  assertEqual(inputProperties(state, "input-1").inputType, "text");
  assertEqual(inputProperties(state, "input-1").maxLength, undefined);
  assertEqual(inputProperties(state, "input-1").defaultValue, "");

  state.redo();
  state.redo();
  state.redo();
  assertEqual(inputProperties(state, "input-1").inputType, "email");
  assertEqual(inputProperties(state, "input-1").maxLength, 20);
  assertEqual(inputProperties(state, "input-1").defaultValue, "hello");
});

test("Input edits serialize to and from JSON", () => {
  const state = createBuilderState();
  state.addRootInstance(createInputInstance("input-1"));
  const container = renderInputPanel(state, "input-1");

  const inputTypeControl = findControl(
    container,
    "input-1",
    "inputType"
  ) as MockElement;
  inputTypeControl.value = "search";
  inputTypeControl.dispatchEvent({ type: "change" } as unknown as Event);

  const maxLengthControl = findControl(
    container,
    "input-1",
    "maxLength"
  ) as MockElement;
  maxLengthControl.value = "12";
  maxLengthControl.dispatchEvent({ type: "input" } as unknown as Event);

  const defaultValueControl = findControl(
    container,
    "input-1",
    "defaultValue"
  ) as MockElement;
  defaultValueControl.value = "seed";
  defaultValueControl.dispatchEvent({ type: "input" } as unknown as Event);

  const json = JSON.stringify(state.getDocument());
  const parsed = JSON.parse(json) as BuilderDocument;
  const parsedProperties = findComponentById(parsed, "input-1")!.properties;
  assertEqual(parsedProperties.inputType, "search");
  assertEqual(parsedProperties.maxLength, 12);
  assertEqual(parsedProperties.defaultValue, "seed");

  const restoredState = createBuilderState(parsed);
  assertEqual(inputProperties(restoredState, "input-1").inputType, "search");
  assertEqual(inputProperties(restoredState, "input-1").maxLength, 12);
  assertEqual(inputProperties(restoredState, "input-1").defaultValue, "seed");
});

const passed = results.filter((result) => result.passed).length;
const failed = results.filter((result) => !result.passed).length;

for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name}`);
  if (result.error) {
    console.log(`  ${result.error}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed.`);
}

export {};
