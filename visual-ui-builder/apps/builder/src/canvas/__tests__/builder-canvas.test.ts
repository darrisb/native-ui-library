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

interface MockRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
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

  private readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor(nodeName: string, createShadowRoot = true) {
    this.nodeName = nodeName.toLowerCase();
    if (createShadowRoot) {
      this.shadowRoot = new MockElement("shadow-root", false);
    }
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

  /** Invokes every listener registered for the given event type. */
  fire(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }

  /** Legacy helper: dispatches to click listeners, as the original mock did. */
  dispatchEvent(event: Event): boolean {
    (event as unknown as { target: MockElement }).target = this;
    this.fire("click", event);
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
  };
}

installMockDom();

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);
const {
  getNativeComponentRegistry,
  NativeComponentRegistry,
  registerCard,
  registerNativeComponents,
} = await import("@visual-ui/components");
const { renderBuilderCanvas } = await import("../builder-canvas.ts");
const { renderComponent } = await import("@visual-ui/renderer");
const {
  createEmptyBuilderDocument,
  findComponentById,
} = await import("../../state/builder-document.ts");
const { createBuilderState } = await import("../../state/builder-state.ts");
const {
  CANVAS_DRAG_MIME_TYPE,
  PALETTE_DRAG_MIME_TYPE,
} = await import("../../drag-drop/drag-payload.ts");
const {
  insertDroppedComponent,
  moveDroppedComponent,
} = await import("../../drag-drop/insert-dropped-component.ts");
const { createComponentInstance } = await import(
  "../../factories/component-instance-factory.ts"
);
const { validateComponentInstance } = await import("@visual-ui/components");
const { createNestedBuilderDocument } = await import(
  "../../fixtures/nested-document.ts"
);

const document = globalThis.document as {
  createElement: (tagName: string) => MockElement;
};

function createContainer(): MockElement {
  return document.createElement("div");
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

function getSelectionSurface(
  element: MockElement
): MockElement | undefined {
  return element.shadowRoot?.children.find((child) =>
    child.className.includes("canvas-selection-surface")
  );
}

function createNestedRegistry() {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerNativeComponents(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

interface FakeClickEvent {
  readonly target: MockElement | null;
  readonly composedPath: () => MockElement[];
  stopPropagation: () => void;
}

function createClickEvent(path: MockElement[]): FakeClickEvent {
  return {
    target: path[0] ?? null,
    composedPath: () => path,
    stopPropagation: () => {},
  };
}

test("Renders empty state when document has no instances", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  const container = createContainer();
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createEmptyBuilderDocument(),
    metadataRegistry,
    nativeRegistry
  );

  assertEqual(container.children.length, 1);
  const boundary = getBoundary(container);
  assertTrue(boundary.className.includes("canvas-boundary"));
  assertEqual(boundary.children.length, 1);
  assertTrue(
    boundary.children[0].textContent.includes("Drop components here")
  );
});

test("Renders a Card instance as ui-card with attributes", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const container = createContainer();
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      {
        id: "card-1",
        type: "card",
        properties: {
          title: "Hello",
          description: "A helpful card.",
          padding: 24,
          backgroundColor: "#f0f0f0",
        },
      },
    ],
  };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry
  );

  assertEqual(container.children.length, 1);
  const content = getContent(container);
  assertTrue(content.className.includes("canvas-content"));
  assertEqual(content.children.length, 1);

  const wrapper = getCardWrapper(container, 0);
  assertTrue(wrapper.className.includes("canvas-instance-wrapper"));
  assertEqual(wrapper.dataset.instanceId, "card-1");

  const card = getCard(container, 0);
  assertEqual(card.nodeName, "ui-card");
  assertEqual(card.getAttribute("title"), "Hello");
  assertEqual(card.getAttribute("description"), "A helpful card.");
  assertEqual(card.style.getPropertyValue("--ui-card-padding"), "24px");
  assertEqual(card.style.getPropertyValue("--ui-card-background"), "#f0f0f0");
});

test("Renders a Card without description successfully", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const container = createContainer();
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      {
        id: "card-legacy",
        type: "card",
        properties: {
          title: "Welcome",
          padding: 16,
          backgroundColor: "#ffffff",
        },
      },
    ],
  };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry
  );

  const card = getCard(container, 0);
  assertEqual(card.nodeName, "ui-card");
  assertEqual(card.getAttribute("title"), "Welcome");
  assertEqual(card.style.getPropertyValue("--ui-card-padding"), "16px");
  assertEqual(card.style.getPropertyValue("--ui-card-background"), "#ffffff");
});

test("Multiple Cards preserve insertion order", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const container = createContainer();
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      { id: "card-1", type: "card", properties: { title: "First" } },
      { id: "card-2", type: "card", properties: { title: "Second" } },
      { id: "card-3", type: "card", properties: { title: "Third" } },
    ],
  };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry
  );

  const content = getContent(container);
  const titles = content.children.map(
    (child) => child.children[0].getAttribute("title")
  );
  assertEqual(titles.join(","), "First,Second,Third");
});

test("Selection styling affects only the selected Card", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const container = createContainer();
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      { id: "card-1", type: "card", properties: { title: "First" } },
      { id: "card-2", type: "card", properties: { title: "Second" } },
    ],
  };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry,
    { selectedInstanceId: "card-2" }
  );

  const firstWrapper = getCardWrapper(container, 0);
  const secondWrapper = getCardWrapper(container, 1);

  assertTrue(
    !firstWrapper.className.includes("canvas-instance-wrapper--selected")
  );
  assertTrue(
    secondWrapper.className.includes("canvas-instance-wrapper--selected")
  );
});

test("Clicking a Card selects that instance", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const container = createContainer();
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      { id: "card-1", type: "card", properties: { title: "First" } },
    ],
  };

  let selectedId: string | null = null;
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const wrapper = getCardWrapper(container, 0);
  wrapper.dispatchEvent({ stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedId, "card-1");
});

test("Clicking blank canvas clears selection", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const container = createContainer();
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      { id: "card-1", type: "card", properties: { title: "First" } },
    ],
  };

  let selectedId: string | null = "previous";
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const boundary = getBoundary(container);
  boundary.dispatchEvent({} as unknown as Event);
  assertEqual(selectedId, null);
});

test("Canvas rerenders with updated Card properties through state", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const state = createBuilderState();
  const container = createContainer();

  state.subscribe(() => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry
    );
  });

  state.addRootInstance({
    id: "card-1",
    type: "card",
    properties: {
      title: "Hello",
      padding: 16,
      backgroundColor: "#ffffff",
    },
  });

  let card = getCard(container, 0);
  assertEqual(card.getAttribute("title"), "Hello");
  assertEqual(card.style.getPropertyValue("--ui-card-background"), "#ffffff");

  state.updateInstanceProperties(
    "card-1",
    {
      title: "Greeting Earth",
      padding: 32,
      backgroundColor: "#8b0000",
    },
    metadataRegistry
  );

  card = getCard(container, 0);
  assertEqual(card.getAttribute("title"), "Greeting Earth");
  assertEqual(card.style.getPropertyValue("--ui-card-padding"), "32px");
  assertEqual(card.style.getPropertyValue("--ui-card-background"), "#8b0000");
});

test("Updating one Card through state preserves another Card", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const state = createBuilderState();
  const container = createContainer();

  state.subscribe(() => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry
    );
  });

  state.addRootInstance({
    id: "card-1",
    type: "card",
    properties: {
      title: "First",
      padding: 16,
      backgroundColor: "#ffffff",
    },
  });

  state.addRootInstance({
    id: "card-2",
    type: "card",
    properties: {
      title: "Second",
      padding: 16,
      backgroundColor: "#ffffff",
    },
  });

  state.updateInstanceProperties(
    "card-1",
    { title: "Updated First", backgroundColor: "#000000" },
    metadataRegistry
  );

  const firstCard = getCard(container, 0);
  const secondCard = getCard(container, 1);

  assertEqual(firstCard.getAttribute("title"), "Updated First");
  assertEqual(firstCard.style.getPropertyValue("--ui-card-background"), "#000000");
  assertEqual(secondCard.getAttribute("title"), "Second");
  assertEqual(secondCard.style.getPropertyValue("--ui-card-background"), "#ffffff");
});

test("Selection persists after property updates through state", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const state = createBuilderState();
  const container = createContainer();

  const renderSelectedCanvas = (): void => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      { selectedInstanceId: state.getSelectedInstanceId() }
    );
  };

  state.subscribe(renderSelectedCanvas);
  state.subscribeToSelection(renderSelectedCanvas);

  state.addRootInstance({
    id: "card-1",
    type: "card",
    properties: {
      title: "Hello",
      padding: 16,
      backgroundColor: "#ffffff",
    },
  });

  state.selectInstance("card-1");

  const wrapperBefore = getCardWrapper(container, 0);
  assertTrue(
    wrapperBefore.className.includes("canvas-instance-wrapper--selected")
  );

  state.updateInstanceProperties(
    "card-1",
    { title: "Greeting Earth" },
    metadataRegistry
  );

  const wrapperAfter = getCardWrapper(container, 0);
  assertTrue(
    wrapperAfter.className.includes("canvas-instance-wrapper--selected")
  );
  assertEqual(getCard(container, 0).getAttribute("title"), "Greeting Earth");
});

// ---------------------------------------------------------------------------
// Nested canvas selection. These tests verify that the canvas annotates
// rendered nested components and that the delegated boundary click listener
// resolves the deepest clicked instance using composedPath(). They do not
// exercise real browser Shadow DOM event retargeting.
// ---------------------------------------------------------------------------

test("Nested components are annotated with instance ids", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry
  );

  const root = getCard(container, 0);
  assertEqual(root.dataset.instanceId, "root-card");
  assertEqual(root.children[0].dataset.instanceId, "text-1");
  assertEqual(root.children[1].dataset.instanceId, "button-1");
  assertEqual(root.children[2].dataset.instanceId, "nested-card");
  assertEqual(root.children[2].children[0].dataset.instanceId, "text-2");
});

test("Selecting nested Text", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = null;

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const boundary = getBoundary(container);
  const textElement = findElementById(getCard(container, 0), "text-1")!;
  const event = createClickEvent([textElement, getCard(container, 0)]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(selectedId, "text-1");
});

test("Selecting nested Button", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = null;

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const boundary = getBoundary(container);
  const buttonElement = findElementById(getCard(container, 0), "button-1")!;
  const event = createClickEvent([buttonElement, getCard(container, 0)]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(selectedId, "button-1");
});

test("Selecting nested Card", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = null;

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const boundary = getBoundary(container);
  const nestedCard = findElementById(getCard(container, 0), "nested-card")!;
  const event = createClickEvent([nestedCard, getCard(container, 0)]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(selectedId, "nested-card");
});

test("Selecting the deepest clicked component", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = null;

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const rootCard = getCard(container, 0);
  const nestedCard = findElementById(rootCard, "nested-card")!;
  const nestedText = findElementById(rootCard, "text-2")!;
  const boundary = getBoundary(container);

  const event = createClickEvent([nestedText, nestedCard, rootCard]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(selectedId, "text-2");
});

test("Preventing parent selection when clicking a child", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  const selectedIds: (string | null)[] = [];

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedIds.push(id);
      },
    }
  );

  const rootCard = getCard(container, 0);
  const textElement = findElementById(rootCard, "text-1")!;
  const boundary = getBoundary(container);

  const event = createClickEvent([textElement, rootCard]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(selectedIds.length, 1);
  assertEqual(selectedIds[0], "text-1");
});

test("Clicking blank nested canvas clears selection", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = "previous";

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const boundary = getBoundary(container);
  const event = createClickEvent([boundary]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(selectedId, null);
});

test("Nested selection styling highlights the selected component", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    { selectedInstanceId: "text-1" }
  );

  const rootCard = getCard(container, 0);
  const textElement = findElementById(rootCard, "text-1")!;
  const buttonElement = findElementById(rootCard, "button-1")!;

  assertTrue(
    textElement.className.includes("canvas-instance-wrapper--selected")
  );
  assertTrue(
    !buttonElement.className.includes("canvas-instance-wrapper--selected")
  );
});

// ---------------------------------------------------------------------------
// Disabled Button selection. Native disabled buttons suppress click events,
// so the builder adds a transparent selection surface inside each leaf
// component's Shadow DOM. The mock DOM cannot reproduce native disabled-button
// event suppression, but it can verify that the surface exists and that
// interacting with it selects the correct instance.
// ---------------------------------------------------------------------------

test("Enabled nested Button remains selectable via its selection surface", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = null;

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const rootCard = getCard(container, 0);
  const buttonElement = findElementById(rootCard, "button-1")!;
  const surface = getSelectionSurface(buttonElement);

  assertTrue(
    surface !== undefined,
    "Expected a selection surface on the enabled Button."
  );
  surface!.fire("click", { stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedId, "button-1");
});

test("Disabled nested Button can be selected via its selection surface", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  let selectedId: string | null = null;
  const builderDocument = createNestedBuilderDocument();
  const button = findComponentById(builderDocument, "button-1")!;
  (button as any).properties = { ...button.properties, disabled: true };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedId = id;
      },
    }
  );

  const rootCard = getCard(container, 0);
  const buttonElement = findElementById(rootCard, "button-1")!;
  const surface = getSelectionSurface(buttonElement);

  assertTrue(
    surface !== undefined,
    "Expected a selection surface on the disabled Button."
  );
  surface!.fire("click", { stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedId, "button-1");
});

test("Disabled Button can be reselected after selecting another component", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  const selectedIds: (string | null)[] = [];
  const builderDocument = createNestedBuilderDocument();
  const button = findComponentById(builderDocument, "button-1")!;
  (button as any).properties = { ...button.properties, disabled: true };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedIds.push(id);
      },
    }
  );

  const boundary = getBoundary(container);
  const rootCard = getCard(container, 0);
  const textElement = findElementById(rootCard, "text-1")!;
  boundary.fire("click", createClickEvent([textElement, rootCard]) as unknown as Event);
  assertEqual(selectedIds[selectedIds.length - 1], "text-1");

  const buttonElement = findElementById(rootCard, "button-1")!;
  const surface = getSelectionSurface(buttonElement)!;
  surface.fire("click", { stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedIds[selectedIds.length - 1], "button-1");
});

test("Selecting a disabled Button does not select the parent Card", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const container = createContainer();
  const selectedIds: (string | null)[] = [];
  const builderDocument = createNestedBuilderDocument();
  const button = findComponentById(builderDocument, "button-1")!;
  (button as any).properties = { ...button.properties, disabled: true };

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry,
    {
      onSelectInstance: (id) => {
        selectedIds.push(id);
      },
    }
  );

  const rootCard = getCard(container, 0);
  const buttonElement = findElementById(rootCard, "button-1")!;
  const surface = getSelectionSurface(buttonElement)!;
  surface.fire("click", { stopPropagation: () => {} } as unknown as Event);

  assertEqual(selectedIds.length, 1);
  assertEqual(selectedIds[0], "button-1");
});

test("Disabled Button property can be toggled back to false", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const state = createBuilderState(createNestedBuilderDocument());
  const container = createContainer();
  let selectedId: string | null = null;

  const render = (): void => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => {
          selectedId = id;
          state.selectInstance(id);
        },
      }
    );
  };

  state.subscribe(render);
  state.subscribeToSelection(render);
  state.selectInstance("button-1");

  let buttonElement = findElementById(getCard(container, 0), "button-1")!;
  assertEqual(buttonElement.getAttribute("disabled"), null);
  let surface = getSelectionSurface(buttonElement);
  assertTrue(
    surface !== undefined,
    "Expected selection surface on the enabled Button."
  );
  surface!.fire("click", { stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedId, "button-1");

  state.updateInstanceProperties(
    "button-1",
    { disabled: true },
    metadataRegistry
  );
  buttonElement = findElementById(getCard(container, 0), "button-1")!;
  assertEqual(buttonElement.getAttribute("disabled"), "");
  surface = getSelectionSurface(buttonElement);
  assertTrue(
    surface !== undefined,
    "Expected selection surface after disabling."
  );
  surface!.fire("click", { stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedId, "button-1");

  state.updateInstanceProperties(
    "button-1",
    { disabled: false },
    metadataRegistry
  );
  buttonElement = findElementById(getCard(container, 0), "button-1")!;
  assertEqual(buttonElement.getAttribute("disabled"), null);
  surface = getSelectionSurface(buttonElement);
  assertTrue(
    surface !== undefined,
    "Expected selection surface after re-enabling."
  );
  surface!.fire("click", { stopPropagation: () => {} } as unknown as Event);
  assertEqual(selectedId, "button-1");
});

test("Root-level drag-and-drop still works with nested content", () => {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const state = createBuilderState(createNestedBuilderDocument());
  const container = createContainer();
  const drops: Array<{ type: string; parentId: string | null; index: number }> = [];

  const render = (): void => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => state.selectInstance(id),
        onDropComponent: (type, parentId, index) => {
          drops.push({ type, parentId, index });
          insertDroppedComponent(state, metadataRegistry, type, parentId, index);
        },
      }
    );
    layoutCanvas(container);
  };

  state.subscribe(render);
  state.subscribeToSelection(render);
  render();

  const event = createDragEvent({
    data: JSON.stringify({
      source: "component-palette",
      componentType: "card",
    }),
    clientY: 5,
  });
  getBoundary(container).fire("drop", event as unknown as DragEvent);

  assertEqual(drops.length, 1);
  assertEqual(drops[0].parentId, null);
  assertEqual(state.getDocument().rootInstances.length, 2);
  assertEqual(
    findComponentById(state.getDocument(), "text-1")?.properties.content,
    "Nested text content"
  );
});

// ---------------------------------------------------------------------------
// Drag-and-drop. These tests drive the canvas handlers with synthetic events
// against a mock DOM. They verify the handler logic, not real browser drag
// behavior; that is covered by manual browser verification.
// ---------------------------------------------------------------------------

interface FakeDragEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly dataTransfer: {
    readonly types: string[];
    dropEffect: string;
    getData: (type: string) => string;
    setData: (type: string, value: string) => void;
  };
  readonly composedPath: () => MockElement[];
  defaultPrevented: boolean;
  preventDefault: () => void;
}

function createDragEvent(options: {
  types?: string[];
  data?: string;
  clientX?: number;
  clientY?: number;
  composedPath?: MockElement[];
}): FakeDragEvent {
  const path = options.composedPath ?? [];
  const resolvedTypes = options.types ?? [PALETTE_DRAG_MIME_TYPE];
  const storedData = new Map<string, string>();
  if (options.data !== undefined && resolvedTypes.length > 0) {
    storedData.set(resolvedTypes[0], options.data);
  }
  const event: FakeDragEvent = {
    clientX: options.clientX ?? 10,
    clientY: options.clientY ?? 0,
    dataTransfer: {
      types: resolvedTypes,
      dropEffect: "none",
      getData: (type: string) => storedData.get(type) ?? "",
      setData: (type: string, value: string) => {
        storedData.set(type, value);
      },
    },
    composedPath: () => path,
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
  };
  return event;
}

const CARD_DRAG_DATA = JSON.stringify({
  source: "component-palette",
  componentType: "card",
});

/** Stacks wrappers 100px tall with 20px gaps and sizes the boundary around them. */
function layoutCanvas(container: MockElement): void {
  const boundary = getBoundary(container);
  boundary.rect = { top: 0, bottom: 1000, left: 0, right: 500 };
  const content = boundary.children[0];
  if (!content || !content.className.includes("canvas-content")) {
    return;
  }
  content.children.forEach((wrapper, index) => {
    const top = index * 120;
    wrapper.rect = { top, bottom: top + 100, left: 0, right: 500 };
  });
}

function findIndicator(container: MockElement): MockElement | undefined {
  return getBoundary(container).children.find((child) =>
    child.className.includes("canvas-drop-indicator")
  );
}

function createNativeRegistry() {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

/** Wires state, canvas, and drop insertion the way the app shell does. */
function createDropHarness() {
  const { metadataRegistry, nativeRegistry } = createNativeRegistry();
  const state = createBuilderState();
  const container = createContainer();
  const drops: Array<{ type: string; parentId: string | null; index: number }> = [];

  const render = (): void => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => state.selectInstance(id),
        onDropComponent: (type, parentId, index) => {
          drops.push({ type, parentId, index });
          insertDroppedComponent(state, metadataRegistry, type, parentId, index);
        },
      }
    );
    layoutCanvas(container);
  };

  state.subscribe(render);
  state.subscribeToSelection(render);
  render();

  return { state, container, metadataRegistry, drops };
}

function dropCardAt(
  harness: ReturnType<typeof createDropHarness>,
  clientY: number
): FakeDragEvent {
  const event = createDragEvent({ data: CARD_DRAG_DATA, clientY });
  getBoundary(harness.container).fire("drop", event);
  return event;
}

function createNestedDropHarness() {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const state = createBuilderState(createNestedBuilderDocument());
  const container = createContainer();
  const drops: Array<{ type: string; parentId: string | null; index: number }> = [];

  const render = (): void => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => state.selectInstance(id),
        onDropComponent: (type, parentId, index) => {
          drops.push({ type, parentId, index });
          insertDroppedComponent(state, metadataRegistry, type, parentId, index);
        },
      }
    );
    layoutNestedCanvas(container);
  };

  state.subscribe(render);
  state.subscribeToSelection(render);
  render();

  return { state, container, metadataRegistry, nativeRegistry, drops };
}

function createMoveDropHarness() {
  const { metadataRegistry, nativeRegistry } = createNestedRegistry();
  const state = createBuilderState(createNestedBuilderDocument());
  const container = createContainer();
  const moves: Array<{
    componentId: string;
    parentId: string | null;
    index: number;
  }> = [];

  const render = (): void => {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      state.getDocument(),
      metadataRegistry,
      nativeRegistry,
      {
        selectedInstanceId: state.getSelectedInstanceId(),
        onSelectInstance: (id) => state.selectInstance(id),
        onMoveComponent: (componentId, parentId, index) => {
          moves.push({ componentId, parentId, index });
          moveDroppedComponent(state, metadataRegistry, componentId, parentId, index);
        },
      }
    );
    layoutNestedCanvas(container);
  };

  state.subscribe(render);
  state.subscribeToSelection(render);
  render();

  return { state, container, metadataRegistry, nativeRegistry, moves };
}

/**
 * Sizes the root Card wrapper and its nested children so nested drop-index
 * calculations have meaningful bounds. The root Card body starts at y=40
 * (below a header) and each nested child is 30px tall with 10px gaps.
 */
function layoutNestedCanvas(container: MockElement): void {
  const boundary = getBoundary(container);
  boundary.rect = { top: 0, bottom: 1000, left: 0, right: 500 };
  const content = boundary.children[0];
  if (!content || !content.className.includes("canvas-content")) {
    return;
  }

  const wrapper = content.children[0];
  if (!wrapper) {
    return;
  }
  wrapper.rect = { top: 0, bottom: 400, left: 0, right: 500 };

  const card = wrapper.children[0];
  if (!card) {
    return;
  }

  const contentStart = 40;
  card.children.forEach((child, index) => {
    const top = contentStart + index * 40;
    child.rect = { top, bottom: top + 30, left: 20, right: 480 };
  });
}

function dropOnElement(
  harness: ReturnType<typeof createNestedDropHarness>,
  componentType: string,
  targetElement: MockElement,
  clientY: number
): FakeDragEvent {
  const data = JSON.stringify({ source: "component-palette", componentType });
  const event = createDragEvent({
    data,
    clientY,
    composedPath: [targetElement],
  });
  getBoundary(harness.container).fire("drop", event);
  return event;
}

function findDragHandle(root: MockElement | null): MockElement | undefined {
  if (!root) {
    return undefined;
  }
  for (const child of root.children) {
    if (child.className.includes("canvas-drag-handle")) {
      return child;
    }
    const shadowHandle = findDragHandle(child.shadowRoot);
    if (shadowHandle) {
      return shadowHandle;
    }
    const nestedHandle = findDragHandle(child);
    if (nestedHandle) {
      return nestedHandle;
    }
  }
  return undefined;
}

function startMoveDrag(
  harness: ReturnType<typeof createMoveDropHarness>,
  componentId: string
): void {
  const boundary = getBoundary(harness.container);
  const sourceElement = findElementById(boundary, componentId);
  if (!sourceElement) {
    throw new Error(`Source element "${componentId}" not found.`);
  }
  const handle =
    findDragHandle(sourceElement) ?? findDragHandle(sourceElement.shadowRoot!);
  if (!handle) {
    throw new Error(`Drag handle for "${componentId}" not found.`);
  }

  const event = createDragEvent({
    types: [CANVAS_DRAG_MIME_TYPE],
    data: JSON.stringify({ source: "builder-canvas", componentId }),
    composedPath: [handle, sourceElement],
  });
  handle.fire("dragstart", event);
}

function createMoveDragEvent(options: {
  componentId: string;
  clientX?: number;
  clientY?: number;
  composedPath?: MockElement[];
}): FakeDragEvent {
  return createDragEvent({
    types: [CANVAS_DRAG_MIME_TYPE],
    data: JSON.stringify({
      source: "builder-canvas",
      componentId: options.componentId,
    }),
    clientX: options.clientX,
    clientY: options.clientY ?? 0,
    composedPath: options.composedPath ?? [],
  });
}

function moveOnElement(
  harness: ReturnType<typeof createMoveDropHarness>,
  componentId: string,
  targetElement: MockElement,
  clientY: number
): FakeDragEvent {
  startMoveDrag(harness, componentId);
  const event = createMoveDragEvent({
    componentId,
    clientY,
    composedPath: [targetElement],
  });
  getBoundary(harness.container).fire("drop", event);
  return event;
}

function moveOnRoot(
  harness: ReturnType<typeof createMoveDropHarness>,
  componentId: string,
  clientY: number
): FakeDragEvent {
  startMoveDrag(harness, componentId);
  const event = createMoveDragEvent({ componentId, clientY });
  getBoundary(harness.container).fire("drop", event);
  return event;
}

test("Canvas without a drop callback does not accept drags", () => {
  const { metadataRegistry, nativeRegistry } = createNativeRegistry();
  const container = createContainer();
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createEmptyBuilderDocument(),
    metadataRegistry,
    nativeRegistry
  );
  const event = createDragEvent({});
  getBoundary(container).fire("dragover", event);
  assertTrue(!event.defaultPrevented);
  assertEqual(findIndicator(container), undefined);
});

test("Dragover of a palette drag is accepted with copy effect", () => {
  const harness = createDropHarness();
  const event = createDragEvent({ clientY: 5 });
  getBoundary(harness.container).fire("dragover", event);

  assertTrue(event.defaultPrevented, "Accepted drags must be prevented.");
  assertEqual(event.dataTransfer.dropEffect, "copy");
  assertTrue(
    getBoundary(harness.container).className.includes(
      "canvas-boundary--drop-active"
    )
  );
  assertTrue(findIndicator(harness.container) !== undefined);
});

test("Dragover of an unrelated drag is ignored", () => {
  const harness = createDropHarness();
  const event = createDragEvent({ types: ["text/plain", "Files"] });
  getBoundary(harness.container).fire("dragover", event);
  getBoundary(harness.container).fire("dragenter", event);

  assertTrue(!event.defaultPrevented, "Unrelated drags must not be prevented.");
  assertEqual(event.dataTransfer.dropEffect, "none");
  assertEqual(findIndicator(harness.container), undefined);
});

test("Unrelated drops are ignored and not prevented", () => {
  const harness = createDropHarness();
  const event = createDragEvent({ types: ["text/plain"], data: "hello" });
  getBoundary(harness.container).fire("drop", event);
  assertTrue(!event.defaultPrevented);
  assertEqual(harness.drops.length, 0);
  assertEqual(harness.state.getDocument().rootInstances.length, 0);
});

test("Indicator tracks the pointer between Cards", () => {
  const harness = createDropHarness();
  harness.state.addRootInstance(
    createComponentInstance("card", harness.metadataRegistry)
  );
  harness.state.addRootInstance(
    createComponentInstance("card", harness.metadataRegistry)
  );
  const boundary = getBoundary(harness.container);
  const top = (): string =>
    findIndicator(harness.container)!.style.getPropertyValue("top");

  // Wrappers occupy 0-100 and 120-220; midpoints are 50 and 170.
  boundary.fire("dragover", createDragEvent({ clientY: 20 }));
  assertEqual(top(), "0px");

  boundary.fire("dragover", createDragEvent({ clientY: 100 }));
  assertEqual(top(), "110px");

  boundary.fire("dragover", createDragEvent({ clientY: 400 }));
  assertEqual(top(), "220px");

  const indicators = boundary.children.filter((child) =>
    child.className.includes("canvas-drop-indicator")
  );
  assertEqual(indicators.length, 1, "Only one indicator should exist.");
});

test("Empty canvas uses the empty-canvas indicator", () => {
  const harness = createDropHarness();
  getBoundary(harness.container).fire("dragover", createDragEvent({}));
  assertTrue(
    findIndicator(harness.container)!.className.includes(
      "canvas-drop-indicator--empty"
    )
  );
});

test("Dragleave outside the canvas clears the indicator", () => {
  const harness = createDropHarness();
  const boundary = getBoundary(harness.container);
  boundary.fire("dragover", createDragEvent({ clientY: 5 }));
  boundary.fire("dragleave", createDragEvent({ clientX: -10, clientY: 5 }));
  assertEqual(findIndicator(harness.container), undefined);
  assertTrue(!boundary.className.includes("canvas-boundary--drop-active"));
});

test("Dragleave between child elements keeps the indicator", () => {
  const harness = createDropHarness();
  const boundary = getBoundary(harness.container);
  boundary.fire("dragover", createDragEvent({ clientY: 5 }));
  boundary.fire("dragleave", createDragEvent({ clientX: 100, clientY: 300 }));
  assertTrue(findIndicator(harness.container) !== undefined);
});

test("Dropping a Card creates a valid instance and clears the indicator", () => {
  const harness = createDropHarness();
  getBoundary(harness.container).fire(
    "dragover",
    createDragEvent({ clientY: 5 })
  );
  const event = dropCardAt(harness, 5);

  assertTrue(event.defaultPrevented);
  assertEqual(harness.drops.length, 1, "Exactly one insertion expected.");
  assertEqual(harness.drops[0].type, "card");
  assertEqual(harness.drops[0].index, 0);

  const roots = harness.state.getDocument().rootInstances;
  assertEqual(roots.length, 1);
  assertEqual(roots[0].type, "card");
  assertEqual(
    validateComponentInstance(roots[0], harness.metadataRegistry).length,
    0
  );

  assertEqual(findIndicator(harness.container), undefined);
  assertTrue(
    !getBoundary(harness.container).className.includes(
      "canvas-boundary--drop-active"
    )
  );
  assertEqual(getCard(harness.container, 0).nodeName, "ui-card");
});

test("A successful drop selects the new Card", () => {
  const harness = createDropHarness();
  dropCardAt(harness, 5);

  const [dropped] = harness.state.getDocument().rootInstances;
  assertEqual(harness.state.getSelectedInstanceId(), dropped.id);
  assertTrue(
    getCardWrapper(harness.container, 0).className.includes(
      "canvas-instance-wrapper--selected"
    ),
    "New Card should render as selected after the rerender."
  );
});

test("Text and Button root drops are ignored without invoking insertion", () => {
  const harness = createDropHarness();
  const boundary = getBoundary(harness.container);

  for (const componentType of ["text", "button"]) {
    boundary.fire("dragover", createDragEvent({ clientY: 5 }));
    boundary.fire(
      "drop",
      createDragEvent({
        data: JSON.stringify({ source: "component-palette", componentType }),
      })
    );
    assertEqual(findIndicator(harness.container), undefined);
  }

  assertEqual(harness.drops.length, 0);
  assertEqual(harness.state.getDocument().rootInstances.length, 0);
  assertEqual(harness.state.getSelectedInstanceId(), null);
});

test("Unsupported payloads and malformed drops create nothing", () => {
  const harness = createDropHarness();
  const boundary = getBoundary(harness.container);

  const malformed = [
    "",
    "{broken",
    JSON.stringify({ source: "canvas", componentType: "card" }),
    JSON.stringify({ source: "component-palette", componentType: "unknown" }),
  ];
  for (const data of malformed) {
    boundary.fire("drop", createDragEvent({ data }));
  }

  assertEqual(harness.drops.length, 0);
  assertEqual(harness.state.getDocument().rootInstances.length, 0);
  assertEqual(harness.state.getSelectedInstanceId(), null);
});

test("Unexpected insertion failures are not suppressed by the canvas", () => {
  const { metadataRegistry, nativeRegistry } = createNativeRegistry();
  const container = createContainer();
  let receivedType: string | null = null;

  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createEmptyBuilderDocument(),
    metadataRegistry,
    nativeRegistry,
    {
      onDropComponent: (type) => {
        receivedType = type;
        throw new Error("Unexpected insertion failure");
      },
    }
  );

  const boundary = getBoundary(container);
  let threw = false;
  try {
    boundary.fire(
      "drop",
      createDragEvent({ data: CARD_DRAG_DATA, clientY: 5 }) as unknown as DragEvent
    );
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message === "Unexpected insertion failure"
    );
  }

  assertTrue(threw, "Expected unexpected callback errors to propagate.");
  assertEqual(receivedType, "card");
});

test("Dropping places Cards before, between, and after existing Cards", () => {
  const harness = createDropHarness();
  const order = (): string =>
    harness.state
      .getDocument()
      .rootInstances.map((instance) => String(instance.properties.title))
      .join(",");
  const rename = (index: number, title: string): void => {
    const target = harness.state.getDocument().rootInstances[index];
    harness.state.updateInstanceProperties(
      target.id,
      { title },
      harness.metadataRegistry
    );
  };

  dropCardAt(harness, 5);
  rename(0, "First Card");

  // Below the only Card's midpoint (50): append.
  dropCardAt(harness, 500);
  rename(1, "Second Card");
  assertEqual(order(), "First Card,Second Card");

  // Between the two Cards (first ends at 100, second starts at 120).
  dropCardAt(harness, 110);
  rename(1, "Middle Card");
  assertEqual(order(), "First Card,Middle Card,Second Card");

  // Above the first Card's midpoint: insert first.
  dropCardAt(harness, 10);
  rename(0, "Top Card");
  assertEqual(order(), "Top Card,First Card,Middle Card,Second Card");
});

test("Dropping preserves existing Card properties and ids", () => {
  const harness = createDropHarness();
  harness.state.addRootInstance({
    id: "card-1",
    type: "card",
    properties: { title: "Keep me", padding: 40, backgroundColor: "#123456" },
  });
  const before = harness.state.getDocument().rootInstances[0];

  dropCardAt(harness, 5);

  const roots = harness.state.getDocument().rootInstances;
  assertEqual(roots.length, 2);
  assertEqual(roots[1], before);
  assertEqual(roots[1].id, "card-1");
  assertEqual(roots[1].properties.title, "Keep me");
  assertEqual(roots[1].properties.padding, 40);
  assertEqual(roots[1].properties.backgroundColor, "#123456");
  assertTrue(roots[0].id !== "card-1");
});

test("Property editing still works on a dropped Card", () => {
  const harness = createDropHarness();
  dropCardAt(harness, 5);
  const dropped = harness.state.getDocument().rootInstances[0];

  harness.state.updateInstanceProperties(
    dropped.id,
    { title: "Edited", padding: 24, backgroundColor: "#8b0000" },
    harness.metadataRegistry
  );

  const card = getCard(harness.container, 0);
  assertEqual(card.getAttribute("title"), "Edited");
  assertEqual(card.style.getPropertyValue("--ui-card-padding"), "24px");
  assertEqual(card.style.getPropertyValue("--ui-card-background"), "#8b0000");
  assertEqual(harness.state.getSelectedInstanceId(), dropped.id);
});

test("Click-to-add still appends and does not change selection", () => {
  const harness = createDropHarness();
  dropCardAt(harness, 5);
  const [dropped] = harness.state.getDocument().rootInstances;

  harness.state.addRootInstance(
    createComponentInstance("card", harness.metadataRegistry)
  );

  assertEqual(harness.state.getDocument().rootInstances.length, 2);
  assertEqual(harness.state.getDocument().rootInstances[0].id, dropped.id);
  assertEqual(harness.state.getSelectedInstanceId(), dropped.id);
});

test("Clicking an existing Card still selects it after drops", () => {
  const harness = createDropHarness();
  dropCardAt(harness, 5);
  dropCardAt(harness, 500);
  const [first, second] = harness.state.getDocument().rootInstances;
  assertEqual(harness.state.getSelectedInstanceId(), second.id);

  getCardWrapper(harness.container, 0).dispatchEvent({
    stopPropagation: () => {},
  } as unknown as Event);
  assertEqual(harness.state.getSelectedInstanceId(), first.id);
});

test("Rendering does not mutate the builder document", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [
      {
        id: "card-1",
        type: "card",
        properties: {
          title: "Hello",
          padding: 24,
          backgroundColor: "#f0f0f0",
        },
      },
    ],
  };
  const before = JSON.stringify(builderDocument);

  const container = createContainer();
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    builderDocument,
    metadataRegistry,
    nativeRegistry
  );

  assertEqual(JSON.stringify(builderDocument), before);
});

test("Invalid instances are rejected without mutating the document", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const instance = {
    id: "bad-1",
    type: "card",
    properties: { padding: "not-a-number" as unknown as number },
  };
  const builderDocument = {
    ...createEmptyBuilderDocument(),
    rootInstances: [instance],
  };
  const before = JSON.stringify(builderDocument);

  const container = createContainer();
  let threw = false;
  try {
    renderBuilderCanvas(
      container as unknown as HTMLElement,
      builderDocument,
      metadataRegistry,
      nativeRegistry
    );
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("bad-1"),
      "Expected error to identify the failing instance id."
    );
    assertTrue(
      error instanceof Error && error.message.includes("card"),
      "Expected error to identify the failing component type."
    );
  }

  assertTrue(threw, "Expected invalid instance to throw during render.");
  assertEqual(JSON.stringify(builderDocument), before);
});

test("Card property mapping is delegated to the shared renderer", () => {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = getNativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const instance = {
    id: "card-1",
    type: "card",
    properties: {
      title: "Shared Renderer",
      padding: 40,
      backgroundColor: "#abcdef",
    },
  };

  const renderedDirectly = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });

  const container = createContainer();
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    {
      ...createEmptyBuilderDocument(),
      rootInstances: [instance],
    },
    metadataRegistry,
    nativeRegistry
  );

  const renderedByCanvas = getCard(container, 0);
  assertEqual(renderedByCanvas.nodeName, "ui-card");
  assertEqual(renderedByCanvas.getAttribute("title"), "Shared Renderer");
  assertEqual(
    renderedByCanvas.style.getPropertyValue("--ui-card-padding"),
    renderedDirectly.style.getPropertyValue("--ui-card-padding")
  );
  assertEqual(
    renderedByCanvas.style.getPropertyValue("--ui-card-background"),
    renderedDirectly.style.getPropertyValue("--ui-card-background")
  );
});

// ---------------------------------------------------------------------------
// Nested drag-and-drop. These tests use synthetic events against the mock DOM
// to exercise target resolution and insertion-index calculation. They cannot
// verify real browser Shadow DOM event retargeting; that is covered by manual
// browser verification.
// ---------------------------------------------------------------------------

test("Dropping a Card onto a Card inserts it as a child", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);

  // Drop below the last child to append.
  dropOnElement(harness, "card", rootCard, 200);

  assertEqual(harness.drops.length, 1);
  assertEqual(harness.drops[0].parentId, "root-card");
  const root = harness.state.getDocument().rootInstances[0];
  assertEqual(root.children!.length, 4);
  assertEqual(root.children![3].type, "card");
  assertEqual(harness.state.getSelectedInstanceId(), root.children![3].id);
});

test("Dropping Text onto a Card inserts it as a child", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);

  dropOnElement(harness, "text", rootCard, 200);

  assertEqual(harness.drops.length, 1);
  assertEqual(harness.drops[0].parentId, "root-card");
  const root = harness.state.getDocument().rootInstances[0];
  const text = root.children![root.children!.length - 1];
  assertEqual(text.type, "text");
  assertEqual(
    findComponentById(harness.state.getDocument(), text.id)?.properties.content,
    ""
  );
});

test("Dropping Button onto a Card inserts it as a child", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);

  dropOnElement(harness, "button", rootCard, 200);

  assertEqual(harness.drops.length, 1);
  assertEqual(harness.drops[0].parentId, "root-card");
  const root = harness.state.getDocument().rootInstances[0];
  const button = root.children![root.children!.length - 1];
  assertEqual(button.type, "button");
  assertEqual(
    findComponentById(harness.state.getDocument(), button.id)?.properties.label,
    "Button"
  );
});

test("Dropping into the deepest nested Card target", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);
  const nestedCard = findElementById(rootCard, "nested-card")!;

  dropOnElement(harness, "text", nestedCard, 90);

  assertEqual(harness.drops[0].parentId, "nested-card");
  const nested = findComponentById(harness.state.getDocument(), "nested-card")!;
  assertEqual(nested.children!.length, 2);
  assertEqual(nested.children![1].type, "text");
});

test("Dropping on Text inside a Card resolves to the containing Card", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);
  const textElement = findElementById(rootCard, "text-1")!;

  const data = JSON.stringify({
    source: "component-palette",
    componentType: "button",
  });
  const event = createDragEvent({
    data,
    clientY: 50,
    composedPath: [textElement, rootCard],
  });
  getBoundary(harness.container).fire("drop", event);

  assertEqual(harness.drops[0].parentId, "root-card");
  const root = harness.state.getDocument().rootInstances[0];
  const hasButton = root.children!.some((child) => child.type === "button");
  assertTrue(hasButton, "Expected a Button to be inserted into the root Card.");
});

test("Dropping on Button inside a Card resolves to the containing Card", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);
  const buttonElement = findElementById(rootCard, "button-1")!;

  const data = JSON.stringify({
    source: "component-palette",
    componentType: "text",
  });
  const event = createDragEvent({
    data,
    clientY: 90,
    composedPath: [buttonElement, rootCard],
  });
  getBoundary(harness.container).fire("drop", event);

  assertEqual(harness.drops[0].parentId, "root-card");
});

test("Dropping Text or Button at the root is rejected without invoking insertion", () => {
  const harness = createNestedDropHarness();
  const beforeDocument = harness.state.getDocument();

  for (const componentType of ["text", "button"]) {
    const event = createDragEvent({
      data: JSON.stringify({ source: "component-palette", componentType }),
      clientY: 5,
    });
    getBoundary(harness.container).fire("drop", event);
  }

  assertEqual(harness.drops.length, 0);
  assertEqual(harness.state.getDocument(), beforeDocument);
  assertEqual(harness.state.getSelectedInstanceId(), null);
});

test("Nested drop target is highlighted during dragover", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);
  const event = createDragEvent({
    composedPath: [rootCard],
    clientY: 50,
  });

  getBoundary(harness.container).fire("dragover", event);

  assertTrue(
    rootCard.className.includes("canvas-instance-wrapper--drop-target")
  );
  assertTrue(findIndicator(harness.container) !== undefined);
});

test("No duplicate insertion when drop event bubbles from a nested element", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);
  const textElement = findElementById(rootCard, "text-1")!;

  const event = createDragEvent({
    data: CARD_DRAG_DATA,
    composedPath: [textElement, rootCard],
    clientY: 50,
  });
  getBoundary(harness.container).fire("drop", event);

  assertEqual(harness.drops.length, 1);
  assertEqual(harness.state.getDocument().rootInstances[0].children!.length, 4);
});

test("Inserted nested Text can be edited through properties", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);

  dropOnElement(harness, "text", rootCard, 200);
  const text = harness.state
    .getDocument()
    .rootInstances[0].children!.find((child) => child.type === "text")!;

  harness.state.updateInstanceProperties(
    text.id,
    { content: "Edited nested text", color: "#ff0000" },
    harness.metadataRegistry
  );

  const textElement = findElementById(
    getCard(harness.container, 0),
    text.id
  )!;
  assertEqual(textElement.getAttribute("content"), "Edited nested text");
  assertEqual(textElement.getAttribute("color"), "#ff0000");
});

test("Inserted nested Button can be edited through properties", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);

  dropOnElement(harness, "button", rootCard, 200);
  const button = harness.state
    .getDocument()
    .rootInstances[0].children!.find((child) => child.type === "button")!;

  harness.state.updateInstanceProperties(
    button.id,
    { label: "Edited nested button", disabled: true },
    harness.metadataRegistry
  );

  const buttonElement = findElementById(
    getCard(harness.container, 0),
    button.id
  )!;
  assertEqual(buttonElement.getAttribute("label"), "Edited nested button");
  assertEqual(buttonElement.getAttribute("disabled"), "");
});

test("Disabled inserted Button remains selectable", () => {
  const harness = createNestedDropHarness();
  const rootCard = getCard(harness.container, 0);

  dropOnElement(harness, "button", rootCard, 200);
  const button = harness.state
    .getDocument()
    .rootInstances[0].children!.find((child) => child.type === "button")!;
  harness.state.updateInstanceProperties(
    button.id,
    { disabled: true },
    harness.metadataRegistry
  );

  const boundary = getBoundary(harness.container);
  const buttonElement = findElementById(
    getCard(harness.container, 0),
    button.id
  )!;
  const event = createClickEvent([buttonElement, rootCard]);
  boundary.fire("click", event as unknown as Event);

  assertEqual(harness.state.getSelectedInstanceId(), button.id);
});

// -----------------------------------------------------------------------------
// Canvas move drag-and-drop.
// -----------------------------------------------------------------------------

test("Existing nested Text can be moved to a new position in the same Card", () => {
  const harness = createMoveDropHarness();

  // text-1 starts at index 0. Drop it below nested-card to move it last.
  moveOnElement(harness, "text-1", getCard(harness.container, 0), 160);

  assertEqual(harness.moves.length, 1);
  assertEqual(harness.moves[0].componentId, "text-1");
  assertEqual(harness.moves[0].parentId, "root-card");
  const root = harness.state.getDocument().rootInstances[0];
  assertEqual(root.children!.map((child) => child.id).join(","), "button-1,nested-card,text-1");
});

test("Existing nested Button can be moved between siblings in the same Card", () => {
  const harness = createMoveDropHarness();

  // button-1 starts at index 1. Move it before text-1 (visual index 0).
  moveOnElement(harness, "button-1", getCard(harness.container, 0), 45);

  const root = harness.state.getDocument().rootInstances[0];
  assertEqual(root.children!.map((child) => child.id).join(","), "button-1,text-1,nested-card");
});

test("Existing nested Card can be moved to the root canvas", () => {
  const harness = createMoveDropHarness();

  moveOnRoot(harness, "nested-card", 5);

  assertEqual(harness.moves.length, 1);
  assertEqual(harness.moves[0].parentId, null);
  assertEqual(
    harness.state.getDocument().rootInstances.map((c) => c.id).join(","),
    "nested-card,root-card"
  );
  const root = harness.state.getDocument().rootInstances[1];
  assertEqual(root.children!.map((child) => child.id).join(","), "text-1,button-1");
});

test("Existing root Card can be moved into another Card", () => {
  const harness = createMoveDropHarness();
  const secondCard = createComponentInstance("card", harness.metadataRegistry);
  harness.state.addRootInstance(secondCard);

  moveOnElement(harness, secondCard.id, getCard(harness.container, 0), 45);

  assertEqual(harness.state.getDocument().rootInstances.length, 1);
  const root = harness.state.getDocument().rootInstances[0];
  assertEqual(root.children![0].id, secondCard.id);
});

test("Move preserves subtree and instance ids", () => {
  const harness = createMoveDropHarness();
  const beforeText2 = findComponentById(harness.state.getDocument(), "text-2")!;

  moveOnRoot(harness, "nested-card", 5);

  const movedText2 = findComponentById(harness.state.getDocument(), "text-2")!;
  assertEqual(movedText2, beforeText2);
  assertEqual(movedText2.properties.content, "Text inside nested card");
});

test("Move onto the dragged component resolves safely without changing the document", () => {
  const harness = createMoveDropHarness();
  const before = harness.state.getDocument();

  const rootCard = getCard(harness.container, 0);
  moveOnElement(harness, "root-card", rootCard, 45);

  // The target resolves to the root (the dragged Card is skipped), and moving
  // the only root Card to its current position is a state-level no-op.
  assertEqual(harness.state.getDocument(), before);
});

test("Move into a descendant resolves safely without changing the document", () => {
  const harness = createMoveDropHarness();
  const before = harness.state.getDocument();
  const nestedCard = findElementById(getCard(harness.container, 0), "nested-card")!;

  moveOnElement(harness, "root-card", nestedCard, 90);

  // The descendant target is skipped, so the drop lands on the root at the
  // current position and becomes a no-op.
  assertEqual(harness.state.getDocument(), before);
});

test("Canvas rejects Text move to the root", () => {
  const harness = createMoveDropHarness();
  const before = harness.state.getDocument();

  moveOnRoot(harness, "text-1", 5);

  assertEqual(harness.moves.length, 0);
  assertEqual(harness.state.getDocument(), before);
});

test("Canvas rejects Button move to the root", () => {
  const harness = createMoveDropHarness();
  const before = harness.state.getDocument();

  moveOnRoot(harness, "button-1", 5);

  assertEqual(harness.moves.length, 0);
  assertEqual(harness.state.getDocument(), before);
});

test("Canvas move highlights the destination Card during dragover", () => {
  const harness = createMoveDropHarness();
  const rootCard = getCard(harness.container, 0);

  startMoveDrag(harness, "text-1");
  const event = createMoveDragEvent({
    componentId: "text-1",
    clientY: 50,
    composedPath: [rootCard],
  });
  getBoundary(harness.container).fire("dragover", event);

  assertTrue(rootCard.className.includes("canvas-instance-wrapper--drop-target"));
  assertTrue(findIndicator(harness.container) !== undefined);
});

test("Canvas move does not show indicator for illegal root destinations", () => {
  const harness = createMoveDropHarness();

  startMoveDrag(harness, "text-1");
  const event = createMoveDragEvent({ componentId: "text-1", clientY: 5 });
  getBoundary(harness.container).fire("dragover", event);

  assertEqual(findIndicator(harness.container), undefined);
});

test("Canvas move clears indicator after drop", () => {
  const harness = createMoveDropHarness();

  moveOnElement(harness, "text-1", getCard(harness.container, 0), 90);

  assertEqual(findIndicator(harness.container), undefined);
  assertTrue(
    !getBoundary(harness.container).className.includes("canvas-boundary--drop-active")
  );
});

test("Canvas move clears indicator on dragleave", () => {
  const harness = createMoveDropHarness();
  const boundary = getBoundary(harness.container);
  const rootCard = getCard(harness.container, 0);

  startMoveDrag(harness, "text-1");
  boundary.fire(
    "dragover",
    createMoveDragEvent({ componentId: "text-1", clientY: 50, composedPath: [rootCard] })
  );
  assertTrue(findIndicator(harness.container) !== undefined);

  boundary.fire(
    "dragleave",
    createMoveDragEvent({ componentId: "text-1", clientX: -10, clientY: 50 })
  );
  assertEqual(findIndicator(harness.container), undefined);
});

test("Move drop keeps the moved component selected", () => {
  const harness = createMoveDropHarness();

  moveOnRoot(harness, "nested-card", 5);

  assertEqual(harness.state.getSelectedInstanceId(), "nested-card");
});

test("Disabled Button can be dragged and moved", () => {
  const harness = createMoveDropHarness();
  const button = findComponentById(harness.state.getDocument(), "button-1")!;
  (button as any).properties = { ...button.properties, disabled: true };
  harness.state.moveComponent("button-1", "root-card", 2, harness.metadataRegistry);

  const root = harness.state.getDocument().rootInstances[0];
  assertEqual(root.children!.map((child) => child.id).join(","), "text-1,nested-card,button-1");
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
