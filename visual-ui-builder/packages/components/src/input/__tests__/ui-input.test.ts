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

class MockEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly composed: boolean;
  readonly detail: Record<string, unknown>;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(
    type: string,
    options: {
      bubbles?: boolean;
      composed?: boolean;
      detail?: Record<string, unknown>;
    } = {}
  ) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
    this.composed = options.composed ?? false;
    this.detail = options.detail ?? {};
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
  shadowRoot: MockShadowRoot | null = null;
  disabled = false;
  required = false;
  readOnly = false;
  maxLength = -1;
  type = "text";
  placeholder = "";
  id: string = "";
  private _value: string = "";

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

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = val;
  }
}

class MockHTMLElement extends MockElement {}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => new MockElement(tagName),
  };

  globals.CustomEvent = MockEvent;

  const definedElements = new Map<string, unknown>();
  globals.customElements = {
    get: (name: string): unknown => definedElements.get(name),
    define: (name: string, constructor: unknown): void => {
      definedElements.set(name, constructor);
    },
  };
}

installMockDom();

const { UIInput, registerUIInput } = await import("../ui-input.js");

function createInputElement(): HTMLElement {
  const element = new UIInput();
  (element as unknown as CustomElementLike).connectedCallback?.();
  return element;
}

function findPart(
  element: HTMLElement,
  part: string
): MockElement | undefined {
  const shadow = (element as unknown as MockElement).shadowRoot;
  if (!shadow) {
    return undefined;
  }
  return shadow.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.attributes.get("part") === part
  );
}

function findInput(element: HTMLElement): MockElement | undefined {
  return findPart(element, "input");
}

function findLabel(element: HTMLElement): MockElement | undefined {
  return findPart(element, "label");
}

function findDatalist(element: HTMLElement): MockElement | undefined {
  return findPart(element, "suggestions");
}

function getDatalistOptions(datalist: MockElement): MockElement[] {
  return datalist.children.filter(
    (child): child is MockElement =>
      child instanceof MockElement && child.nodeName === "option"
  );
}

// === TESTS ===

test("Renders a label linked to the input via for/id", () => {
  const element = createInputElement();
  const labelEl = findLabel(element);
  const input = findInput(element);
  assertTrue(labelEl !== undefined, "Expected a label element.");
  assertTrue(input !== undefined, "Expected an input element.");
  assertEqual(
    labelEl!.getAttribute("for"),
    input!.getAttribute("id"),
    "Label 'for' should match input 'id'."
  );
});

test("Maps host attributes to the inner input", () => {
  const element = createInputElement();
  element.setAttribute("input-type", "email");
  element.setAttribute("placeholder", "you@example.com");
  element.setAttribute("name", "email");
  element.setAttribute("required", "");
  element.setAttribute("disabled", "");
  element.setAttribute("readonly", "");
  element.setAttribute("max-length", "12");

  const input = findInput(element);
  assertTrue(input !== undefined, "Expected an input element.");

  assertEqual(input!.type, "email");
  assertEqual(input!.getAttribute("type"), "email");
  assertEqual(input!.placeholder, "you@example.com");
  assertEqual(input!.getAttribute("placeholder"), "you@example.com");
  assertEqual(input!.getAttribute("name"), "email");
  assertTrue(input!.required, "Expected input to be required.");
  assertEqual(input!.getAttribute("required"), "");
  assertTrue(input!.disabled, "Expected input to be disabled.");
  assertEqual(input!.getAttribute("disabled"), "");
  assertTrue(input!.readOnly, "Expected input to be read only.");
  assertEqual(input!.getAttribute("readonly"), "");
  assertEqual(input!.maxLength, 12);
  assertEqual(input!.getAttribute("maxlength"), "12");
});

test("Defaults the input type to text", () => {
  const element = createInputElement();
  const input = findInput(element);
  assertEqual(input!.type, "text");
});

test("Falls back to text for an invalid input type", () => {
  const element = createInputElement();
  element.setAttribute("input-type", "not-a-real-type");
  const input = findInput(element);
  assertEqual(input!.type, "text", "Invalid input type should fall back to text.");
});

test("Applies the default value", () => {
  const element = createInputElement();
  element.setAttribute("default-value", "preset");
  const input = findInput(element);
  assertEqual(input!.value, "preset");
  assertEqual((element as unknown as { value: string }).value, "preset");
});

test("value property gets and sets the inner input value", () => {
  const element = createInputElement();
  const host = element as unknown as { value: string };
  assertEqual(host.value, "");
  host.value = "hello";
  assertEqual(host.value, "hello");
  assertEqual(findInput(element)!.value, "hello");
});

test("Fires a bubbling composed input event with the value detail", () => {
  const element = createInputElement();
  const inputEvents: MockEvent[] = [];
  (element as unknown as MockElement).addEventListener(
    "input",
    (event: MockEvent) => {
      inputEvents.push(event);
    }
  );

  const input = findInput(element)!;
  input.value = "typed";
  input.dispatchEvent(
    new MockEvent("input", { bubbles: true, composed: true })
  );

  assertEqual(inputEvents.length, 1, "Expected one input event.");
  assertEqual(inputEvents[0].detail.value, "typed");
  assertTrue(inputEvents[0].bubbles, "Expected input event to bubble.");
  assertTrue(inputEvents[0].composed, "Expected input event to be composed.");
});

test("Fires a bubbling composed change event with the value detail", () => {
  const element = createInputElement();
  const changeEvents: MockEvent[] = [];
  (element as unknown as MockElement).addEventListener(
    "change",
    (event: MockEvent) => {
      changeEvents.push(event);
    }
  );

  const input = findInput(element)!;
  input.value = "committed";
  input.dispatchEvent(
    new MockEvent("change", { bubbles: true, composed: true })
  );

  assertEqual(changeEvents.length, 1, "Expected one change event.");
  assertEqual(changeEvents[0].detail.value, "committed");
  assertTrue(changeEvents[0].bubbles, "Expected change event to bubble.");
  assertTrue(changeEvents[0].composed, "Expected change event to be composed.");
});

test("Events bubble through Shadow DOM to a parent container", () => {
  const element = createInputElement();
  const parent = new MockElement("div");
  parent.appendChild(element as unknown as MockElement);

  let parentChangeCount = 0;
  parent.addEventListener("change", () => {
    parentChangeCount += 1;
  });

  const input = findInput(element)!;
  input.value = "bubbled";
  input.dispatchEvent(
    new MockEvent("change", { bubbles: true, composed: true })
  );

  assertEqual(parentChangeCount, 1, "Expected parent to receive change event.");
});

test("Label text renders as text, not HTML", () => {
  const element = createInputElement();
  const markup = '<img src=x onerror="alert(1)">';
  element.setAttribute("label", markup);
  const labelEl = findLabel(element);
  assertEqual(labelEl!.textContent, markup);
  const imgChild = labelEl!.children.find(
    (child) =>
      child instanceof MockElement && child.nodeName === "img"
  );
  assertEqual(imgChild, undefined, "Expected no img child element.");
});

test("Renders a datalist linked to the input via list", () => {
  const element = createInputElement();
  const input = findInput(element);
  const datalist = findDatalist(element);
  assertTrue(input !== undefined, "Expected an input element.");
  assertTrue(datalist !== undefined, "Expected a datalist element.");
  assertEqual(datalist!.nodeName, "datalist");
  assertEqual(
    input!.getAttribute("list"),
    datalist!.getAttribute("id"),
    "Input 'list' should match the datalist 'id'."
  );
});

test("data-bound-options produces matching datalist options", () => {
  const element = createInputElement();
  element.setAttribute(
    "data-bound-options",
    JSON.stringify([
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
    ])
  );
  const datalist = findDatalist(element);
  const options = getDatalistOptions(datalist!);
  assertEqual(options.length, 2, "Expected 2 suggestions.");
  assertEqual(options[0].value, "apple");
  assertEqual(options[0].textContent, "Apple");
  assertEqual(options[1].value, "banana");
  assertEqual(options[1].textContent, "Banana");
});

test("Invalid data-bound-options JSON yields no suggestions without throwing", () => {
  const element = createInputElement();
  element.setAttribute("data-bound-options", "not valid json {{{");
  const datalist = findDatalist(element);
  const options = getDatalistOptions(datalist!);
  assertEqual(options.length, 0, "Expected no suggestions for invalid JSON.");
});

test("Updating data-bound-options replaces previous suggestions", () => {
  const element = createInputElement();
  element.setAttribute(
    "data-bound-options",
    JSON.stringify([{ value: "old", label: "Old" }])
  );
  element.setAttribute(
    "data-bound-options",
    JSON.stringify([{ value: "new", label: "New" }])
  );
  const options = getDatalistOptions(findDatalist(element)!);
  assertEqual(options.length, 1, "Expected 1 suggestion.");
  assertEqual(options[0].value, "new");
});

test("Suggestion labels containing markup render as text, not HTML", () => {
  const element = createInputElement();
  element.setAttribute(
    "data-bound-options",
    JSON.stringify([
      { value: "xss", label: '<script>alert("xss")</script>' },
    ])
  );
  const options = getDatalistOptions(findDatalist(element)!);
  assertEqual(options.length, 1, "Expected 1 suggestion.");
  assertEqual(
    options[0].textContent,
    '<script>alert("xss")</script>',
    "Expected markup to render as text."
  );
  const scriptChild = options[0].children.find(
    (child) =>
      child instanceof MockElement && child.nodeName === "script"
  );
  assertEqual(scriptChild, undefined, "Expected no script child element.");
});

test("Loading state sets aria-busy and keeps typing enabled", () => {
  const element = createInputElement();
  element.setAttribute("data-ds-status", "loading");
  const input = findInput(element)!;
  assertEqual(input.getAttribute("aria-busy"), "true");
  assertTrue(!input.disabled, "Loading should not disable typing.");

  input.value = "still typing";
  input.dispatchEvent(
    new MockEvent("input", { bubbles: true, composed: true })
  );
  assertEqual(
    (element as unknown as { value: string }).value,
    "still typing",
    "Typing should work while loading."
  );
});

test("Error state sets aria-invalid and keeps typing enabled", () => {
  const element = createInputElement();
  element.setAttribute("data-ds-status", "error");
  element.setAttribute("data-ds-error", "Failed to load suggestions");
  const input = findInput(element)!;
  assertEqual(input.getAttribute("aria-invalid"), "true");
  assertEqual(input.getAttribute("aria-busy"), null);
  assertTrue(!input.disabled, "Error should not disable typing.");

  input.value = "after error";
  input.dispatchEvent(
    new MockEvent("input", { bubbles: true, composed: true })
  );
  assertEqual(
    (element as unknown as { value: string }).value,
    "after error",
    "Typing should work after an error."
  );
});

test("Idle state clears suggestion status attributes", () => {
  const element = createInputElement();
  element.setAttribute("data-ds-status", "error");
  element.setAttribute("data-ds-status", "idle");
  const input = findInput(element)!;
  assertEqual(input.getAttribute("aria-invalid"), null);
  assertEqual(input.getAttribute("aria-busy"), null);
});

test("registerUIInput defines the ui-input custom element", () => {
  registerUIInput();
  assertTrue(
    typeof customElements.get("ui-input") === "function",
    "Expected ui-input to be defined."
  );
});

test("registerUIInput is idempotent", () => {
  registerUIInput();
  registerUIInput();
  assertTrue(
    typeof customElements.get("ui-input") === "function",
    "Expected ui-input to remain defined."
  );
});

// === REPORT ===

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
