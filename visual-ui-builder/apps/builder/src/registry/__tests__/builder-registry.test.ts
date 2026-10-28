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

  private readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor(nodeName: string) {
    this.nodeName = nodeName.toLowerCase();
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
    this.fire("click", event);
    return true;
  }
}

class MockHTMLElement extends MockElement {}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => {
      return new MockHTMLElement(tagName);
    },
  };
}

installMockDom();

const {
  getNativeComponentRegistry,
  NativeComponentRegistry,
} = await import("@visual-ui/components");
const {
  builderComponentRegistry,
  registerBuilderNativeComponents,
} = await import("../builder-registry.ts");
const { renderBuilderCanvas } = await import("../../canvas/builder-canvas.ts");
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

function getCard(container: MockElement, index: number): MockElement {
  return getContent(container).children[index].children[0];
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

test("Builder metadata registry contains Card, Text, and Button definitions", () => {
  assertTrue(builderComponentRegistry.lookup("card") !== undefined);
  assertTrue(builderComponentRegistry.lookup("text") !== undefined);
  assertTrue(builderComponentRegistry.lookup("button") !== undefined);
});

test("Builder's native registry resolves Card", () => {
  const nativeRegistry = new NativeComponentRegistry();
  registerBuilderNativeComponents(nativeRegistry);
  assertEqual(nativeRegistry.lookupTag("card"), "ui-card");
});

test("Builder's native registry resolves Text", () => {
  const nativeRegistry = new NativeComponentRegistry();
  registerBuilderNativeComponents(nativeRegistry);
  assertEqual(nativeRegistry.lookupTag("text"), "ui-text");
});

test("Builder's native registry resolves Button", () => {
  const nativeRegistry = new NativeComponentRegistry();
  registerBuilderNativeComponents(nativeRegistry);
  assertEqual(nativeRegistry.lookupTag("button"), "ui-button");
});

test("Nested development fixture renders without missing-mapping errors", () => {
  const nativeRegistry = getNativeComponentRegistry();
  registerBuilderNativeComponents(nativeRegistry);

  const container = createContainer();
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    createNestedBuilderDocument(),
    builderComponentRegistry,
    nativeRegistry
  );

  const rootCard = findElementById(getCard(container, 0), "root-card");
  assertTrue(rootCard !== undefined, "Root card should render.");
  assertEqual(rootCard!.nodeName, "ui-card");

  const textElement = findElementById(getCard(container, 0), "text-1");
  assertTrue(textElement !== undefined, "Nested text should render.");
  assertEqual(textElement!.nodeName, "ui-text");

  const buttonElement = findElementById(getCard(container, 0), "button-1");
  assertTrue(buttonElement !== undefined, "Nested button should render.");
  assertEqual(buttonElement!.nodeName, "ui-button");

  const nestedCard = findElementById(getCard(container, 0), "nested-card");
  assertTrue(nestedCard !== undefined, "Nested card should render.");
  assertEqual(nestedCard!.nodeName, "ui-card");

  const deeplyNestedText = findElementById(getCard(container, 0), "text-2");
  assertTrue(
    deeplyNestedText !== undefined,
    "Deeply nested text should render."
  );
  assertEqual(deeplyNestedText!.nodeName, "ui-text");
});

test("Existing root Card rendering still works", () => {
  const nativeRegistry = getNativeComponentRegistry();
  registerBuilderNativeComponents(nativeRegistry);

  const container = createContainer();
  renderBuilderCanvas(
    container as unknown as HTMLElement,
    {
      rootInstances: [
        {
          id: "card-1",
          type: "card",
          properties: {
            title: "Root Card",
            padding: 16,
            backgroundColor: "#ffffff",
          },
        },
      ],
    },
    builderComponentRegistry,
    nativeRegistry
  );

  const card = getCard(container, 0);
  assertEqual(card.nodeName, "ui-card");
  assertEqual(card.getAttribute("title"), "Root Card");
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
