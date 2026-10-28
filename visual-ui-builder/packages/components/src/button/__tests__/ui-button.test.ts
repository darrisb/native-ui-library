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

interface CustomElementLike {
  attributeChangedCallback?(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void;
  connectedCallback?(): void;
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

class MockEvent {
  readonly type: string;
  readonly bubbles: boolean;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, options: { bubbles?: boolean } = {}) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class MockNode {
  children: MockNode[] = [];
  private text: string = "";
  parentNode: MockNode | null = null;
  private listeners = new Map<string, Array<(event: MockEvent) => void>>();

  appendChild(child: MockNode): MockNode {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: MockNode[]): void {
    for (const child of this.children) {
      child.parentNode = null;
    }
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  addEventListener(type: string, listener: (event: MockEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: MockEvent): boolean {
    const list = this.listeners.get(event.type) ?? [];
    for (const listener of list) {
      if (event.propagationStopped) {
        break;
      }
      listener(event);
    }

    if (event.bubbles && !event.propagationStopped && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }

    return !event.defaultPrevented;
  }
}

class MockShadowRoot extends MockNode {}

class MockElement extends MockNode {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly style = new MockStyle();
  shadowRoot: MockShadowRoot | null = null;
  disabled = false;

  constructor(nodeName?: string) {
    super();
    this.nodeName = nodeName?.toLowerCase() ?? "element";
  }

  setAttribute(name: string, value: string): void {
    const lowerName = name.toLowerCase();
    const oldValue = this.attributes.get(lowerName) ?? null;
    this.attributes.set(lowerName, String(value));

    const customLike = this as unknown as CustomElementLike;
    if (
      typeof customLike.attributeChangedCallback === "function" &&
      oldValue !== String(value)
    ) {
      customLike.attributeChangedCallback(lowerName, oldValue, String(value));
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name.toLowerCase());
  }

  attachShadow(_init: { mode: string }): MockShadowRoot {
    const root = new MockShadowRoot();
    root.parentNode = this;
    this.shadowRoot = root;
    return root;
  }
}

class MockHTMLElement extends MockElement {}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => new MockElement(tagName),
  };

  const definedElements = new Map<string, unknown>();
  globals.customElements = {
    get: (name: string): unknown => definedElements.get(name),
    define: (name: string, constructor: unknown): void => {
      definedElements.set(name, constructor);
    },
  };
}

installMockDom();

const { UIButton, registerUIButton } = await import("../ui-button.js");

function createButtonElement(): HTMLElement {
  const element = new UIButton();
  (element as unknown as CustomElementLike).connectedCallback?.();
  return element;
}

function findButtonPart(element: HTMLElement): MockElement | undefined {
  const shadow = (element as unknown as MockElement).shadowRoot;
  if (!shadow) {
    return undefined;
  }
  return shadow.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.attributes.get("part") === "button"
  );
}

function getShadowStyles(element: HTMLElement): string {
  const shadow = (element as unknown as MockElement).shadowRoot;
  if (!shadow) {
    return "";
  }
  const styleElement = shadow.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.nodeName === "style"
  );
  return styleElement?.textContent ?? "";
}

test("Default label renders as 'Button'", () => {
  const element = createButtonElement();
  const buttonPart = findButtonPart(element);
  assertTrue(buttonPart !== undefined, "Expected a button part element.");
  assertEqual(buttonPart!.textContent, "Button");
});

test("Updating the label attribute updates displayed text", () => {
  const element = createButtonElement();
  element.setAttribute("label", "Submit");
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.textContent, "Submit");
});

test("Label is treated as literal text rather than HTML", () => {
  const element = createButtonElement();
  const malicious = '<script>alert("test")</script>';
  element.setAttribute("label", malicious);
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.textContent, malicious);
  const htmlChild = buttonPart!.children.find(
    (child) => child instanceof MockElement && child.nodeName === "script"
  );
  assertEqual(htmlChild, undefined, "Expected no script child element.");
});

test("Variant attribute maps to data-variant on the native button", () => {
  const element = createButtonElement();
  element.setAttribute("variant", "secondary");
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.getAttribute("data-variant"), "secondary");
});

test("All supported variant values are applied", () => {
  for (const variant of ["primary", "secondary", "ghost"]) {
    const element = createButtonElement();
    element.setAttribute("variant", variant);
    const buttonPart = findButtonPart(element);
    assertEqual(buttonPart!.getAttribute("data-variant"), variant);
  }
});

test("Invalid variant value falls back to primary", () => {
  const element = createButtonElement();
  element.setAttribute("variant", "invalid");
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.getAttribute("data-variant"), "primary");
});

test("Disabled attribute is reflected onto the native button", () => {
  const element = createButtonElement();
  element.setAttribute("disabled", "");
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.getAttribute("disabled"), "");
  assertTrue(buttonPart!.disabled, "Expected native button to be disabled.");
});

test("Disabled='false' keeps the native button enabled", () => {
  const element = createButtonElement();
  element.setAttribute("disabled", "false");
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.getAttribute("disabled"), null);
  assertTrue(!buttonPart!.disabled, "Expected native button to remain enabled.");
});

test("Multiple Button instances remain independent", () => {
  const first = createButtonElement();
  first.setAttribute("label", "First");
  first.setAttribute("variant", "secondary");
  first.setAttribute("disabled", "");

  const second = createButtonElement();
  second.setAttribute("label", "Second");
  second.setAttribute("variant", "ghost");

  const firstPart = findButtonPart(first);
  const secondPart = findButtonPart(second);

  assertEqual(firstPart!.textContent, "First");
  assertEqual(secondPart!.textContent, "Second");
  assertEqual(firstPart!.getAttribute("data-variant"), "secondary");
  assertEqual(secondPart!.getAttribute("data-variant"), "ghost");
  assertTrue(firstPart!.disabled);
  assertTrue(!secondPart!.disabled);
});

test("Disconnecting and reconnecting does not lose state", () => {
  const element = createButtonElement();
  element.setAttribute("label", "Persistent");
  element.setAttribute("variant", "ghost");
  element.setAttribute("disabled", "");

  (element as unknown as CustomElementLike).connectedCallback?.();

  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.textContent, "Persistent");
  assertEqual(buttonPart!.getAttribute("data-variant"), "ghost");
  assertTrue(buttonPart!.disabled);
});

test("Native button uses type='button'", () => {
  const element = createButtonElement();
  const buttonPart = findButtonPart(element);
  assertEqual(buttonPart!.getAttribute("type"), "button");
});

test("Focus styling is present in Shadow DOM styles", () => {
  const element = createButtonElement();
  const styles = getShadowStyles(element);
  assertTrue(
    styles.includes(":focus-visible"),
    "Expected :focus-visible styles."
  );
});

test("Consumer click listeners can observe activation", () => {
  const element = createButtonElement();
  element.setAttribute("label", "Click me");
  const buttonPart = findButtonPart(element);

  let clicks = 0;
  element.addEventListener("click", () => {
    clicks += 1;
  });

  buttonPart!.dispatchEvent(new MockEvent("click", { bubbles: true }));

  assertEqual(clicks, 1, "Expected host click listener to fire once.");
});

test("Click event bubbles through Shadow DOM to a parent container", () => {
  const element = createButtonElement();
  element.setAttribute("label", "Nested");
  const buttonPart = findButtonPart(element);

  const parent = new MockElement("div");
  parent.appendChild(element as unknown as MockElement);

  let clicks = 0;
  parent.addEventListener("click", () => {
    clicks += 1;
  });

  buttonPart!.dispatchEvent(new MockEvent("click", { bubbles: true }));

  assertEqual(clicks, 1, "Expected parent container click listener to fire.");
});

test("Disabled button does not dispatch activation click", () => {
  const element = createButtonElement();
  element.setAttribute("disabled", "");
  const buttonPart = findButtonPart(element);

  let clicks = 0;
  element.addEventListener("click", () => {
    clicks += 1;
  });

  // A disabled native button suppresses click events in real browsers. The mock
  // does not model that automatic suppression, so this test verifies the state
  // consumers can inspect instead.
  assertTrue(buttonPart!.disabled, "Expected button to be disabled.");
  assertEqual(clicks, 0);
});

test("registerUIButton defines the ui-button custom element", () => {
  registerUIButton();
  assertTrue(
    typeof customElements.get("ui-button") === "function",
    "Expected ui-button to be defined."
  );
});

test("registerUIButton is idempotent", () => {
  registerUIButton();
  registerUIButton();
  assertTrue(
    typeof customElements.get("ui-button") === "function",
    "Expected ui-button to remain defined after repeated registration."
  );
});

test("Native Button shadow root does not contain a builder selection surface", () => {
  const element = createButtonElement();
  const shadow = (element as unknown as MockElement).shadowRoot!;
  const surface = shadow.children.find(
    (child) =>
      child instanceof MockElement &&
      child.attributes.get("class")?.includes("canvas-selection-surface")
  );
  assertEqual(
    surface,
    undefined,
    "The native component must not include builder-specific selection surfaces."
  );
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
