/**
 * Focused tests for the Data Source editor in the Properties panel.
 *
 * Covers: capability visibility (shown only for dataBinding components),
 * static vs REST GET switching, valid REST config commits, invalid config
 * rejection, mapping paths, state updates, undo/redo, and JSON
 * serialization. No live requests are issued.
 */

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

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`
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
const { createBuilderState } = await import("../../state/builder-state.ts");
const { findComponentById } = await import(
  "../../state/builder-document.ts"
);

const registry = new ComponentRegistry();
registerSampleDefinitions(registry);

const document = globalThis.document as {
  createElement: (tagName: string) => MockElement;
  activeElement: MockElement | null;
};

function createContainer(): MockElement {
  return document.createElement("div");
}

function findDataSourceSection(container: MockElement): MockElement | undefined {
  const form = container.children[0];
  if (!form) {
    return undefined;
  }
  const walk = (element: MockElement): MockElement | undefined => {
    if (element.className.includes("properties-data-source")) {
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

function findControlByClass(
  container: MockElement,
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
  return walk(container);
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
// Tests: Capability visibility.
// -----------------------------------------------------------------------

test("Data source editor is rendered for Card (has dataBinding)", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {}
  );

  const section = findDataSourceSection(container);
  assertTrue(section !== undefined, "Data source section should be present for Card.");
});

test("Data source editor is NOT rendered for Text (no dataBinding)", () => {
  const container = createContainer();
  const instance = createTextInstance("text-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {}
  );

  const section = findDataSourceSection(container);
  assertEqual(
    section,
    undefined,
    "Data source section should NOT be present for Text (no dataBinding declared)."
  );
});

test("Data source editor is NOT rendered when onDataSourceChange is omitted", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined
    // onDataSourceChange intentionally omitted
  );

  const section = findDataSourceSection(container);
  assertEqual(
    section,
    undefined,
    "Data source section should NOT be present when handler is not provided."
  );
});

// -----------------------------------------------------------------------
// Tests: Static (default) source.
// -----------------------------------------------------------------------

test("Initial state defaults to static (no data source)", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committed: import("@visual-ui/core").DataSource | undefined | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    (_id, dataSource) => {
      committed = dataSource;
    }
  );

  // The type select should default to "static".
  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement | undefined;
  assertTrue(typeSelect !== undefined, "Type select should exist.");
  assertEqual(typeSelect!.value, "static");
  assertEqual(committed, null, "No commit should fire on initial render.");
});

// -----------------------------------------------------------------------
// Tests: Switching to REST GET.
// -----------------------------------------------------------------------

test("Switching to REST GET renders REST fields without committing", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committed: import("@visual-ui/core").DataSource | undefined | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    (_id, dataSource) => {
      committed = dataSource;
    }
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;

  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  // Switching to REST type renders the REST fields but does NOT commit
  // (the empty URL is not yet valid to persist).
  assertEqual(committed, null, "Empty URL should not commit on type switch.");

  // The REST-specific fields should now be rendered.
  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement | undefined;
  assertTrue(urlInput !== undefined, "URL input should appear after switching to REST.");
});

test("Switching to static after setting REST clears the data source", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  const commits: (import("@visual-ui/core").DataSource | undefined)[] = [];

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    (_id, dataSource) => {
      commits.push(dataSource);
    }
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;

  // Switch to REST first.
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  // Now switch back to static.
  typeSelect.value = "static";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  // The last commit should be a static data source.
  const last = commits[commits.length - 1];
  assertEqual(last?.type, "static");
});

// -----------------------------------------------------------------------
// Tests: Valid REST config commits.
// -----------------------------------------------------------------------

test("Valid REST config with all fields commits correctly", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committed: import("@visual-ui/core").DataSource | undefined | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    (_id, dataSource) => {
      committed = dataSource;
    }
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement;
  urlInput.value = "https://api.example.com/items";
  urlInput.dispatchEvent({ type: "input" } as unknown as Event);

  assertTrue(committed !== null, "Commit should fire after valid URL.");
  assertEqual(committed!.type, "rest");
  const rest = committed! as import("@visual-ui/core").RestDataSource;
  assertEqual(rest.url, "https://api.example.com/items");
  assertEqual(rest.method, "GET");
  assertEqual(rest.loadOn, "mount");
});

test("Response path is committed when valid", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committed: import("@visual-ui/core").DataSource | undefined | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    (_id, dataSource) => {
      committed = dataSource;
    }
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement;
  urlInput.value = "https://api.example.com/items";
  urlInput.dispatchEvent({ type: "input" } as unknown as Event);

  const responsePathInput = findControlByClass(
    container,
    "properties-datasource-response-path"
  ) as MockElement;
  assertTrue(responsePathInput !== undefined, "Response path input should exist.");
  responsePathInput.value = "data.items";
  responsePathInput.dispatchEvent({ type: "input" } as unknown as Event);

  const rest = committed! as import("@visual-ui/core").RestDataSource;
  assertEqual(rest.responsePath, "data.items");
});

test("Label and value mapping paths are committed", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let committed: import("@visual-ui/core").DataSource | undefined | null = null;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    (_id, dataSource) => {
      committed = dataSource;
    }
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement;
  urlInput.value = "https://api.example.com/items";
  urlInput.dispatchEvent({ type: "input" } as unknown as Event);

  const labelInput = findControlByClass(
    container,
    "properties-datasource-label-mapping"
  ) as MockElement;
  assertTrue(labelInput !== undefined, "Label mapping input should exist.");
  labelInput.value = "name";
  labelInput.dispatchEvent({ type: "input" } as unknown as Event);

  const valueInput = findControlByClass(
    container,
    "properties-datasource-value-mapping"
  ) as MockElement;
  assertTrue(valueInput !== undefined, "Value mapping input should exist.");
  valueInput.value = "id";
  valueInput.dispatchEvent({ type: "input" } as unknown as Event);

  const rest = committed! as import("@visual-ui/core").RestDataSource;
  assertDeepEqual(rest.mapping, { label: "name", value: "id" });
});

// -----------------------------------------------------------------------
// Tests: Invalid config rejection.
// -----------------------------------------------------------------------

test("Empty endpoint URL is rejected and not committed", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  let commitCount = 0;

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {
      commitCount += 1;
    }
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  // No URL entered — commit should not fire.
  assertEqual(commitCount, 0, "Empty URL should not commit.");
});

test("Invalid response path shows validation error", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {}
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement;
  urlInput.value = "https://api.example.com/items";
  urlInput.dispatchEvent({ type: "input" } as unknown as Event);

  const responsePathInput = findControlByClass(
    container,
    "properties-datasource-response-path"
  ) as MockElement;
  responsePathInput.value = "data..items";
  responsePathInput.dispatchEvent({ type: "input" } as unknown as Event);

  const validationEl = findControlByClass(
    container,
    "properties-datasource-validation-message"
  ) as MockElement;
  assertIncludes(validationEl.textContent, "not a valid safe path");
});

test("Invalid mapping path shows validation error", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {}
  );

  const typeSelect = findControlByClass(
    container,
    "properties-datasource-type"
  ) as MockElement;
  typeSelect.value = "rest";
  typeSelect.dispatchEvent({ type: "change" } as unknown as Event);

  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement;
  urlInput.value = "https://api.example.com/items";
  urlInput.dispatchEvent({ type: "input" } as unknown as Event);

  const labelInput = findControlByClass(
    container,
    "properties-datasource-label-mapping"
  ) as MockElement;
  labelInput.value = "user[";
  labelInput.dispatchEvent({ type: "input" } as unknown as Event);

  const validationEl = findControlByClass(
    container,
    "properties-datasource-validation-message"
  ) as MockElement;
  assertIncludes(validationEl.textContent, "not a valid safe path");
  assertIncludes(validationEl.textContent, "label");
});

// -----------------------------------------------------------------------
// Tests: State updates (undo/redo).
// -----------------------------------------------------------------------

test("updateInstanceDataSource adds a data source", () => {
  const state = createBuilderState();
  const instance = createCardInstance("card-1");
  state.addRootInstance(
    instance as unknown as import("@visual-ui/core").ComponentInstance
  );

  const dataSource: import("@visual-ui/core").RestDataSource = {
    type: "rest",
    method: "GET",
    url: "https://api.example.com/items",
    responsePath: "data.items",
    mapping: { label: "name", value: "id" },
    loadOn: "mount",
  };

  state.updateInstanceDataSource(
    "card-1",
    dataSource,
    registry as unknown as import("@visual-ui/core").ComponentRegistry
  );

  const updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.dataSource?.type, "rest");
  const rest = updated.dataSource as import("@visual-ui/core").RestDataSource;
  assertEqual(rest.url, "https://api.example.com/items");
  assertDeepEqual(rest.mapping, { label: "name", value: "id" });
});

test("undo after data source update restores previous state", () => {
  const state = createBuilderState();
  const instance = createCardInstance("card-1");
  state.addRootInstance(
    instance as unknown as import("@visual-ui/core").ComponentInstance
  );

  const dataSource: import("@visual-ui/core").RestDataSource = {
    type: "rest",
    method: "GET",
    url: "https://api.example.com/items",
    loadOn: "mount",
  };

  state.updateInstanceDataSource(
    "card-1",
    dataSource,
    registry as unknown as import("@visual-ui/core").ComponentRegistry
  );

  let updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.dataSource !== undefined, true);

  state.undo();
  updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.dataSource, undefined);
});

test("redo after undo restores data source", () => {
  const state = createBuilderState();
  const instance = createCardInstance("card-1");
  state.addRootInstance(
    instance as unknown as import("@visual-ui/core").ComponentInstance
  );

  const dataSource: import("@visual-ui/core").RestDataSource = {
    type: "rest",
    method: "GET",
    url: "https://api.example.com/items",
    loadOn: "mount",
  };

  state.updateInstanceDataSource(
    "card-1",
    dataSource,
    registry as unknown as import("@visual-ui/core").ComponentRegistry
  );

  state.undo();
  state.redo();

  const updated = findComponentById(state.getDocument(), "card-1")!;
  const rest = updated.dataSource as import("@visual-ui/core").RestDataSource;
  assertEqual(rest.url, "https://api.example.com/items");
});

test("updateInstanceDataSource throws for invalid data source", () => {
  const state = createBuilderState();
  const instance = createCardInstance("card-1");
  state.addRootInstance(
    instance as unknown as import("@visual-ui/core").ComponentInstance
  );

  const badDataSource = {
    type: "rest",
    method: "GET",
    url: "javascript:alert(1)",
    loadOn: "mount",
  } as import("@visual-ui/core").RestDataSource;

  let threw = false;
  try {
    state.updateInstanceDataSource(
      "card-1",
      badDataSource,
      registry as unknown as import("@visual-ui/core").ComponentRegistry
    );
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : "";
    assertTrue(
      message.includes("scheme") || message.includes("URL"),
      `Expected URL validation error, got: ${message}`
    );
  }
  assertTrue(threw, "Expected invalid URL scheme to throw.");
});

test("updateInstanceDataSource clears data source when passed undefined", () => {
  const state = createBuilderState();
  const instance = {
    ...createCardInstance("card-1"),
    dataSource: {
      type: "rest",
      method: "GET",
      url: "https://api.example.com/items",
      loadOn: "mount",
    },
  };
  state.addRootInstance(
    instance as unknown as import("@visual-ui/core").ComponentInstance
  );

  state.updateInstanceDataSource(
    "card-1",
    undefined,
    registry as unknown as import("@visual-ui/core").ComponentRegistry
  );

  const updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.dataSource, undefined);
});

// -----------------------------------------------------------------------
// Tests: updateValues refreshes data source editor.
// -----------------------------------------------------------------------

test("updateValues refreshes the data source editor to reflect persisted state", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  const api = renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {}
  );

  const updatedInstance = {
    ...createCardInstance("card-1"),
    dataSource: {
      type: "rest",
      method: "GET",
      url: "https://api.example.com/items",
      loadOn: "mount",
    },
  };

  api.updateValues(
    updatedInstance as unknown as import("@visual-ui/core").ComponentInstance
  );

  const urlInput = findControlByClass(
    container,
    "properties-datasource-url"
  ) as MockElement | undefined;
  assertTrue(urlInput !== undefined, "URL input should exist after refresh.");
  assertEqual(urlInput!.value, "https://api.example.com/items");
});

// -----------------------------------------------------------------------
// Tests: CORS/auth limitation notice.
// -----------------------------------------------------------------------

test("CORS/auth limitation notice is rendered", () => {
  const container = createContainer();
  const instance = createCardInstance("card-1");

  renderPropertiesPanel(
    container as unknown as HTMLElement,
    instance as unknown as import("@visual-ui/core").ComponentInstance,
    registry,
    () => {},
    undefined,
    undefined,
    () => {}
  );

  const notice = findControlByClass(
    container,
    "properties-datasource-notice"
  ) as MockElement | undefined;
  assertTrue(notice !== undefined, "Limitation notice should be rendered.");
  assertIncludes(notice!.textContent, "CORS");
  assertIncludes(notice!.textContent, "auth");
});

// -----------------------------------------------------------------------
// Tests: JSON serialization round-trip.
// -----------------------------------------------------------------------

test("Data source survives JSON round-trip serialization", () => {
  const instance: import("@visual-ui/core").ComponentInstance = {
    id: "card-1",
    type: "card",
    properties: { title: "Hello" },
    dataSource: {
      type: "rest",
      method: "GET",
      url: "https://api.example.com/items",
      responsePath: "data.items",
      mapping: { label: "name", value: "id" },
      loadOn: "mount",
    },
  };

  const roundTripped = JSON.parse(
    JSON.stringify(instance)
  ) as import("@visual-ui/core").ComponentInstance;

  assertDeepEqual(roundTripped.dataSource, instance.dataSource);
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
