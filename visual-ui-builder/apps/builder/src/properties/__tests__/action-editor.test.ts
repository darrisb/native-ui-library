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

function assertIncludes(value: string, substring: string, message?: string): void {
  if (!value.includes(substring)) {
    throw new Error(
      message ?? `Expected "${value}" to include "${substring}".`
    );
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

  set innerHTML(_value: string) {
    // Setting innerHTML clears all children, matching browser behavior.
    this.children.length = 0;
  }

  get innerHTML(): string {
    return "";
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

function findActionsSection(container: MockElement): MockElement | undefined {
  const form = container.children[0];
  if (!form) {
    return undefined;
  }
  const walk = (element: MockElement): MockElement | undefined => {
    if (element.className.includes("properties-actions")) {
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

function findActionRows(container: MockElement): MockElement[] {
  const actionsSection = findActionsSection(container);
  if (!actionsSection) {
    return [];
  }
  const section = actionsSection.children[0]; // properties-actions-section
  if (!section) {
    return [];
  }
  return section.children.filter((child) =>
    child.className.includes("properties-action-row")
  );
}

function findAddActionButton(container: MockElement): MockElement | undefined {
  const actionsSection = findActionsSection(container);
  if (!actionsSection) {
    return undefined;
  }
  const section = actionsSection.children[0]; // properties-actions-section
  if (!section) {
    return undefined;
  }
  const walk = (element: MockElement): MockElement | undefined => {
    if (
      element.nodeName === "BUTTON" &&
      element.className.includes("properties-action-add")
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
  return walk(section);
}

function findRemoveButton(row: MockElement): MockElement | undefined {
  const walk = (element: MockElement): MockElement | undefined => {
    if (
      element.nodeName === "BUTTON" &&
      element.className.includes("properties-action-remove")
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
  return walk(row);
}

function getControlInRow(
  row: MockElement,
  classNameSubstring: string
): MockElement | undefined {
  const walk = (element: MockElement): MockElement | undefined => {
    if (element.className.includes(classNameSubstring)) {
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
  return walk(row);
}

function createCardInstance(
  id: string,
  properties: Record<string, string | number | boolean> = {}
) {
  return {
    id,
    type: "card",
    properties: {
      title: "Hello",
      padding: 16,
      backgroundColor: "#ffffff",
      ...properties,
    },
  };
}

function createButtonInstance(
  id: string,
  properties: Record<string, string | number | boolean> = {}
) {
  return {
    id,
    type: "button",
    properties: {
      label: "Click",
      variant: "primary",
      disabled: false,
      ...properties,
    },
  };
}

function createTextInstance(
  id: string,
  properties: Record<string, string | number | boolean> = {}
) {
  return {
    id,
    type: "text",
    properties: {
      content: "Hello",
      color: "#000000",
      align: "left",
      ...properties,
    },
  };
}

// -----------------------------------------------------------------------
// Tests: Actions section visibility.
// -----------------------------------------------------------------------

test("Actions section is rendered for Card (has events)", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {}
  );

  const actionsSection = findActionsSection(container);
  assertTrue(actionsSection !== undefined, "Actions section should be present for Card.");
});

test("Actions section is rendered for Button (has events)", () => {
  const container = createContainer();
  const instance = createButtonInstance("button-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {}
  );

  const actionsSection = findActionsSection(container);
  assertTrue(actionsSection !== undefined, "Actions section should be present for Button.");
});

test("Actions section is NOT rendered for Text (no events)", () => {
  const container = createContainer();
  const instance = createTextInstance("text-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {}
  );

  const actionsSection = findActionsSection(container);
  assertEqual(
    actionsSection,
    undefined,
    "Actions section should NOT be present for Text (no events declared)."
  );
});

test("Actions section is NOT rendered when onActionsChange is omitted", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    () => {},
    undefined     // 6th = onActionsChange (undefined/omitted)
  );

  const actionsSection = findActionsSection(container);
  assertEqual(
    actionsSection,
    undefined,
    "Actions section should NOT be present when onActionsChange is not provided."
  );
});

// -----------------------------------------------------------------------
// Tests: Adding actions.
// -----------------------------------------------------------------------

test("Add Action button is present and creates an action", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committedActions: import("@visual-ui/core").ComponentAction[] | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    (_id, actions) => {
      committedActions = [...actions];
    }
  );

  const addButton = findAddActionButton(container);
  assertTrue(addButton !== undefined, "Add Action button should exist.");

  (addButton as MockElement).dispatchEvent({ type: "click" } as unknown as Event);

  assertTrue(committedActions !== null, "Action commit should have fired.");
  assertEqual(committedActions!.length, 1);
  assertEqual(committedActions![0].type, "navigate");
  assertEqual(committedActions![0].event, "click");
});

test("Adding an action renders a new action row", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {}
  );

  const addButton = findAddActionButton(container) as MockElement;
  addButton.dispatchEvent({ type: "click" } as unknown as Event);

  const rows = findActionRows(container);
  assertEqual(rows.length, 1, "One action row should exist after adding.");
});

test("New action pre-fills default target as _self", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committedActions: import("@visual-ui/core").ComponentAction[] | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    (_id, actions) => {
      committedActions = [...actions];
    }
  );

  const addButton = findAddActionButton(container) as MockElement;
  addButton.dispatchEvent({ type: "click" } as unknown as Event);

  const action = committedActions![0] as import("@visual-ui/core").NavigateAction;
  assertEqual(action.config.target, "_self");
});

// -----------------------------------------------------------------------
// Tests: Editing actions.
// -----------------------------------------------------------------------

test("Editing URL in an action row commits the change", () => {
  const existingAction: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://initial.com", target: "_self" },
  };
  const container = createContainer();
  const instance = {
    ...createCardInstance("card-1"),
    actions: [existingAction],
  };

  let committedActions: import("@visual-ui/core").ComponentAction[] | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    (_id, actions) => {
      committedActions = [...actions];
    }
  );

  const rows = findActionRows(container);
  assertEqual(rows.length, 1);

  const urlControl = getControlInRow(rows[0], "properties-action-url") as MockElement;
  assertTrue(urlControl !== undefined, "URL input should exist.");
  assertEqual(urlControl.value, "https://initial.com");

  urlControl.value = "https://updated.com";
  urlControl.dispatchEvent({ type: "input" } as unknown as Event);

  assertTrue(committedActions !== null, "Commit should have fired.");
  const action = committedActions![0] as import("@visual-ui/core").NavigateAction;
  assertEqual(action.config.url, "https://updated.com");
});

test("Editing target in an action row commits the change", () => {
  const existingAction: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com", target: "_self" },
  };
  const container = createContainer();
  const instance = {
    ...createCardInstance("card-1"),
    actions: [existingAction],
  };

  let committedActions: import("@visual-ui/core").ComponentAction[] | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    (_id, actions) => {
      committedActions = [...actions];
    }
  );

  const rows = findActionRows(container);
  const targetControl = getControlInRow(rows[0], "properties-action-target") as MockElement;
  assertTrue(targetControl !== undefined, "Target select should exist.");
  assertEqual(targetControl.value, "_self");

  targetControl.value = "_blank";
  targetControl.dispatchEvent({ type: "change" } as unknown as Event);

  const action = committedActions![0] as import("@visual-ui/core").NavigateAction;
  assertEqual(action.config.target, "_blank");
});

test("Empty URL shows error and does not commit", () => {
  const existingAction: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };
  const container = createContainer();
  const instance = {
    ...createCardInstance("card-1"),
    actions: [existingAction],
  };

  let commitCount = 0;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {
      commitCount += 1;
    }
  );

  const rows = findActionRows(container);
  const urlControl = getControlInRow(rows[0], "properties-action-url") as MockElement;

  // Set to empty string.
  urlControl.value = "";
  urlControl.dispatchEvent({ type: "input" } as unknown as Event);

  // Should NOT have committed with empty URL.
  assertEqual(commitCount, 0, "Empty URL should not commit.");

  // Row error should be visible.
  const rowError = getControlInRow(rows[0], "properties-action-row-error") as MockElement;
  assertTrue(rowError !== undefined, "Row error element should exist.");
  assertIncludes(rowError.textContent, "URL is required");
});

// -----------------------------------------------------------------------
// Tests: Removing actions.
// -----------------------------------------------------------------------

test("Remove button deletes the action row and commits removal", () => {
  const existingAction: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };
  const container = createContainer();
  const instance = {
    ...createCardInstance("card-1"),
    actions: [existingAction],
  };

  let committedActions: import("@visual-ui/core").ComponentAction[] | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    (_id, actions) => {
      committedActions = [...actions];
    }
  );

  const rows = findActionRows(container);
  assertEqual(rows.length, 1);

  const removeButton = findRemoveButton(rows[0]) as MockElement;
  assertTrue(removeButton !== undefined, "Remove button should exist.");

  removeButton.dispatchEvent({ type: "click" } as unknown as Event);

  assertTrue(committedActions !== null, "Commit should have fired on removal.");
  assertEqual(committedActions!.length, 0, "Actions should be empty after removal.");
});

// -----------------------------------------------------------------------
// Tests: Existing property controls are preserved.
// -----------------------------------------------------------------------

test("Action editor does not interfere with property controls", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1", { title: "My Card" });

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {}
  );

  // Verify property controls still exist.
  const form = container.children[0];
  const titleLabel = (() => {
    const walk = (element: MockElement): boolean => {
      if (element.textContent === "Title") {
        return true;
      }
      return element.children.some(walk);
    };
    return walk(form);
  })();
  assertTrue(titleLabel, "Title label should still be present.");
});

test("Delete button is still rendered alongside action editor", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    () => {},     // 5th = onDelete (provided so button renders)
    () => {}      // 6th = onActionsChange
  );

  const form = container.children[0];
  const walk = (element: MockElement): boolean => {
    if (
      element.nodeName === "BUTTON" &&
      element.className.includes("properties-delete-button")
    ) {
      return true;
    }
    return element.children.some(walk);
  };
  assertTrue(walk(form), "Delete button should still be present.");
});

// -----------------------------------------------------------------------
// Tests: Canvas selection does not trigger navigation.
// -----------------------------------------------------------------------

test("Action editor uses proper controls (no anchor tags that navigate)", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    () => {}
  );

  // Walk the entire form and ensure there are no anchor elements.
  const form = container.children[0];
  const walk = (element: MockElement): boolean => {
    if (element.nodeName === "A") {
      return true;
    }
    return element.children.some(walk);
  };
  assertTrue(!walk(form), "No anchor elements should be rendered (canvas selection must not navigate).");
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
