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

function assertUndefined(value: unknown, message?: string): void {
  if (value !== undefined) {
    throw new Error(message ?? `Expected undefined, but got ${String(value)}.`);
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

class MockClassList {
  private readonly owner: MockElement;

  constructor(owner: MockElement) {
    this.owner = owner;
  }

  add(name: string): void {
    if (!this.contains(name)) {
      this.owner.className = `${this.owner.className} ${name}`.trim();
    }
  }

  remove(name: string): void {
    this.owner.className = this.owner.className
      .split(" ")
      .filter((entry) => entry !== name)
      .join(" ");
  }

  contains(name: string): boolean {
    return this.owner.className.split(" ").includes(name);
  }
}

interface MockRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

class MockElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly children: MockElement[] = [];
  readonly style = new MockStyle();
  readonly classList = new MockClassList(this);
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  rect: MockRect = { top: 0, bottom: 0, left: 0, right: 0 };
  shadowRoot: MockElement | null = null;

  private valueInternal = "";
  private checkedInternal = false;
  private idInternal = "";
  private readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor(nodeName: string, createShadowRoot = true) {
    this.nodeName = nodeName.toLowerCase();
    if (createShadowRoot) {
      this.shadowRoot = new MockElement("shadow-root", false);
    }
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

  removeAttribute(name: string): void {
    this.attributes.delete(name.toLowerCase());
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
    return child;
  }

  replaceChildren(...children: MockElement[]): void {
    this.children.length = 0;
    this.children.push(...children);
  }

  set innerHTML(value: string) {
    if (value === "") {
      this.children.length = 0;
    }
  }

  getBoundingClientRect(): MockRect {
    return this.rect;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  fire(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }

  dispatchEvent(event: Event): boolean {
    (event as unknown as { target: MockElement }).target = this;
    this.fire(event.type, event);
    return true;
  }
}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  class MockHTMLElement extends MockElement {}

  globals.HTMLElement = MockHTMLElement;
  globals.document = {
    createElement: (tagName: string): MockElement => {
      return new MockHTMLElement(tagName);
    },
    activeElement: null as MockElement | null,
  };
}

installMockDom();

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);
const {
  getNativeComponentRegistry,
  registerNativeComponents,
} = await import("@visual-ui/components");
const { renderBuilderCanvas } = await import("../builder-canvas.ts");
const { renderPropertiesPanel } = await import(
  "../../properties/properties-panel.ts"
);
const { findComponentById } = await import("../../state/builder-document.ts");
const { createBuilderState } = await import("../../state/builder-state.ts");
const { createNestedBuilderDocument } = await import(
  "../../fixtures/nested-document.ts"
);
type ComponentInstance = import("@visual-ui/core").ComponentInstance;
type PropertiesPanelApi = import(
  "../../properties/properties-panel.ts"
).PropertiesPanelApi;

const document = globalThis.document as {
  createElement: (tagName: string) => MockElement;
  activeElement: MockElement | null;
};

function createContainer(): MockElement {
  return document.createElement("div");
}

function createNestedRegistry() {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerNativeComponents(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

function getBoundary(container: MockElement): MockElement {
  return container.children[0];
}

function getContent(container: MockElement): MockElement {
  return getBoundary(container).children[0];
}

function getCardWrapper(container: MockElement, index: number): MockElement {
  return getContent(container).children[index];
}

function getCard(container: MockElement, index: number): MockElement {
  return getCardWrapper(container, index).children[0];
}

function findElementById(
  root: MockElement,
  id: string
): MockElement | undefined {
  if (root.dataset.instanceId === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findElementById(child, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findDeleteButton(container: MockElement): MockElement | undefined {
  const form = container.children[0];
  if (!form) {
    return undefined;
  }
  const walk = (element: MockElement): MockElement | undefined => {
    if (
      element.nodeName === "button" &&
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

function findPropertiesForm(container: MockElement): MockElement | undefined {
  const form = container.children[0];
  if (!form) {
    return undefined;
  }
  if (form.className.includes("properties-form")) {
    return form;
  }
  return undefined;
}

function findPropertiesEmptyState(container: MockElement): boolean {
  const child = container.children[0];
  if (!child) {
    return false;
  }
  return child.className.includes("properties-empty-message");
}

/**
 * Wires a shared BuilderState to both the builder canvas and the properties
 * panel the same way `renderAppShell` does: state changes re-render the canvas,
 * and selection changes re-render the properties panel. The delete handler
 * wired into the properties panel calls `state.deleteComponent`.
 */
function createDeletionHarness() {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const state = createBuilderState(createNestedBuilderDocument());
  const canvasContainer = createContainer();
  const propertiesContainer = createContainer();

  let propertiesApi: PropertiesPanelApi | null = null;

  const refreshPropertiesPanel = (): void => {
    const selectedId = state.getSelectedInstanceId();
    const selectedInstance = selectedId
      ? (findComponentById(state.getDocument(), selectedId) ?? null)
      : null;

    if (!selectedInstance) {
      propertiesApi?.destroy();
      propertiesApi = renderPropertiesPanel(
        propertiesContainer as unknown as HTMLElement,
        null,
        metadataRegistry,
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
      propertiesContainer as unknown as HTMLElement,
      selectedInstance as unknown as ComponentInstance,
      metadataRegistry,
      (instanceId, patch) => {
        state.updateInstanceProperties(instanceId, patch, metadataRegistry);
      },
      (instanceId) => {
        state.deleteComponent(instanceId);
      }
    );
  };

  const renderCanvas = (): void => {
    renderBuilderCanvas(
      canvasContainer as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => {
          state.selectInstance(id);
        },
      }
    );
  };

  state.subscribe(() => {
    renderCanvas();
    refreshPropertiesPanel();
  });

  state.subscribeToSelection(() => {
    renderCanvas();
    refreshPropertiesPanel();
  });

  renderCanvas();
  refreshPropertiesPanel();

  return {
    state,
    canvasContainer,
    propertiesContainer,
    metadataRegistry,
    getPropertiesApi: () => propertiesApi,
  };
}

/**
 * Selects an instance through state (mirrors clicking it on the canvas),
 * which triggers the properties panel to render with a delete button.
 */
function selectInstance(harness: ReturnType<typeof createDeletionHarness>, id: string): void {
  harness.state.selectInstance(id);
}

/**
 * Clicks the rendered Delete Component button, which invokes
 * `state.deleteComponent` through the wired handler.
 */
function clickDeleteButton(
  harness: ReturnType<typeof createDeletionHarness>
): void {
  const deleteButton = findDeleteButton(harness.propertiesContainer);
  assertTrue(
    deleteButton !== undefined,
    "Delete button should be present for the selected component."
  );
  deleteButton!.dispatchEvent({ type: "click" } as unknown as Event);
}

// -----------------------------------------------------------------------------
// Root Card deletion updates the canvas.
// -----------------------------------------------------------------------------

test("Root Card deletion updates the canvas to the empty state", () => {
  const harness = createDeletionHarness();

  // The nested document renders exactly one root Card on the canvas.
  assertEqual(harness.state.getDocument().rootInstances.length, 1);
  assertEqual(getContent(harness.canvasContainer).children.length, 1);

  selectInstance(harness, "root-card");
  clickDeleteButton(harness);

  assertEqual(harness.state.getDocument().rootInstances.length, 0);
  assertEqual(harness.state.getSelectedInstanceId(), null);

  // The canvas re-renders to the empty state once the document is empty.
  const boundary = getBoundary(harness.canvasContainer);
  assertEqual(boundary.children.length, 1);
  assertTrue(
    boundary.children[0].textContent.includes("Drop components here"),
    "Canvas should show the empty-state message after the last root is deleted."
  );
});

// -----------------------------------------------------------------------------
// Nested Text deletion preserves parent and siblings.
// -----------------------------------------------------------------------------

test("Nested Text deletion preserves the parent Card and siblings", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "text-1");
  clickDeleteButton(harness);

  const document = harness.state.getDocument();
  assertUndefined(
    findComponentById(document, "text-1"),
    "text-1 should be removed."
  );
  assertEqual(harness.state.getSelectedInstanceId(), null);

  // Parent Card and siblings remain.
  const rootCard = findComponentById(document, "root-card");
  assertTrue(rootCard !== undefined, "Parent root-card should remain.");
  const childIds = rootCard!.children!.map((child) => child.id);
  assertEqual(childIds.join(","), "button-1,nested-card");

  // The canvas re-renders without text-1 but keeps the parent and siblings.
  const renderedRoot = getCard(harness.canvasContainer, 0);
  assertEqual(renderedRoot.dataset.instanceId, "root-card");
  assertUndefined(
    findElementById(renderedRoot, "text-1"),
    "text-1 element should be gone from the canvas."
  );
  assertTrue(
    findElementById(renderedRoot, "button-1") !== undefined,
    "button-1 should still render."
  );
  assertTrue(
    findElementById(renderedRoot, "nested-card") !== undefined,
    "nested-card should still render."
  );
});

// -----------------------------------------------------------------------------
// Nested Button deletion preserves parent and siblings.
// -----------------------------------------------------------------------------

test("Nested Button deletion preserves the parent Card and siblings", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "button-1");
  clickDeleteButton(harness);

  const document = harness.state.getDocument();
  assertUndefined(
    findComponentById(document, "button-1"),
    "button-1 should be removed."
  );

  const rootCard = findComponentById(document, "root-card");
  const childIds = rootCard!.children!.map((child) => child.id);
  assertEqual(childIds.join(","), "text-1,nested-card");

  const renderedRoot = getCard(harness.canvasContainer, 0);
  assertUndefined(
    findElementById(renderedRoot, "button-1"),
    "button-1 element should be gone from the canvas."
  );
  assertTrue(
    findElementById(renderedRoot, "text-1") !== undefined,
    "text-1 should still render."
  );
  assertTrue(
    findElementById(renderedRoot, "nested-card") !== undefined,
    "nested-card should still render."
  );
});

// -----------------------------------------------------------------------------
// Nested Card deletion removes descendants.
// -----------------------------------------------------------------------------

test("Nested Card deletion removes the Card and its descendants", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "nested-card");
  clickDeleteButton(harness);

  const document = harness.state.getDocument();
  assertUndefined(
    findComponentById(document, "nested-card"),
    "nested-card should be removed."
  );
  assertUndefined(
    findComponentById(document, "text-2"),
    "text-2 (descendant) should be removed with nested-card."
  );

  const rootCard = findComponentById(document, "root-card");
  const childIds = rootCard!.children!.map((child) => child.id);
  assertEqual(childIds.join(","), "text-1,button-1");

  const renderedRoot = getCard(harness.canvasContainer, 0);
  assertUndefined(
    findElementById(renderedRoot, "nested-card"),
    "nested-card element should be gone from the canvas."
  );
  assertUndefined(
    findElementById(renderedRoot, "text-2"),
    "text-2 element should be gone from the canvas."
  );
  assertTrue(
    findElementById(renderedRoot, "text-1") !== undefined,
    "text-1 should still render."
  );
  assertTrue(
    findElementById(renderedRoot, "button-1") !== undefined,
    "button-1 should still render."
  );
});

// -----------------------------------------------------------------------------
// Deleting selected components clears the Properties panel.
// -----------------------------------------------------------------------------

test("Deleting the selected component clears the Properties panel", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "button-1");

  // The properties panel shows the selected component's form.
  assertTrue(
    findPropertiesForm(harness.propertiesContainer) !== undefined,
    "Properties panel should render the form for the selected component."
  );
  assertTrue(
    !findPropertiesEmptyState(harness.propertiesContainer),
    "Properties panel should not show the empty state while a component is selected."
  );
  assertEqual(harness.state.getSelectedInstanceId(), "button-1");

  clickDeleteButton(harness);

  // Selection is cleared, so the properties panel re-renders to the empty state.
  assertEqual(harness.state.getSelectedInstanceId(), null);
  assertTrue(
    findPropertiesEmptyState(harness.propertiesContainer),
    "Properties panel should show the empty state after the selected component is deleted."
  );
  assertUndefined(
    findPropertiesForm(harness.propertiesContainer),
    "Properties form should be absent after the selected component is deleted."
  );
});

test("Deleting a non-selected nested component leaves the Properties panel unchanged", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "text-1");
  assertTrue(
    findPropertiesForm(harness.propertiesContainer) !== undefined,
    "Properties panel should show text-1's form."
  );

  // Delete a different (non-selected) component through state.
  harness.state.deleteComponent("button-1");

  // Selection is unchanged, so the panel keeps editing text-1.
  assertEqual(harness.state.getSelectedInstanceId(), "text-1");
  assertTrue(
    findPropertiesForm(harness.propertiesContainer) !== undefined,
    "Properties panel should keep editing the unrelated selection."
  );
  assertTrue(
    findDeleteButton(harness.propertiesContainer) !== undefined,
    "Delete button should remain present for the still-selected component."
  );
});

// -----------------------------------------------------------------------------
// Components can still be added after deletion.
// -----------------------------------------------------------------------------

test("A nested component can be added after deleting a sibling", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "text-1");
  clickDeleteButton(harness);

  // text-1 is gone; root-card keeps button-1 and nested-card.
  assertUndefined(
    findComponentById(harness.state.getDocument(), "text-1")
  );

  harness.state.insertChildInstance(
    "root-card",
    {
      id: "new-text",
      type: "text",
      properties: {
        content: "Added after deletion",
        color: "#000000",
        align: "left",
      },
    },
    0,
    harness.metadataRegistry
  );

  const document = harness.state.getDocument();
  const rootCard = findComponentById(document, "root-card")!;
  const childIds = rootCard.children!.map((child) => child.id);
  assertEqual(childIds.join(","), "new-text,button-1,nested-card");
  assertEqual(
    findComponentById(document, "new-text")!.properties.content,
    "Added after deletion"
  );

  // The canvas reflects the newly added component.
  const renderedRoot = getCard(harness.canvasContainer, 0);
  assertTrue(
    findElementById(renderedRoot, "new-text") !== undefined,
    "new-text should render on the canvas."
  );
});

test("A root Card can be added after deleting the previous root", () => {
  const harness = createDeletionHarness();

  selectInstance(harness, "root-card");
  clickDeleteButton(harness);

  assertEqual(harness.state.getDocument().rootInstances.length, 0);
  assertTrue(
    getBoundary(harness.canvasContainer).children[0].textContent.includes(
      "Drop components here"
    )
  );

  harness.state.addRootInstance({
    id: "replacement-card",
    type: "card",
    properties: {
      title: "Replacement",
      padding: 16,
      backgroundColor: "#ffffff",
    },
  });

  assertEqual(harness.state.getDocument().rootInstances.length, 1);
  assertEqual(
    harness.state.getDocument().rootInstances[0].id,
    "replacement-card"
  );

  const content = getContent(harness.canvasContainer);
  assertEqual(content.children.length, 1);
  assertEqual(getCard(harness.canvasContainer, 0).dataset.instanceId, "replacement-card");
});

// -----------------------------------------------------------------------------
// Report.
// -----------------------------------------------------------------------------

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
