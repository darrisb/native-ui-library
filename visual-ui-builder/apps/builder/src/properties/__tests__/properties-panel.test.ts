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
  let changedPatch: Record<string, string | number | boolean> | null = null;

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

  let changedPatch: Record<string, string | number | boolean> | null = null;

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

  const changes: Record<string, string | number | boolean>[] = [];

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

  let changedPatch: Record<string, string | number | boolean> | null = null;

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
  let changedPatch: Record<string, string | number | boolean> | null = null;

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

  let changedPatch: Record<string, string | number | boolean> | null = null;

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

  let changedPatch: Record<string, string | number | boolean> | null = null;

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

  let changedPatch: Record<string, string | number | boolean> | null = null;

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

  let changedPatch: Record<string, string | number | boolean> | null = null;

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

// -----------------------------------------------------------------------------
// Delete Component action.
// -----------------------------------------------------------------------------

function findDeleteButton(container: MockElement): MockElement | undefined {
  const form = container.children[0];
  if (!form) {
    return undefined;
  }
  const walk = (element: MockElement): MockElement | undefined => {
    if (
      element.nodeName === "BUTTON" &&
      element.className.includes("properties-delete-button")
    ) {
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
  return walk(form);
}

test("Delete action appears for selected components", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    () => {}
  );

  const deleteButton = findDeleteButton(container);
  assertTrue(deleteButton !== undefined, "Delete button should be present.");
  assertEqual(deleteButton!.textContent, "Delete Component");
});

test("Delete action is absent without selection", () => {
  const container = createContainer();
  renderPropertiesPanel(
    container as unknown as HTMLElement,
    null,
    registry,
    () => {},
    () => {}
  );

  const deleteButton = findDeleteButton(container);
  assertEqual(deleteButton, undefined, "Delete button should be absent.");
});

test("Delete action is absent when onDelete is not provided", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {}
  );

  const deleteButton = findDeleteButton(container);
  assertEqual(
    deleteButton,
    undefined,
    "Delete button should be absent when no handler is supplied."
  );
});

test("Clicking Delete invokes the handler with the instance id", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  let deletedId: string | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    (id) => {
      deletedId = id;
    }
  );

  const deleteButton = findDeleteButton(container) as MockElement;
  deleteButton.dispatchEvent({ type: "click" } as unknown as Event);

  assertEqual(deletedId, "card-1");
});

test("Delete button preserves property editing", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });

  let changedPatch: Record<string, string | number | boolean> | null = null;
  let deleted = false;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    (_id, patch) => {
      changedPatch = patch;
    },
    () => {
      deleted = true;
    }
  );

  const titleControl = findControl(container, "card-1", "title") as MockElement;
  titleControl.value = "Updated";
  titleControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertEqual(changedPatch?.["title"], "Updated");
  assertEqual(deleted, false);
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
