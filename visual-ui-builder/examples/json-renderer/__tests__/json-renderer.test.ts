import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
      const defined = new Set(["ui-card", "ui-text", "ui-button", "ui-dropdown"]);
      return defined.has(name) ? {} : undefined;
    },
    define: (): void => {},
  };
}

installMockDom();

const { ComponentRegistry } = await import("@visual-ui/core");
const {
  NativeComponentRegistry,
  registerCard,
  registerText,
  registerButton,
  registerDropdown,
} = await import("@visual-ui/components");
const { validateDocumentShape, renderDocument } = await import("../renderer.js");

function createRegistries() {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  registerText(metadataRegistry, nativeRegistry);
  registerButton(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

function createRegistriesWithDropdown() {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  registerText(metadataRegistry, nativeRegistry);
  registerButton(metadataRegistry, nativeRegistry);
  registerDropdown(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

test("Valid JSON document shape is accepted", () => {
  const document = [
    {
      id: "card-1",
      type: "card",
      properties: { title: "Hello" },
      children: [],
    },
  ];
  const result = validateDocumentShape(document);
  assertEqual(result.length, 1);
  assertEqual(result[0].id, "card-1");
});

test("Non-array document is rejected", () => {
  let threw = false;
  try {
    validateDocumentShape({ not: "array" });
  } catch (error) {
    threw = true;
    assertTrue(
      error instanceof Error && error.message.includes("array"),
      `Expected array error, got: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertTrue(threw, "Expected non-array document to throw.");
});

test("Invalid root entry is rejected", () => {
  let threw = false;
  try {
    validateDocumentShape([null]);
  } catch (error) {
    threw = true;
  }
  assertTrue(threw, "Expected invalid root entry to throw.");
});

test("Multiple Cards render in the correct order", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    { id: "card-1", type: "card", properties: { title: "First" } },
    { id: "card-2", type: "card", properties: { title: "Second" } },
    { id: "card-3", type: "card", properties: { title: "Third" } },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 3);
  assertEqual(result.elements[0].getAttribute("title"), "First");
  assertEqual(result.elements[1].getAttribute("title"), "Second");
  assertEqual(result.elements[2].getAttribute("title"), "Third");
});

test("Each Card has its own properties", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-a",
      type: "card",
      properties: {
        title: "A",
        padding: 24,
        backgroundColor: "#ffffff",
      },
    },
    {
      id: "card-b",
      type: "card",
      properties: {
        title: "B",
        padding: 16,
        backgroundColor: "#f0f4ff",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(
    result.elements[0].style.getPropertyValue("--ui-card-padding"),
    "24px"
  );
  assertEqual(
    result.elements[0].style.getPropertyValue("--ui-card-background"),
    "#ffffff"
  );
  assertEqual(
    result.elements[1].style.getPropertyValue("--ui-card-padding"),
    "16px"
  );
  assertEqual(
    result.elements[1].style.getPropertyValue("--ui-card-background"),
    "#f0f4ff"
  );
});

test("Invalid Card properties are rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    { id: "card-valid", type: "card", properties: { title: "Valid" } },
    {
      id: "card-invalid",
      type: "card",
      properties: { padding: "not-a-number" as unknown as number },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.elements.length, 0);
  assertEqual(result.errors.length, 1);
  assertEqual(result.errors[0].id, "card-invalid");
  assertEqual(result.errors[0].type, "card");
});

test("Unknown component types are rejected", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    { id: "unknown-1", type: "unknown", properties: {} },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.elements.length, 0);
  assertEqual(result.errors.length, 1);
  assertEqual(result.errors[0].id, "unknown-1");
  assertEqual(result.errors[0].type, "unknown");
});

test("No partial document is appended after rendering failure", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    { id: "card-ok", type: "card", properties: { title: "OK" } },
    {
      id: "card-bad",
      type: "card",
      properties: { unknownProp: "x" as unknown as string },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.elements.length, 0);
  assertTrue(result.errors.length > 0);
});

test("Renderer does not mutate the input JSON", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    { id: "card-1", type: "card", properties: { title: "Hello" } },
  ];
  const before = JSON.stringify(document);
  renderDocument(document, { metadataRegistry, nativeRegistry });
  assertEqual(JSON.stringify(document), before);
});

test("The standalone integration does not import builder modules", () => {
  const exampleDir = dirname(fileURLToPath(import.meta.url));
  const rendererSource = readFileSync(
    join(exampleDir, "../renderer.js"),
    "utf-8"
  );
  const mainSource = readFileSync(join(exampleDir, "../main.js"), "utf-8");
  assertTrue(
    !rendererSource.includes("@visual-ui/builder"),
    "renderer.ts must not import builder modules."
  );
  assertTrue(
    !mainSource.includes("@visual-ui/builder"),
    "main.ts must not import builder modules."
  );
});

test("Card renders the description attribute from JSON", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-described",
      type: "card",
      properties: {
        title: "Described",
        description: "This Card has a description.",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  assertEqual(
    result.elements[0].getAttribute("description"),
    "This Card has a description."
  );
});

test("Each Card retains its own independent description", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-first",
      type: "card",
      properties: {
        title: "First",
        description: "First description.",
      },
    },
    {
      id: "card-second",
      type: "card",
      properties: {
        title: "Second",
        description: "Second description.",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 2);
  assertEqual(result.elements[0].getAttribute("description"), "First description.");
  assertEqual(result.elements[1].getAttribute("description"), "Second description.");
});

test("Card without description renders successfully", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-plain",
      type: "card",
      properties: { title: "Plain" },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  assertEqual(result.elements[0].getAttribute("description"), null);
  assertEqual(result.elements[0].getAttribute("title"), "Plain");
});

test("Empty description is accepted", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-empty",
      type: "card",
      properties: {
        title: "Empty",
        description: "",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  assertEqual(result.elements[0].getAttribute("description"), "");
});

test("Card without description keeps existing properties unchanged", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-contact",
      type: "card",
      properties: {
        title: "Contact Us",
        padding: 20,
        backgroundColor: "#f0fdf4",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements[0].getAttribute("title"), "Contact Us");
  assertEqual(
    result.elements[0].style.getPropertyValue("--ui-card-padding"),
    "20px"
  );
  assertEqual(
    result.elements[0].style.getPropertyValue("--ui-card-background"),
    "#f0fdf4"
  );
  assertEqual(result.elements[0].getAttribute("description"), null);
});

test("Standalone example uses renderComponent from shared renderer", () => {
  const exampleDir = dirname(fileURLToPath(import.meta.url));
  const rendererSource = readFileSync(
    join(exampleDir, "../renderer.js"),
    "utf-8"
  );
  assertTrue(
    rendererSource.includes('import { renderComponent } from "@visual-ui/renderer"'),
    "renderer.ts must import renderComponent from @visual-ui/renderer."
  );
  assertTrue(
    rendererSource.includes("renderComponent(instance, options)"),
    "renderer.ts must call renderComponent for each instance."
  );
});

test("Standalone example attaches a click listener to the nested Button", () => {
  const exampleDir = dirname(fileURLToPath(import.meta.url));
  const mainSource = readFileSync(join(exampleDir, "../main.js"), "utf-8");
  assertTrue(
    mainSource.includes('querySelector("ui-button")'),
    "main.ts must query for the nested ui-button."
  );
  assertTrue(
    mainSource.includes('addEventListener("click"'),
    "main.ts must attach a click listener to the nested Button."
  );
});

test("Card with Text and Button children renders recursively", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-parent",
      type: "card",
      properties: { title: "Parent" },
      children: [
        {
          id: "text-1",
          type: "text",
          properties: {
            content: "Hello",
            color: "#333333",
            align: "left",
          },
        },
        {
          id: "button-1",
          type: "button",
          properties: {
            label: "Click",
            variant: "primary",
            disabled: false,
          },
        },
      ],
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  const card = result.elements[0];
  assertEqual(card.nodeName, "ui-card");
  assertEqual(card.children.length, 2);
  assertEqual(card.children[0].nodeName, "ui-text");
  assertEqual(card.children[0].getAttribute("content"), "Hello");
  assertEqual(card.children[1].nodeName, "ui-button");
  assertEqual(card.children[1].getAttribute("label"), "Click");
  assertEqual(card.children[1].getAttribute("disabled"), null);
});

test("Nested Card with Text child renders", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-outer",
      type: "card",
      properties: { title: "Outer" },
      children: [
        {
          id: "card-inner",
          type: "card",
          properties: { title: "Inner" },
          children: [
            {
              id: "text-inner",
              type: "text",
              properties: { content: "Inner text" },
            },
          ],
        },
      ],
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  const outer = result.elements[0];
  assertEqual(outer.nodeName, "ui-card");
  assertEqual(outer.children.length, 1);
  assertEqual(outer.children[0].nodeName, "ui-card");
  assertEqual(outer.children[0].children.length, 1);
  assertEqual(outer.children[0].children[0].nodeName, "ui-text");
  assertEqual(outer.children[0].children[0].getAttribute("content"), "Inner text");
});

test("Backward-compatible root Card without children renders", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-legacy",
      type: "card",
      properties: {
        title: "Legacy",
        padding: 20,
        backgroundColor: "#f0fdf4",
      },
      children: [],
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  assertEqual(result.elements[0].nodeName, "ui-card");
  assertEqual(result.elements[0].children.length, 0);
});

test("No partial document is rendered when a nested child is invalid", () => {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  const document = [
    {
      id: "card-parent",
      type: "card",
      properties: { title: "Parent" },
      children: [
        {
          id: "text-invalid",
          type: "text",
          properties: { unknownProp: "x" as unknown as string },
        },
      ],
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.elements.length, 0);
  assertEqual(result.errors.length, 1);
  assertEqual(result.errors[0].id, "card-parent");
});

test("Dropdown with staticOptions renders with parsed options", () => {
  const { metadataRegistry, nativeRegistry } = createRegistriesWithDropdown();
  const document = [
    {
      id: "dropdown-static",
      type: "dropdown",
      properties: {
        label: "Category",
        placeholder: "Choose",
        name: "category",
        staticOptions:
          '[{"value":"a","label":"Alpha"},{"value":"b","label":"Beta"}]',
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  const dropdown = result.elements[0];
  assertEqual(dropdown.nodeName, "ui-dropdown");
  assertEqual(dropdown.getAttribute("label"), "Category");
  assertEqual(dropdown.getAttribute("placeholder"), "Choose");
  assertEqual(dropdown.getAttribute("name"), "category");

  const optionsRaw = dropdown.getAttribute("options");
  assertTrue(optionsRaw !== null, "options attribute should be set");
  const options = JSON.parse(optionsRaw);
  assertEqual(options.length, 2);
  assertEqual(options[0].value, "a");
  assertEqual(options[0].label, "Alpha");
  assertEqual(options[1].value, "b");
  assertEqual(options[1].label, "Beta");
});

test("Dropdown with dataSource properties renders data attributes", () => {
  const { metadataRegistry, nativeRegistry } = createRegistriesWithDropdown();
  const document = [
    {
      id: "dropdown-rest",
      type: "dropdown",
      properties: {
        label: "Customer",
        placeholder: "Select customer…",
        name: "customer",
        dataSourceUrl: "/api/data/customers?fields=id,name",
        dataSourceResponsePath: "items",
        dataSourceLabelField: "name",
        dataSourceValueField: "id",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  const dropdown = result.elements[0];
  assertEqual(dropdown.nodeName, "ui-dropdown");
  assertEqual(dropdown.getAttribute("label"), "Customer");
  assertEqual(
    dropdown.getAttribute("data-source-url"),
    "/api/data/customers?fields=id,name"
  );
  assertEqual(
    dropdown.getAttribute("data-source-response-path"),
    "items"
  );
  assertEqual(
    dropdown.getAttribute("data-source-label-field"),
    "name"
  );
  assertEqual(
    dropdown.getAttribute("data-source-value-field"),
    "id"
  );
});

test("Dropdown with dataSource does not set static options", () => {
  const { metadataRegistry, nativeRegistry } = createRegistriesWithDropdown();
  const document = [
    {
      id: "dropdown-ds-only",
      type: "dropdown",
      properties: {
        label: "Dynamic",
        dataSourceUrl: "/api/data/items",
        dataSourceResponsePath: "data",
        dataSourceLabelField: "name",
        dataSourceValueField: "id",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  const dropdown = result.elements[0];
  assertEqual(dropdown.getAttribute("options"), null);
  assertEqual(dropdown.getAttribute("data-source-url"), "/api/data/items");
});

test("Dropdown without staticOptions or dataSource renders without options", () => {
  const { metadataRegistry, nativeRegistry } = createRegistriesWithDropdown();
  const document = [
    {
      id: "dropdown-empty",
      type: "dropdown",
      properties: {
        label: "Empty",
        name: "empty",
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  assertEqual(result.elements.length, 1);
  const dropdown = result.elements[0];
  assertEqual(dropdown.getAttribute("label"), "Empty");
  assertEqual(dropdown.getAttribute("options"), null);
  assertEqual(dropdown.getAttribute("data-source-url"), null);
});

test("Dropdown required and disabled properties are applied", () => {
  const { metadataRegistry, nativeRegistry } = createRegistriesWithDropdown();
  const document = [
    {
      id: "dropdown-constrained",
      type: "dropdown",
      properties: {
        label: "Required",
        name: "req",
        required: true,
        disabled: true,
      },
    },
  ];
  const result = renderDocument(document, {
    metadataRegistry,
    nativeRegistry,
  });
  assertEqual(result.errors.length, 0);
  const dropdown = result.elements[0];
  assertEqual(dropdown.getAttribute("required"), "");
  assertEqual(dropdown.getAttribute("disabled"), "");
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
