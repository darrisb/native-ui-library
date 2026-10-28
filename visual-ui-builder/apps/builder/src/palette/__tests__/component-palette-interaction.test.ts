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

class MockElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly children: MockElement[] = [];
  readonly eventListeners = new Map<string, EventListener[]>();
  className = "";
  textContent = "";
  disabled = false;
  title = "";
  draggable = false;
  readonly classList = {
    add: (name: string): void => {
      if (!this.className.split(" ").includes(name)) {
        this.className = `${this.className} ${name}`.trim();
      }
    },
    remove: (name: string): void => {
      this.className = this.className
        .split(" ")
        .filter((entry) => entry !== name)
        .join(" ");
    },
  };

  constructor(nodeName: string) {
    this.nodeName = nodeName.toLowerCase();
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

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.eventListeners.get(type) ?? [];
    listeners.push(listener);
    this.eventListeners.set(type, listeners);
  }

  /** Invokes every listener registered for the given event type. */
  fire(type: string, event: unknown): void {
    for (const listener of this.eventListeners.get(type) ?? []) {
      listener(event as Event);
    }
  }

  click(): void {
    const listeners = this.eventListeners.get("click") ?? [];
    for (const listener of listeners) {
      listener(new Event("click"));
    }
  }

  querySelector(selector: string): MockElement | undefined {
    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  querySelectorAll(selector: string): MockElement[] {
    const matches: MockElement[] = [];
    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        matches.push(child);
      }
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
}

function matchesSelector(element: MockElement, selector: string): boolean {
  const className = selector.replace(".", "");
  return element.className.includes(className);
}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  globals.HTMLElement = class HTMLElement extends MockElement {};

  globals.document = {
    createElement: (tagName: string): MockElement => {
      return new MockElement(tagName);
    },
  };
}

installMockDom();

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);
const { renderComponentPalette } = await import("../component-palette.ts");

const document = globalThis.document as {
  createElement: (tagName: string) => MockElement;
};

function createContainer(): MockElement {
  return document.createElement("div");
}

test("Card palette entry triggers activation callback", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);

  const activated: string[] = [];
  const container = createContainer();
  renderComponentPalette(
    container as unknown as HTMLElement,
    registry,
    (type) => activated.push(type)
  );

  const buttons = container.querySelectorAll("palette-item-button");
  const cardButton = buttons.find(
    (button) =>
      button.children.some(
        (child) =>
          child.nodeName === "span" && child.className === "palette-item-name" && child.textContent === "Card"
      )
  );

  assertTrue(cardButton !== undefined, "Card button not found.");
  cardButton!.click();
  assertEqual(activated.join(","), "card");
});

test("Text and Button palette entries are draggable but not clickable for root insertion", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);

  const activated: string[] = [];
  const container = createContainer();
  renderComponentPalette(
    container as unknown as HTMLElement,
    registry,
    (type) => activated.push(type)
  );

  const buttons = container.querySelectorAll("palette-item-button");
  const textButton = buttons.find((button) =>
    button.children.some(
      (child) =>
        child.className === "palette-item-name" && child.textContent === "Text"
    )
  );
  const buttonButton = buttons.find((button) =>
    button.children.some(
      (child) =>
        child.className === "palette-item-name" && child.textContent === "Button"
    )
  );

  assertTrue(textButton !== undefined, "Text button not found.");
  assertTrue(buttonButton !== undefined, "Button button not found.");
  assertEqual(textButton!.disabled, false);
  assertEqual(buttonButton!.disabled, false);

  textButton!.click();
  buttonButton!.click();
  assertEqual(activated.join(","), "", "Text and Button must not activate root insertion.");
});

const { PALETTE_DRAG_MIME_TYPE, parsePaletteDragPayload } = await import(
  "../../drag-drop/drag-payload.ts"
);

function findPaletteItem(
  container: MockElement,
  name: string
): MockElement | undefined {
  return container
    .querySelectorAll("palette-item")
    .filter((element) => element.className.split(" ").includes("palette-item"))
    .find((element) =>
      element.querySelectorAll("palette-item-name").some(
        (child) => child.textContent === name
      )
    );
}

function createDragStartEvent() {
  const stored = new Map<string, string>();
  const event = {
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    dataTransfer: {
      effectAllowed: "uninitialized",
      setData: (type: string, value: string): void => {
        stored.set(type, value);
      },
    },
  };
  return { event, stored };
}

function renderPalette() {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const container = createContainer();
  const activated: string[] = [];
  renderComponentPalette(
    container as unknown as HTMLElement,
    registry,
    (type) => activated.push(type)
  );
  return { container, activated };
}

test("Card palette entry is draggable", () => {
  const { container } = renderPalette();
  const item = findPaletteItem(container, "Card");
  assertTrue(item !== undefined, "Card item not found.");
  assertEqual(item!.draggable, true);
});

test("Text and Button palette entries are draggable", () => {
  const { container } = renderPalette();
  for (const name of ["Text", "Button"]) {
    const item = findPaletteItem(container, name);
    assertTrue(item !== undefined, `${name} item not found.`);
    assertEqual(item!.draggable, true, `${name} must be draggable.`);
    assertEqual(
      (item!.eventListeners.get("dragstart") ?? []).length,
      1,
      `${name} must listen for dragstart.`
    );
  }
});

test("Card dragstart stores a typed payload and marks the item", () => {
  const { container } = renderPalette();
  const item = findPaletteItem(container, "Card")!;
  const { event, stored } = createDragStartEvent();

  item.fire("dragstart", event);

  assertTrue(!event.defaultPrevented, "Drag should not be cancelled.");
  assertEqual(event.dataTransfer.effectAllowed, "copy");
  const payload = parsePaletteDragPayload(stored.get(PALETTE_DRAG_MIME_TYPE));
  assertEqual(payload?.source, "component-palette");
  assertEqual(payload?.componentType, "card");
  assertEqual(stored.size, 1, "Only the palette MIME type should be set.");
  assertTrue(item.className.includes("palette-item--dragging"));
});

test("Card dragend clears the dragging state", () => {
  const { container } = renderPalette();
  const item = findPaletteItem(container, "Card")!;
  item.fire("dragstart", createDragStartEvent().event);
  item.fire("dragend", {});
  assertTrue(!item.className.includes("palette-item--dragging"));
  assertEqual(item.className, "palette-item");
});

test("Dragstart without DataTransfer is cancelled safely", () => {
  const { container } = renderPalette();
  const item = findPaletteItem(container, "Card")!;
  const event = {
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    dataTransfer: null,
  };
  item.fire("dragstart", event);
  assertTrue(event.defaultPrevented);
  assertTrue(!item.className.includes("palette-item--dragging"));
});

test("Card stays clickable for insertion after becoming draggable", () => {
  const { container, activated } = renderPalette();
  const item = findPaletteItem(container, "Card")!;
  const button = item.children.find((child) =>
    child.className.includes("palette-item-button")
  )!;
  assertEqual(button.nodeName, "button");
  button.click();
  button.click();
  assertEqual(activated.join(","), "card,card");
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
