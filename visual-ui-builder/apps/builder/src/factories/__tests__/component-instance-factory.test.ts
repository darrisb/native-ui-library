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

function assertInstanceIdFormat(id: string): void {
  assertTrue(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id
    ) || /^inst-\d+-[0-9a-z]{6}$/i.test(id),
    `Unexpected instance id format: ${id}`
  );
}

function installMinimalDomShim(): void {
  const globals = globalThis as Record<string, unknown>;

  if (!globals.HTMLElement) {
    globals.HTMLElement = class HTMLElement {};
  }

  if (!globals.customElements) {
    globals.customElements = {
      get: (): undefined => undefined,
      define: (): void => {},
    };
  }
}

installMinimalDomShim();

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);

// Importing a value from the components package loads its modules, which
// require HTMLElement to be available.
await import("@visual-ui/components");

const { createComponentInstance } = await import(
  "../component-instance-factory.ts"
);

test("Creates a valid Card instance with default properties", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const instance = createComponentInstance("card", registry);
  assertEqual(instance.type, "card");
  assertEqual(instance.properties.title, "");
  assertEqual(instance.properties.description, "");
  assertEqual(instance.properties.padding, 16);
  assertEqual(instance.properties.backgroundColor, "#ffffff");
  assertInstanceIdFormat(instance.id);
});

test("Creates a valid Text instance with default properties", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const instance = createComponentInstance("text", registry);
  assertEqual(instance.type, "text");
  assertEqual(instance.properties.content, "");
  assertEqual(instance.properties.color, "#000000");
  assertEqual(instance.properties.align, "left");
  assertInstanceIdFormat(instance.id);
});

test("Creates a valid Button instance with default properties", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const instance = createComponentInstance("button", registry);
  assertEqual(instance.type, "button");
  assertEqual(instance.properties.label, "Button");
  assertEqual(instance.properties.variant, "primary");
  assertEqual(instance.properties.disabled, false);
  assertInstanceIdFormat(instance.id);
});

test("Instance IDs are unique", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const first = createComponentInstance("card", registry);
  const second = createComponentInstance("card", registry);
  assertTrue(first.id !== second.id, "Instance IDs should be unique.");
});

test("Rejects unregistered component types", () => {
  const registry = new ComponentRegistry();
  let threw = false;
  try {
    createComponentInstance("unknown", registry);
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected unregistered type to throw.");
});

test("Rejects invalid property defaults from tampered metadata", () => {
  const registry = new ComponentRegistry();
  registry.register({
    type: "card",
    name: "Card",
    category: "content",
    description: "Container for related content.",
    allowChildren: true,
    properties: [
      {
        name: "padding",
        type: "number",
        label: "Padding",
        defaultValue: "not-a-number" as unknown as number,
      },
    ],
  });

  let threw = false;
  try {
    createComponentInstance("card", registry);
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected invalid default value to throw.");
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
