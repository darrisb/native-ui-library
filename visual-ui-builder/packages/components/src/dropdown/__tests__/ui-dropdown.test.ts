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
    options: { bubbles?: boolean; composed?: boolean; detail?: Record<string, unknown> } = {}
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
  private _value: string = "";
  id: string = "";

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

const { UIDropdown, registerUIDropdown } = await import("../ui-dropdown.js");

function createDropdownElement(): HTMLElement {
  const element = new UIDropdown();
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

function findSelect(element: HTMLElement): MockElement | undefined {
  return findPart(element, "select");
}

function findLabel(element: HTMLElement): MockElement | undefined {
  return findPart(element, "label");
}

function findError(element: HTMLElement): MockElement | undefined {
  return findPart(element, "error");
}

function getSelectOptions(select: MockElement): MockElement[] {
  return select.children.filter(
    (child): child is MockElement =>
      child instanceof MockElement && child.nodeName === "option"
  );
}

// === TESTS ===

test("Renders static options from the options attribute", () => {
  const optionsJSON = JSON.stringify([
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
  ]);
  const element = createDropdownElement();
  element.setAttribute("options", optionsJSON);
  const select = findSelect(element);
  assertTrue(select !== undefined, "Expected a select element.");
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 2, "Expected 2 options.");
  assertEqual(opts[0].value, "a");
  assertEqual(opts[0].textContent, "Option A");
  assertEqual(opts[1].value, "b");
  assertEqual(opts[1].textContent, "Option B");
});

test("Renders placeholder as a disabled first option", () => {
  const optionsJSON = JSON.stringify([
    { value: "a", label: "Option A" },
  ]);
  const element = createDropdownElement();
  element.setAttribute("options", optionsJSON);
  element.setAttribute("placeholder", "Choose…");
  const select = findSelect(element);
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 2, "Expected placeholder + 1 option.");
  assertTrue(opts[0].disabled, "Placeholder option should be disabled.");
  assertEqual(opts[0].value, "");
  assertEqual(opts[0].textContent, "Choose…");
});

test("data-bound-options overrides options attribute", () => {
  const staticJSON = JSON.stringify([{ value: "static", label: "Static" }]);
  const boundJSON = JSON.stringify([
    { value: "bound1", label: "Bound 1" },
    { value: "bound2", label: "Bound 2" },
  ]);
  const element = createDropdownElement();
  element.setAttribute("options", staticJSON);
  element.setAttribute("data-bound-options", boundJSON);
  const select = findSelect(element);
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 2, "Expected 2 bound options.");
  assertEqual(opts[0].value, "bound1");
  assertEqual(opts[0].textContent, "Bound 1");
});

test("Invalid data-bound-options JSON yields no options without throwing", () => {
  const element = createDropdownElement();
  element.setAttribute("data-bound-options", "not valid json {{{");
  // Should not throw - already created above
  const select = findSelect(element);
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 0, "Expected no options for invalid JSON.");
});

test("Invalid options JSON yields no options without throwing", () => {
  const element = createDropdownElement();
  element.setAttribute("options", "not valid json {{{");
  const select = findSelect(element);
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 0, "Expected no options for invalid JSON.");
});

test("Loading state disables select, shows 'Loading…' option, and sets aria-busy", () => {
  const element = createDropdownElement();
  element.setAttribute("data-ds-status", "loading");
  const select = findSelect(element);
  assertTrue(select!.disabled, "Expected select to be disabled.");
  assertEqual(select!.getAttribute("aria-busy"), "true");
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 1, "Expected 1 loading option.");
  assertEqual(opts[0].textContent, "Loading\u2026");
  assertTrue(opts[0].disabled, "Loading option should be disabled.");
});

test("Empty state shows 'No options' message", () => {
  const element = createDropdownElement();
  element.setAttribute("data-ds-status", "empty");
  element.setAttribute(
    "data-bound-options",
    JSON.stringify([])
  );
  const select = findSelect(element);
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 1, "Expected 1 empty option.");
  assertEqual(opts[0].textContent, "No options");
});

test("Error state sets aria-invalid and shows error text", () => {
  const element = createDropdownElement();
  element.setAttribute("data-ds-status", "error");
  element.setAttribute("data-ds-error", "Failed to load options");
  const select = findSelect(element);
  assertEqual(select!.getAttribute("aria-invalid"), "true");
  const errorEl = findError(element);
  assertEqual(errorEl!.textContent, "Failed to load options");
});

test("Option labels containing <script> render as text, not HTML", () => {
  const optionsJSON = JSON.stringify([
    { value: "xss", label: '<script>alert("xss")</script>' },
  ]);
  const element = createDropdownElement();
  element.setAttribute("options", optionsJSON);
  const select = findSelect(element);
  const opts = getSelectOptions(select!);
  assertEqual(opts.length, 1, "Expected 1 option.");
  assertEqual(
    opts[0].textContent,
    '<script>alert("xss")</script>',
    "Expected script tag to be rendered as text."
  );
  // No child <script> element
  const scriptChild = opts[0].children.find(
    (child) =>
      child instanceof MockElement && child.nodeName === "script"
  );
  assertEqual(scriptChild, undefined, "Expected no script child element.");
});

test("value property returns current select value", () => {
  const dropdown = createDropdownElement();
  const dd = dropdown as unknown as { value: string };
  assertEqual(dd.value, "");
  dd.value = "test-val";
  assertEqual(dd.value, "test-val");
});

test("value setter updates the native select value", () => {
  const dropdown = createDropdownElement();
  const dd = dropdown as unknown as { value: string };
  const optionsJSON = JSON.stringify([
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ]);
  dropdown.setAttribute("options", optionsJSON);
  dd.value = "b";
  const select = findSelect(dropdown);
  assertEqual(select!.value, "b");
});

test("Selecting an option fires a bubbling composed change event", () => {
  const element = createDropdownElement();
  const optionsJSON = JSON.stringify([
    { value: "x", label: "X" },
    { value: "y", label: "Y" },
  ]);
  element.setAttribute("options", optionsJSON);

  const changeDetails: Array<{ value: unknown }> = [];
  (element as unknown as MockElement).addEventListener("change", (e: MockEvent) => {
    changeDetails.push({ value: e.detail.value });
  });

  const select = findSelect(element);
  // Simulate selecting the second option
  select!.value = "y";
  select!.dispatchEvent(
    new MockEvent("change", { bubbles: true, composed: true })
  );

  assertEqual(changeDetails.length, 1, "Expected one change event.");
  assertEqual(changeDetails[0].value, "y");
});

test("Change event bubbles through Shadow DOM to parent container", () => {
  const element = createDropdownElement();
  element.setAttribute(
    "options",
    JSON.stringify([{ value: "z", label: "Z" }])
  );

  const parent = new MockElement("div");
  parent.appendChild(element as unknown as MockElement);

  let parentChangeCount = 0;
  parent.addEventListener("change", () => {
    parentChangeCount += 1;
  });

  const select = findSelect(element);
  select!.value = "z";
  select!.dispatchEvent(
    new MockEvent("change", { bubbles: true, composed: true })
  );

  assertEqual(parentChangeCount, 1, "Expected parent to receive change event.");
});

test("Label attribute renders in the label element", () => {
  const element = createDropdownElement();
  element.setAttribute("label", "Select Color");
  const labelEl = findLabel(element);
  assertEqual(labelEl!.textContent, "Select Color");
});

test("Label element is linked to the select via for/id", () => {
  const element = createDropdownElement();
  const labelEl = findLabel(element);
  const select = findSelect(element);
  const labelFor = labelEl!.getAttribute("for");
  const selectId = select!.getAttribute("id");
  assertEqual(labelFor, selectId, "Label 'for' should match select 'id'.");
});

test("registerUIDropdown defines the ui-dropdown custom element", () => {
  registerUIDropdown();
  assertTrue(
    typeof customElements.get("ui-dropdown") === "function",
    "Expected ui-dropdown to be defined."
  );
});

test("registerUIDropdown is idempotent", () => {
  registerUIDropdown();
  registerUIDropdown();
  assertTrue(
    typeof customElements.get("ui-dropdown") === "function",
    "Expected ui-dropdown to remain defined."
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
