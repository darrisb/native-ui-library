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

class MockNode {
  children: MockNode[] = [];
  private text: string = "";
  parentNode: MockNode | null = null;

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
}

class MockShadowRoot extends MockNode {}

class MockElement extends MockNode {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly style = new MockStyle();
  shadowRoot: MockShadowRoot | null = null;

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

  attachShadow(_init: { mode: string }): MockShadowRoot {
    const root = new MockShadowRoot();
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

const { UIText, registerUIText } = await import("../ui-text.js");

function createTextElement(): HTMLElement {
  const element = new UIText();
  (element as unknown as CustomElementLike).connectedCallback?.();
  return element;
}

function findTextPart(element: HTMLElement): MockElement | undefined {
  const shadow = (element as unknown as MockElement).shadowRoot;
  if (!shadow) {
    return undefined;
  }
  return shadow.children.find(
    (child): child is MockElement =>
      child instanceof MockElement &&
      child.attributes.get("part") === "text"
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

test("Default text renders as empty string", () => {
  const element = createTextElement();
  const textPart = findTextPart(element);
  assertTrue(textPart !== undefined, "Expected a text part element.");
  assertEqual(textPart!.textContent, "");
});

test("Updating the content attribute updates displayed text", () => {
  const element = createTextElement();
  element.setAttribute("content", "Hello, world!");
  const textPart = findTextPart(element);
  assertEqual(textPart!.textContent, "Hello, world!");
});

test("Text is treated as literal text rather than HTML", () => {
  const element = createTextElement();
  const malicious = '<script>alert("test")</script>';
  element.setAttribute("content", malicious);
  const textPart = findTextPart(element);
  assertEqual(textPart!.textContent, malicious);
  const htmlChild = textPart!.children.find(
    (child) => child instanceof MockElement && child.nodeName === "script"
  );
  assertEqual(htmlChild, undefined, "Expected no script child element.");
});

test("Color attribute maps to the --ui-text-color custom property", () => {
  const element = createTextElement();
  element.setAttribute("color", "#ff0000");
  const hostStyle = (element as unknown as MockElement).style;
  assertEqual(hostStyle.getPropertyValue("--ui-text-color"), "#ff0000");
});

test("Align attribute maps to the --ui-text-align custom property", () => {
  const element = createTextElement();
  element.setAttribute("align", "center");
  const hostStyle = (element as unknown as MockElement).style;
  assertEqual(hostStyle.getPropertyValue("--ui-text-align"), "center");
});

test("Invalid align value falls back to left", () => {
  const element = createTextElement();
  element.setAttribute("align", "invalid");
  const hostStyle = (element as unknown as MockElement).style;
  assertEqual(hostStyle.getPropertyValue("--ui-text-align"), "left");
});

test("Default color is applied when no color attribute is set", () => {
  const element = createTextElement();
  const hostStyle = (element as unknown as MockElement).style;
  assertEqual(hostStyle.getPropertyValue("--ui-text-color"), "#000000");
});

test("Default alignment is applied when no align attribute is set", () => {
  const element = createTextElement();
  const hostStyle = (element as unknown as MockElement).style;
  assertEqual(hostStyle.getPropertyValue("--ui-text-align"), "left");
});

test("Host CSS makes the component a block-level container", () => {
  const element = createTextElement();
  const styles = getShadowStyles(element);
  assertTrue(
    styles.includes(":host {") && styles.includes("display: block"),
    "Expected :host to use display: block."
  );
});

test("Host CSS spans the full container width so alignment has space", () => {
  const element = createTextElement();
  const styles = getShadowStyles(element);
  assertTrue(
    styles.includes(":host {") && styles.includes("width: 100%"),
    "Expected :host to span the full container width."
  );
});

test("Text part CSS applies text-align from the custom property", () => {
  const element = createTextElement();
  const styles = getShadowStyles(element);
  assertTrue(
    styles.includes('[part="text"]') &&
      styles.includes("text-align: var(--ui-text-align, left)"),
    "Expected text part to align using --ui-text-align."
  );
});

test("Text part CSS occupies full width for alignment", () => {
  const element = createTextElement();
  const styles = getShadowStyles(element);
  assertTrue(
    styles.includes('[part="text"]') && styles.includes("width: 100%"),
    "Expected text part to span the full host width."
  );
});

test("Unsupported attributes do not introduce unsafe behavior", () => {
  const element = createTextElement();
  element.setAttribute("onclick", "alert('xss')");
  element.setAttribute("style", "background: url(javascript:evil)");
  const textPart = findTextPart(element);
  assertEqual(textPart!.textContent, "");
  assertEqual(
    (element as unknown as MockElement).getAttribute("onclick"),
    "alert('xss')"
  );
});

test("Multiple Text instances remain independent", () => {
  const first = createTextElement();
  first.setAttribute("content", "First");
  first.setAttribute("color", "#111111");
  first.setAttribute("align", "left");

  const second = createTextElement();
  second.setAttribute("content", "Second");
  second.setAttribute("color", "#222222");
  second.setAttribute("align", "right");

  const firstPart = findTextPart(first);
  const secondPart = findTextPart(second);

  assertEqual(firstPart!.textContent, "First");
  assertEqual(secondPart!.textContent, "Second");

  assertEqual(
    (first as unknown as MockElement).style.getPropertyValue("--ui-text-color"),
    "#111111"
  );
  assertEqual(
    (second as unknown as MockElement).style.getPropertyValue(
      "--ui-text-color"
    ),
    "#222222"
  );

  assertEqual(
    (first as unknown as MockElement).style.getPropertyValue("--ui-text-align"),
    "left"
  );
  assertEqual(
    (second as unknown as MockElement).style.getPropertyValue(
      "--ui-text-align"
    ),
    "right"
  );
});

test("Disconnecting and reconnecting does not lose content", () => {
  const element = createTextElement();
  element.setAttribute("content", "Persistent");
  element.setAttribute("color", "#333333");
  element.setAttribute("align", "center");

  // Simulate disconnect/reconnect by invoking the connected callback again.
  (element as unknown as CustomElementLike).connectedCallback?.();

  const textPart = findTextPart(element);
  assertEqual(textPart!.textContent, "Persistent");
  const hostStyle = (element as unknown as MockElement).style;
  assertEqual(hostStyle.getPropertyValue("--ui-text-color"), "#333333");
  assertEqual(hostStyle.getPropertyValue("--ui-text-align"), "center");
});

test("registerUIText defines the ui-text custom element", () => {
  registerUIText();
  assertTrue(
    typeof customElements.get("ui-text") === "function",
    "Expected ui-text to be defined."
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
