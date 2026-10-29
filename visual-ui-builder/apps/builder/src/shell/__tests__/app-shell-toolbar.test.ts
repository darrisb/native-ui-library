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
  shadowRoot: MockElement | null = null;
  disabled = false;
  draggable = false;
  title = "";

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

  getBoundingClientRect(): {
    top: number;
    bottom: number;
    left: number;
    right: number;
  } {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  dispatchEvent(event: Event): boolean {
    (event as unknown as { target: MockElement }).target = this;
    for (const listener of this.listeners.get("click") ?? []) {
      listener(event);
    }
    return true;
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      listener({ target: this } as unknown as Event);
    }
  }

  querySelector(selector: string): MockElement | null {
    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

function matchesSelector(element: MockElement, selector: string): boolean {
  if (selector.startsWith(".")) {
    return element.className
      .split(" ")
      .includes(selector.slice(1));
  }
  return element.nodeName === selector.toLowerCase();
}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;
  const definedElements = new Set<string>();

  class MockHTMLElement extends MockElement {}
  globals.HTMLElement = MockHTMLElement;
  globals.customElements = {
    get: (name: string): string | undefined =>
      definedElements.has(name) ? name : undefined,
    define: (name: string): void => {
      definedElements.add(name);
    },
  };

  const documentListeners = new Map<string, ((event: unknown) => void)[]>();

  globals.document = {
    createElement: (tagName: string): MockElement => {
      return new MockHTMLElement(tagName);
    },
    querySelector: (_selector: string): null => null,
    body: new MockHTMLElement("body"),
    addEventListener: (type: string, listener: (event: unknown) => void): void => {
      const entries = documentListeners.get(type) ?? [];
      entries.push(listener);
      documentListeners.set(type, entries);
    },
    removeEventListener: (
      type: string,
      listener: (event: unknown) => void
    ): void => {
      const entries = documentListeners.get(type) ?? [];
      documentListeners.set(
        type,
        entries.filter((entry) => entry !== listener)
      );
    },
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
const { renderAppShell } = await import("../app-shell.ts");

const globals = globalThis as Record<string, unknown>;
const document = globals.document as {
  createElement: (tagName: string) => MockElement;
};

function createContainer(): MockElement {
  return document.createElement("div");
}

function createRegistry(): InstanceType<typeof ComponentRegistry> {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const nativeRegistry = getNativeComponentRegistry();
 registerNativeComponents(registry, nativeRegistry);
  return registry;
}

function findButtonByLabel(
  root: MockElement,
  label: string
): MockElement | undefined {
  if (
    root.nodeName === "button" &&
    (root.textContent === label || root.getAttribute("aria-label") === label)
  ) {
    return root;
  }
  for (const child of root.children) {
    const found = findButtonByLabel(child, label);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findPaletteCardButton(root: MockElement): MockElement | undefined {
  for (const child of root.children) {
    if (child.className.includes("palette-item-button")) {
      // In the mock DOM, textContent doesn't aggregate child text, so we
      // search child spans for the component name.
      const allText = collectText(child);
      if (allText.includes("Card")) {
        return child;
      }
    }
    const found = findPaletteCardButton(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function collectText(element: MockElement): string {
  let text = element.textContent ?? "";
  for (const child of element.children) {
    text += " " + collectText(child);
  }
  return text;
}

// Registry is created by renderAppShell internally; this helper is kept
// for future test scenarios that need direct registry access.
createRegistry();

test("Undo button is initially disabled", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo");
  assertTrue(undoButton !== undefined, "Undo button should exist.");
  assertEqual(
    undoButton!.disabled,
    true,
    "Undo button should be disabled initially."
  );
});

test("Redo button is initially disabled", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const redoButton = findButtonByLabel(container, "Redo");
  assertTrue(redoButton !== undefined, "Redo button should exist.");
  assertEqual(
    redoButton!.disabled,
    true,
    "Redo button should be disabled initially."
  );
});

test("Undo and Redo buttons have accessible labels", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo");
  const redoButton = findButtonByLabel(container, "Redo");

  assertTrue(undoButton !== undefined, "Undo button should exist.");
  assertEqual(
    undoButton!.getAttribute("aria-label"),
    "Undo last change",
    "Undo button should have accessible aria-label."
  );

  assertTrue(redoButton !== undefined, "Redo button should exist.");
  assertEqual(
    redoButton!.getAttribute("aria-label"),
    "Redo last change",
    "Redo button should have accessible aria-label."
  );
});

test("Undo becomes enabled after a document mutation", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  assertEqual(
    undoButton.disabled,
    true,
    "Undo should be disabled before mutation."
  );

  // Click the palette "Card" button to add a root instance (a document mutation).
  const cardButton = findPaletteCardButton(container);
  assertTrue(
    cardButton !== undefined,
    "Palette Card button should exist for triggering a mutation."
  );
  cardButton!.click();

  assertEqual(
    undoButton.disabled,
    false,
    "Undo should be enabled after a document mutation."
  );
});

test("Clicking Undo restores the previous document", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const cardButton = findPaletteCardButton(container)!;

  // Add a Card via the palette to create a document mutation.
  cardButton.click();
  assertEqual(
    undoButton.disabled,
    false,
    "Undo should be enabled after adding a Card."
  );

  // Click the Undo toolbar button.
  undoButton.click();

  assertEqual(
    undoButton.disabled,
    true,
    "Undo should be disabled after restoring the previous document."
  );
});

test("Clicking Redo reapplies the change", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const redoButton = findButtonByLabel(container, "Redo")!;
  const cardButton = findPaletteCardButton(container)!;

  // Add a Card, then Undo to create a redo opportunity.
  cardButton.click();
  undoButton.click();

  assertEqual(
    redoButton.disabled,
    false,
    "Redo should be enabled after an undo."
  );

  // Click the Redo toolbar button.
  redoButton.click();

  assertEqual(
    undoButton.disabled,
    false,
    "Undo should be enabled again after redo."
  );
  assertEqual(
    redoButton.disabled,
    true,
    "Redo should be disabled after redoing the last change."
  );
});

test("Button disabled states update after undo and redo", () => {
  const container = createContainer();
  renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const redoButton = findButtonByLabel(container, "Redo")!;
  const cardButton = findPaletteCardButton(container)!;

  // Initially both disabled.
  assertEqual(undoButton.disabled, true, "Undo disabled initially.");
  assertEqual(redoButton.disabled, true, "Redo disabled initially.");

  // After mutation: undo enabled, redo disabled.
  cardButton.click();
  assertEqual(undoButton.disabled, false, "Undo enabled after mutation.");
  assertEqual(redoButton.disabled, true, "Redo disabled after mutation.");

  // After undo: undo disabled, redo enabled.
  undoButton.click();
  assertEqual(undoButton.disabled, true, "Undo disabled after undo.");
  assertEqual(redoButton.disabled, false, "Redo enabled after undo.");

  // After redo: undo enabled, redo disabled.
  redoButton.click();
  assertEqual(undoButton.disabled, false, "Undo enabled after redo.");
  assertEqual(redoButton.disabled, true, "Redo disabled after redo.");
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
