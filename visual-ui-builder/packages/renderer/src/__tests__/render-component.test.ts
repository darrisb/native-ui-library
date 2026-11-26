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

class MockElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly style = new MockStyle();
  parentNode: MockElement | null = null;
  readonly childNodes: MockElement[] = [];

  constructor(nodeName: string) {
    this.nodeName = nodeName.toLowerCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name.toLowerCase(), String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name.toLowerCase());
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  get children(): MockElement[] {
    return this.childNodes;
  }

  get firstElementChild(): MockElement | null {
    return this.childNodes[0] ?? null;
  }
}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  class MockHTMLElement extends MockElement {}
  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => new MockElement(tagName),
  };

  globals.customElements = {
    get: (name: string): object | undefined => {
      const defined = new Set([
      "ui-card",
      "ui-text",
      "ui-button",
      "ui-dropdown",
      "ui-input",
      "ui-table",
    ]);
      return defined.has(name) ? {} : undefined;
    },
    define: (): void => {},
  };
}

installMockDom();

import type { ComponentInstance } from "@visual-ui/core";

const { ComponentRegistry, cardDefinition, buttonDefinition, textDefinition } =
  await import("@visual-ui/core");

const {
  NativeComponentRegistry,
  registerCard,
  registerText,
  registerButton,
  registerDropdown,
  registerInput,
  registerTable,
} = await import("@visual-ui/components");
const { renderComponent } = await import("../dom/render-component.js");

function createCardInstance(
  id: string,
  properties: Record<string, string | number | boolean> = { title: "Hello" },
  children?: readonly ComponentInstance[]
): ComponentInstance {
  return {
    id,
    type: "card",
    properties,
    ...(children !== undefined ? { children } : {}),
  };
}



function createRegistries() {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  registerText(metadataRegistry, nativeRegistry);
  registerButton(metadataRegistry, nativeRegistry);
  registerDropdown(metadataRegistry, nativeRegistry);
  registerInput(metadataRegistry, nativeRegistry);
  registerTable(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

test("A valid Card instance produces a ui-card element", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-1", {
    title: "Hello",
    padding: 24,
    backgroundColor: "#f0f0f0",
  });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.nodeName, "ui-card");
});

test("The returned element is not automatically attached to the document", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-2");
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.parentNode, null);
});

test("Title maps to the title HTML attribute", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-3", { title: "Card Title" });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.getAttribute("title"), "Card Title");
});

test("Description maps to the description HTML attribute", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-3-desc", {
    title: "Card Title",
    description: "Card description text.",
  });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.getAttribute("description"), "Card description text.");
});

test("Description defaults to an empty string attribute when present", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-3-empty-desc", {
    title: "Card Title",
    description: "",
  });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.getAttribute("description"), "");
});

test("Padding maps to the --ui-card-padding CSS custom property with px", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-4", { padding: 32 });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.style.getPropertyValue("--ui-card-padding"), "32px");
});

test("Background color maps to the --ui-card-background CSS custom property", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-5", { backgroundColor: "#8b0000" });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.style.getPropertyValue("--ui-card-background"), "#8b0000");
});

test("An unknown component type is rejected", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  const instance = {
    id: "unknown-1",
    type: "unknown",
    properties: {},
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected unknown component type to throw.");
});

test("A missing native tag mapping is rejected", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(cardDefinition);
  const nativeRegistry = new NativeComponentRegistry();
  const instance = createCardInstance("card-6");
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("no native tag mapping"),
      `Expected missing native tag mapping error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected missing native tag mapping to throw.");
});

test("Invalid property types are rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-7", {
    padding: "not-a-number" as unknown as number,
  });
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes('must be of type "number"'),
      `Expected invalid property type error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected invalid property type to throw.");
});

test("Unknown properties are rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-8", {
    unknownProp: "x" as unknown as string,
  });
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("not supported"),
      `Expected unknown property error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected unknown property to throw.");
});

test("Invalid select values are rejected when applicable", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(buttonDefinition);
  metadataRegistry.register(textDefinition);
  const nativeRegistry = new NativeComponentRegistry();
  nativeRegistry.register("button", "ui-button");
  const instance = {
    id: "button-1",
    type: "button",
    properties: { variant: "invalid" },
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("not one of the allowed"),
      `Expected invalid select value error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected invalid select value to throw.");
});

test("Card with one Text child renders recursively", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-9", { title: "Parent" }, [
    {
      id: "text-1",
      type: "text",
      properties: { content: "Hello", color: "#333333", align: "left" },
    },
  ]);
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-card");
  assertEqual(element.children.length, 1);
  assertEqual(element.firstElementChild?.nodeName, "ui-text");
  assertEqual(element.firstElementChild?.getAttribute("content"), "Hello");
  assertEqual(element.firstElementChild?.getAttribute("color"), "#333333");
  assertEqual(element.firstElementChild?.getAttribute("align"), "left");
});

test("Card with one Button child renders recursively", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-10", { title: "Parent" }, [
    {
      id: "button-1",
      type: "button",
      properties: { label: "Click", variant: "primary" },
    },
  ]);
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-card");
  assertEqual(element.children.length, 1);
  assertEqual(element.firstElementChild?.nodeName, "ui-button");
  assertEqual(element.firstElementChild?.getAttribute("label"), "Click");
  assertEqual(element.firstElementChild?.getAttribute("variant"), "primary");
});

test("Card with multiple children preserves order", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-11", { title: "Parent" }, [
    {
      id: "text-1",
      type: "text",
      properties: { content: "First" },
    },
    {
      id: "button-1",
      type: "button",
      properties: { label: "Second" },
    },
    {
      id: "text-2",
      type: "text",
      properties: { content: "Third" },
    },
  ]);
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.children.length, 3);
  assertEqual(element.children[0].nodeName, "ui-text");
  assertEqual(element.children[0].getAttribute("content"), "First");
  assertEqual(element.children[1].nodeName, "ui-button");
  assertEqual(element.children[1].getAttribute("label"), "Second");
  assertEqual(element.children[2].nodeName, "ui-text");
  assertEqual(element.children[2].getAttribute("content"), "Third");
});

test("Nested Card containing Text renders", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-outer", { title: "Outer" }, [
    {
      id: "card-inner",
      type: "card",
      properties: { title: "Inner" },
      children: [
        {
          id: "text-1",
          type: "text",
          properties: { content: "Nested text" },
        },
      ],
    },
  ]);
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-card");
  assertEqual(element.children.length, 1);
  assertEqual(element.children[0].nodeName, "ui-card");
  assertEqual(element.children[0].getAttribute("title"), "Inner");
  assertEqual(element.children[0].children.length, 1);
  assertEqual(element.children[0].children[0].nodeName, "ui-text");
  assertEqual(element.children[0].children[0].getAttribute("content"), "Nested text");
});

test("Multiple nesting levels render", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-level-0", { title: "Level 0" }, [
    {
      id: "card-level-1",
      type: "card",
      properties: { title: "Level 1" },
      children: [
        {
          id: "card-level-2",
          type: "card",
          properties: { title: "Level 2" },
          children: [
            {
              id: "text-deep",
              type: "text",
              properties: { content: "Deep" },
            },
          ],
        },
      ],
    },
  ]);
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-card");
  const level1 = element.children[0];
  const level2 = level1.children[0];
  const deepText = level2.children[0];
  assertEqual(level1.nodeName, "ui-card");
  assertEqual(level2.nodeName, "ui-card");
  assertEqual(deepText.nodeName, "ui-text");
  assertEqual(deepText.getAttribute("content"), "Deep");
});

test("Text with children is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "text-parent",
    type: "text",
    properties: { content: "Parent" },
    children: [
      {
        id: "text-child",
        type: "text",
        properties: { content: "Child" },
      },
    ],
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("does not allow children"),
      `Expected disallow-children error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected Text with children to throw.");
});

test("Button with children is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "button-parent",
    type: "button",
    properties: { label: "Parent" },
    children: [
      {
        id: "text-child",
        type: "text",
        properties: { content: "Child" },
      },
    ],
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("does not allow children"),
      `Expected disallow-children error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected Button with children to throw.");
});

test("Unknown child component is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-unknown-child", { title: "Parent" }, [
    {
      id: "unknown-child",
      type: "unknown",
      properties: {},
    },
  ]);
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("Unknown component type"),
      `Expected unknown child error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected unknown child component to throw.");
});

test("Invalid child property is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-invalid-child", { title: "Parent" }, [
    {
      id: "text-invalid",
      type: "text",
      properties: { unknownProp: "x" as unknown as string },
    },
  ]);
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("not supported"),
      `Expected invalid child property error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected invalid child property to throw.");
});

test("Empty children are accepted", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-empty", { title: "Empty" }, []);
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.nodeName, "ui-card");
  assertEqual(element.children.length, 0);
});

test("Omitted children are accepted", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-omitted", { title: "Omitted" });
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.nodeName, "ui-card");
  assertEqual(element.children.length, 0);
});

test("Existing Card-only rendering remains unchanged", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-only", {
    title: "Only",
    padding: 20,
    backgroundColor: "#f0fdf4",
  });
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-card");
  assertEqual(element.getAttribute("title"), "Only");
  assertEqual(element.style.getPropertyValue("--ui-card-padding"), "20px");
  assertEqual(element.style.getPropertyValue("--ui-card-background"), "#f0fdf4");
  assertEqual(element.children.length, 0);
});

test("Text property adapter maps content, color, and align", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "text-1",
    type: "text",
    properties: {
      content: "Discover our latest arrivals.",
      color: "#333333",
      align: "left",
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-text");
  assertEqual(element.getAttribute("content"), "Discover our latest arrivals.");
  assertEqual(element.getAttribute("color"), "#333333");
  assertEqual(element.getAttribute("align"), "left");
});

test("Button property adapter maps label, variant, and disabled", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "button-1",
    type: "button",
    properties: { label: "Shop Now", variant: "primary", disabled: false },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-button");
  assertEqual(element.getAttribute("label"), "Shop Now");
  assertEqual(element.getAttribute("variant"), "primary");
  assertEqual(element.getAttribute("disabled"), null);
});

test("Boolean disabled true is rendered", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "button-1",
    type: "button",
    properties: { label: "Disabled", disabled: true },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.getAttribute("disabled"), "");
});

test("Boolean disabled false does not set disabled attribute", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "button-1",
    type: "button",
    properties: { label: "Enabled", disabled: false },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.getAttribute("disabled"), null);
});

test("Rendering does not mutate the original instance", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-12", { title: "Original" });
  const before = JSON.stringify(instance);
  renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(JSON.stringify(instance), before);
});

test("Cyclic object reference is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const child: Record<string, unknown> = {
    id: "child-1",
    type: "card",
    properties: { title: "Child" },
    children: [],
  };
  const parent = {
    id: "parent-1",
    type: "card",
    properties: { title: "Parent" },
    children: [child],
  };
  child.children = [parent];

  let threw = false;
  try {
    renderComponent(parent as unknown as ComponentInstance, {
      metadataRegistry,
      nativeRegistry,
    });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("cyclic reference"),
      `Expected cyclic reference error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected cyclic reference to throw.");
});

test("Excessive nesting is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();

  let deepest: Record<string, unknown> = {
    id: "leaf",
    type: "text",
    properties: { content: "Leaf" },
  };

  for (let index = 0; index < 70; index++) {
    deepest = {
      id: `card-${index}`,
      type: "card",
      properties: { title: `Level ${index}` },
      children: [deepest],
    };
  }

  let threw = false;
  try {
    renderComponent(deepest as unknown as ComponentInstance, {
      metadataRegistry,
      nativeRegistry,
    });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("maximum nesting depth"),
      `Expected depth exceeded error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected excessive nesting to throw.");
});

test("Multiple instances produce separate DOM elements", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const first = renderComponent(
    createCardInstance("card-13", { title: "First" }),
    { metadataRegistry, nativeRegistry }
  );
  const second = renderComponent(
    createCardInstance("card-14", { title: "Second" }),
    { metadataRegistry, nativeRegistry }
  );
  assertTrue(first !== second, "Expected separate element instances.");
  assertEqual(first.nodeName, "ui-card");
  assertEqual(second.nodeName, "ui-card");
});

test("A mapped custom element that is not defined is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const previousCustomElements = globalThis.customElements;
  globalThis.customElements = {
    get: (): undefined => undefined,
    define: (): void => {},
  } as unknown as CustomElementRegistry;
  try {
    const instance = createCardInstance("card-15");
    let threw = false;
    try {
      renderComponent(instance, { metadataRegistry, nativeRegistry });
    } catch (error) {
      threw = true;
      assertTrue(
        error instanceof Error && error.message.includes("custom element"),
        `Expected custom element not defined error, got: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    assertTrue(threw, "Expected undefined custom element to throw.");
  } finally {
    globalThis.customElements = previousCustomElements;
  }
});

test("No builder dependency is required to render a Card", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = createCardInstance("card-16");
  const element = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(element.nodeName, "ui-card");
});

// -- Dropdown tests --

test("Dropdown renders as ui-dropdown element", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "dropdown-1",
    type: "dropdown",
    properties: { label: "Choose", name: "choice" },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-dropdown");
  assertEqual(element.getAttribute("label"), "Choose");
  assertEqual(element.getAttribute("name"), "choice");
});

test("Dropdown staticOptions are parsed into options attribute", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "dropdown-2",
    type: "dropdown",
    properties: {
      label: "Pick one",
      staticOptions: "a|Alpha\nb|Beta\nc|Gamma",
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-dropdown");
  const optionsAttr = element.getAttribute("options");
  assertTrue(optionsAttr !== null, "Expected options attribute to be set.");
  const parsed = JSON.parse(optionsAttr!);
  assertEqual(parsed.length, 3);
  assertEqual(parsed[0].value, "a");
  assertEqual(parsed[0].label, "Alpha");
  assertEqual(parsed[1].value, "b");
  assertEqual(parsed[1].label, "Beta");
  assertEqual(parsed[2].value, "c");
  assertEqual(parsed[2].label, "Gamma");
});

test("Dropdown required and disabled boolean attributes work", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "dropdown-3",
    type: "dropdown",
    properties: {
      label: "Required",
      required: true,
      disabled: true,
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.getAttribute("required"), "");
  assertEqual(element.getAttribute("disabled"), "");
});

test("Dropdown required false removes required attribute", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "dropdown-4",
    type: "dropdown",
    properties: {
      label: "Optional",
      required: false,
      disabled: false,
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.getAttribute("required"), null);
  assertEqual(element.getAttribute("disabled"), null);
});

test("Dropdown with children is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "dropdown-parent",
    type: "dropdown",
    properties: { label: "Parent" },
    children: [
      {
        id: "text-child",
        type: "text",
        properties: { content: "Child" },
      },
    ],
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("does not allow children"),
      `Expected disallow-children error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected Dropdown with children to throw.");
});

test("Calling registerDropdown twice does not throw", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerDropdown(metadataRegistry, nativeRegistry);
  let threw = false;
  try {
    registerDropdown(metadataRegistry, nativeRegistry);
  } catch {
    threw = true;
  }
  assertTrue(!threw, "Expected second registerDropdown call to not throw.");
});

test("Calling registerInput twice does not throw", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerInput(metadataRegistry, nativeRegistry);
  let threw = false;
  try {
    registerInput(metadataRegistry, nativeRegistry);
  } catch {
    threw = true;
  }
  assertTrue(!threw, "Expected second registerInput call to not throw.");
});

// -- Input tests --

test("Input renders as ui-input element with mapped properties", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "input-1",
    type: "input",
    properties: {
      label: "Search",
      placeholder: "Type to search",
      name: "search",
      inputType: "search",
      required: true,
      disabled: false,
      readonly: true,
      maxLength: 40,
      defaultValue: "shoes",
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-input");
  assertEqual(element.getAttribute("label"), "Search");
  assertEqual(element.getAttribute("placeholder"), "Type to search");
  assertEqual(element.getAttribute("name"), "search");
  assertEqual(element.getAttribute("input-type"), "search");
  assertEqual(element.getAttribute("required"), "");
  assertEqual(element.getAttribute("disabled"), null);
  assertEqual(element.getAttribute("readonly"), "");
  assertEqual(element.getAttribute("max-length"), "40");
  assertEqual(element.getAttribute("default-value"), "shoes");
});

test("Input boolean properties default to no attributes", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "input-2",
    type: "input",
    properties: { label: "Email", required: false, disabled: false, readonly: false },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-input");
  assertEqual(element.getAttribute("required"), null);
  assertEqual(element.getAttribute("disabled"), null);
  assertEqual(element.getAttribute("readonly"), null);
});

test("Input maxLength is rendered only for positive integers", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const zero = renderComponent(
    {
      id: "input-max-zero",
      type: "input",
      properties: { maxLength: 0 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(zero.getAttribute("max-length"), null);

  const negative = renderComponent(
    {
      id: "input-max-negative",
      type: "input",
      properties: { maxLength: -5 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(negative.getAttribute("max-length"), null);

  const fractional = renderComponent(
    {
      id: "input-max-fractional",
      type: "input",
      properties: { maxLength: 2.5 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(fractional.getAttribute("max-length"), null);

  const positive = renderComponent(
    {
      id: "input-max-positive",
      type: "input",
      properties: { maxLength: 25 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(positive.getAttribute("max-length"), "25");
});

test("Input with children is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "input-parent",
    type: "input",
    properties: { label: "Parent" },
    children: [
      {
        id: "text-child",
        type: "text",
        properties: { content: "Child" },
      },
    ],
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("does not allow children"),
      `Expected disallow-children error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected Input with children to throw.");
});

// -- Table tests --

test("Table renders as ui-table element with mapped properties", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "table-1",
    type: "table",
    properties: {
      columns: "name|Full Name\nprice|Price (€)\nstatus",
      pageSize: 25,
      sort: "name",
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-table");
  const columnsAttr = element.getAttribute("columns");
  assertTrue(columnsAttr !== null, "Expected columns attribute to be set.");
  const parsed = JSON.parse(columnsAttr!);
  assertEqual(parsed.length, 3);
  assertEqual(parsed[0].field, "name");
  assertEqual(parsed[0].label, "Full Name");
  assertEqual(parsed[1].field, "price");
  assertEqual(parsed[1].label, "Price (€)");
  assertEqual(parsed[2].field, "status");
  assertEqual(parsed[2].label, "status");
  assertEqual(element.getAttribute("page-size"), "25");
  assertEqual(element.getAttribute("sort"), "name");
});

test("Table columns are rendered as a JSON attribute", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "table-2",
    type: "table",
    properties: {
      columns: "id|ID\ncode\n\nsku|SKU | reference",
      sort: "-code",
    },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.nodeName, "ui-table");
  assertEqual(
    element.getAttribute("columns"),
    JSON.stringify([
      { field: "id", label: "ID" },
      { field: "code", label: "code" },
      { field: "sku", label: "SKU | reference" },
    ])
  );
  assertEqual(element.getAttribute("sort"), "-code");
  assertEqual(element.getAttribute("page-size"), null);
});

test("Table empty columns render as an empty JSON array", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "table-3",
    type: "table",
    properties: { columns: "" },
  };
  const element = renderComponent(instance, { metadataRegistry, nativeRegistry });
  assertEqual(element.getAttribute("columns"), "[]");
});

test("Table pageSize is rendered only for positive integers", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();

  const zero = renderComponent(
    {
      id: "table-max-zero",
      type: "table",
      properties: { pageSize: 0 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(zero.getAttribute("page-size"), null);

  const negative = renderComponent(
    {
      id: "table-max-negative",
      type: "table",
      properties: { pageSize: -5 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(negative.getAttribute("page-size"), null);

  const fractional = renderComponent(
    {
      id: "table-max-fractional",
      type: "table",
      properties: { pageSize: 2.5 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(fractional.getAttribute("page-size"), null);

  const positive = renderComponent(
    {
      id: "table-max-positive",
      type: "table",
      properties: { pageSize: 25 },
    },
    { metadataRegistry, nativeRegistry }
  );
  assertEqual(positive.getAttribute("page-size"), "25");
});

test("Table with children is rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const instance = {
    id: "table-parent",
    type: "table",
    properties: { columns: "name|Name" },
    children: [
      {
        id: "text-child",
        type: "text",
        properties: { content: "Child" },
      },
    ],
  };
  let threw = false;
  try {
    renderComponent(instance, { metadataRegistry, nativeRegistry });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("does not allow children"),
      `Expected disallow-children error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected Table with children to throw.");
});

test("Calling registerTable twice does not throw", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerTable(metadataRegistry, nativeRegistry);
  let threw = false;
  try {
    registerTable(metadataRegistry, nativeRegistry);
  } catch {
    threw = true;
  }
  assertTrue(!threw, "Expected second registerTable call to not throw.");
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
