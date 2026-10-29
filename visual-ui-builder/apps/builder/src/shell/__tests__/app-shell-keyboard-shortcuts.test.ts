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

function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(message ?? "Expected value to be false.");
  }
}

// ---------------------------------------------------------------------------
// Minimal mock DOM that supports document-level keyboard events, event paths
// crossing Shadow DOM boundaries, and editable-control detection.
// ---------------------------------------------------------------------------

class MockStyle {
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? "";
  }
}

interface FakeKeyboardEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: MockElement | null;
  readonly defaultPrevented: boolean;
  readonly stopPropagationCalled: boolean;
  composedPath: () => MockElement[];
  preventDefault: () => void;
  stopPropagation: () => void;
}

class MockElement {
  readonly nodeName: string;
  readonly children: MockElement[] = [];
  readonly style = new MockStyle();
  readonly attributes = new Map<string, string>();
  readonly eventListeners = new Map<string, ((event: unknown) => void)[]>();
  readonly dataset: Record<string, string> = {};
  shadowRoot: MockElement | null = null;
  className = "";
  textContent = "";
  isContentEditable = false;
  disabled = false;
  title = "";

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

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  set innerHTML(value: string) {
    if (value === "") {
      this.children.length = 0;
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

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const entries = this.eventListeners.get(type) ?? [];
    entries.push(listener);
    this.eventListeners.set(type, entries);
  }

  removeEventListener(
    type: string,
    listener: (event: unknown) => void
  ): void {
    const entries = this.eventListeners.get(type) ?? [];
    this.eventListeners.set(
      type,
      entries.filter((entry) => entry !== listener)
    );
  }

  click(): void {
    for (const listener of this.eventListeners.get("click") ?? []) {
      listener({ target: this });
    }
  }
}

function matchesSelector(element: MockElement, selector: string): boolean {
  if (selector.startsWith(".")) {
    return element.className
      .split(" ")
      .filter(Boolean)
      .includes(selector.slice(1));
  }
  return element.nodeName === selector.toLowerCase();
}

class MockDocument {
  readonly eventListeners = new Map<
    string,
    ((event: unknown) => void)[]
  >();
  createElementCalls: string[] = [];

  createElement(tagName: string): MockElement {
    this.createElementCalls.push(tagName);
    return new MockElement(tagName);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const entries = this.eventListeners.get(type) ?? [];
    entries.push(listener);
    this.eventListeners.set(type, entries);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const entries = this.eventListeners.get(type) ?? [];
    this.eventListeners.set(
      type,
      entries.filter((entry) => entry !== listener)
    );
  }

  dispatchEvent(event: FakeKeyboardEvent): void {
    for (const listener of this.eventListeners.get("keydown") ?? []) {
      listener(event);
    }
  }

  listenerCount(type: string): number {
    return this.eventListeners.get(type)?.length ?? 0;
  }
}

function installMockDom(): MockDocument {
  const globals = globalThis as Record<string, unknown>;
  const mockDocument = new MockDocument();
  const definedCustomElements = new Set<string>();

  class MockHTMLElement extends MockElement {}
  globals.HTMLElement = MockHTMLElement;

  globals.customElements = {
    get: (name: string): string | undefined =>
      definedCustomElements.has(name) ? name : undefined,
    define: (name: string): void => {
      definedCustomElements.add(name);
    },
  };

  globals.document = mockDocument;

  return mockDocument;
}

function createKeyboardEvent(options: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  path?: MockElement[];
}): FakeKeyboardEvent {
  const target = options.path?.[0] ?? null;
  let prevented = false;
  let stopped = false;

  const composedPath = (): MockElement[] => {
    return options.path ?? (target ? [target] : []);
  };

  const event: FakeKeyboardEvent = {
    key: options.key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    target,
    composedPath,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
    // Capture the mutable state so callers can read back whether the mock
    // event's defaults were suppressed after the handler runs.
    get defaultPrevented() {
      return prevented;
    },
    get stopPropagationCalled() {
      return stopped;
    },
  };

  return event;
}

// ---------------------------------------------------------------------------
// App fixtures.
// ---------------------------------------------------------------------------

const mockDocument = installMockDom();

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);
const { getNativeComponentRegistry, registerNativeComponents } =
  await import("@visual-ui/components");
const { renderAppShell } = await import("../app-shell.ts");
import type { AppShellApi } from "../app-shell.ts";

function createRegistry(): InstanceType<typeof ComponentRegistry> {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const nativeRegistry = getNativeComponentRegistry();
  registerNativeComponents(registry, nativeRegistry);
  return registry;
}

createRegistry();

function createContainer(): MockElement {
  return mockDocument.createElement("div");
}

// ---------------------------------------------------------------------------
// Undo shortcut tests.
// ---------------------------------------------------------------------------

test("Ctrl+Z invokes builder Undo outside editable controls", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  // Trigger a document mutation by adding a Card root instance via state.
  // The palette path is exercised indirectly: we use the toolbar's undo
  // mechanism through the shell state subscription.
  const undoButton = findButtonByLabel(container, "Undo");
  assertTrue(undoButton !== undefined, "Undo button should exist.");

  // Use the palette to add a card, giving the shell undo history.
  const cardButton = findPaletteCardButton(container);
  assertTrue(cardButton !== undefined, "Palette Card button should exist.");
  cardButton!.click();

  assertEqual(undoButton!.disabled, false, "Undo should be enabled.");

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertEqual(
    event.defaultPrevented,
    true,
    "Undo shortcut should prevent default."
  );
  assertEqual(
    undoButton!.disabled,
    true,
    "Document should be undone after Ctrl+Z."
  );

  api.destroy();
});

test("Ctrl+Z does not fire when nothing to undo", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Should not prevent default when undo unavailable."
  );

  api.destroy();
});

// ---------------------------------------------------------------------------
// Redo shortcut tests.
// ---------------------------------------------------------------------------

test("Ctrl+Y invokes builder Redo", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const redoButton = findButtonByLabel(container, "Redo")!;
  const cardButton = findPaletteCardButton(container)!;

  // Add then Undo to create a redo opportunity.
  cardButton.click();
  undoButton.click();
  assertEqual(redoButton.disabled, false, "Redo should be available.");

  const event = createKeyboardEvent({
    key: "y",
    ctrlKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertEqual(event.defaultPrevented, true, "Redo should prevent default.");
  assertEqual(redoButton.disabled, true, "Redo should be consumed.");

  api.destroy();
});

test("Ctrl+Shift+Z invokes builder Redo", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const redoButton = findButtonByLabel(container, "Redo")!;
  const cardButton = findPaletteCardButton(container)!;

  cardButton.click();
  undoButton.click();
  assertEqual(redoButton.disabled, false, "Redo should be available.");

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    shiftKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertEqual(
    event.defaultPrevented,
    true,
    "Ctrl+Shift+Z redo should prevent default."
  );
  assertEqual(redoButton.disabled, true, "Redo should be consumed.");

  api.destroy();
});

// ---------------------------------------------------------------------------
// macOS Meta modifier tests.
// ---------------------------------------------------------------------------

test("Meta+Z invokes Undo on macOS", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const cardButton = findPaletteCardButton(container)!;
  cardButton.click();
  assertEqual(undoButton.disabled, false, "Undo should be available.");

  const event = createKeyboardEvent({
    key: "z",
    metaKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertEqual(
    event.defaultPrevented,
    true,
    "Meta+Z should prevent default."
  );
  assertEqual(undoButton.disabled, true, "Undo should fire for Meta+Z.");

  api.destroy();
});

test("Meta+Shift+Z invokes Redo on macOS", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const redoButton = findButtonByLabel(container, "Redo")!;
  const cardButton = findPaletteCardButton(container)!;

  cardButton.click();
  undoButton.click();

  const event = createKeyboardEvent({
    key: "z",
    metaKey: true,
    shiftKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertEqual(
    event.defaultPrevented,
    true,
    "Meta+Shift+Z should prevent default."
  );
  assertEqual(redoButton.disabled, true, "Redo should fire for Meta+Shift+Z.");

  api.destroy();
});

// ---------------------------------------------------------------------------
// Editable control passthrough tests.
// ---------------------------------------------------------------------------

test("Native text editing shortcut inside input is not intercepted", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const input = mockDocument.createElement("input");
  container.appendChild(input);

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [input, container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Input undo must not be intercepted by builder."
  );

  api.destroy();
});

test("Native text editing shortcut inside textarea is not intercepted", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const textarea = mockDocument.createElement("textarea");
  container.appendChild(textarea);

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [textarea, container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Textarea undo must not be intercepted."
  );

  api.destroy();
});

test("contenteditable host does not trigger builder undo", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const editor = mockDocument.createElement("div");
  editor.isContentEditable = true;
  container.appendChild(editor);

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [editor, container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "contenteditable undo must not be intercepted."
  );

  api.destroy();
});

test("Editable control inside Shadow DOM is respected", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const host = mockDocument.createElement("ui-card");
  const shadowInput = mockDocument.createElement("input");
  // The Shadow DOM input is hosted in the component's shadow root; the
  // composedPath crosses the boundary: shadow input -> shadow root -> host.
  host.shadowRoot!.appendChild(shadowInput);
  container.appendChild(host);

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [shadowInput, host.shadowRoot!, host, container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Shadow DOM input undo must not be intercepted."
  );

  api.destroy();
});

// ---------------------------------------------------------------------------
// Duplicate listener and cleanup tests.
// ---------------------------------------------------------------------------

test("destroy removes the keyboard listener", () => {
  const container = createContainer();
  let api: AppShellApi;
  try {
    api = renderAppShell(container as unknown as HTMLElement);
  } catch (error) {
    throw new Error(
      `renderAppShell threw: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  assertEqual(
    mockDocument.listenerCount("keydown"),
    1,
    "One keydown listener should be registered."
  );

  api.destroy();

  assertEqual(
    mockDocument.listenerCount("keydown"),
    0,
    "Listener should be removed after destroy."
  );
});

test("Firing a shortcut after destroy is a no-op", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const undoButton = findButtonByLabel(container, "Undo")!;
  const cardButton = findPaletteCardButton(container)!;
  cardButton.click();
  assertEqual(undoButton.disabled, false, "Undo should be available.");

  api.destroy();

  const event = createKeyboardEvent({
    key: "z",
    ctrlKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Shortcut after destroy should not be handled."
  );
  assertEqual(
    undoButton.disabled,
    false,
    "Undo should not fire after destroy."
  );
});

test("Non-shortcut keys are not intercepted", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const event = createKeyboardEvent({
    key: "a",
    ctrlKey: true,
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Ctrl+A must not be intercepted."
  );

  api.destroy();
});

test("Z without modifier is not intercepted", () => {
  const container = createContainer();
  const api = renderAppShell(container as unknown as HTMLElement);

  const event = createKeyboardEvent({
    key: "z",
    path: [container],
  });

  mockDocument.dispatchEvent(event);

  assertFalse(
    event.defaultPrevented,
    "Plain 'z' must not be intercepted."
  );

  api.destroy();
});

// ---------------------------------------------------------------------------
// Helpers (mirror the existing toolbar test's tree walking).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Report results.
// ---------------------------------------------------------------------------

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
