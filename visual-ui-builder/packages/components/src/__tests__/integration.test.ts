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

interface TestInstance {
  readonly type: string;
  readonly id: string;
  readonly properties: Record<string, string | number | boolean>;
  readonly children?: readonly TestInstance[];
}

function createCardInstance(id = "card-1"): TestInstance {
  return createInstance("card", id, { title: "Hello" }, []);
}

function createInstance(
  type: string,
  id: string,
  properties: Record<string, string | number | boolean>,
  children: readonly TestInstance[] = []
): TestInstance {
  return {
    type,
    id,
    properties,
    children,
  };
}

/**
 * Provides the minimal globals required to load ui-card.ts in a Node process.
 * No actual DOM is created; the custom element is only registered, never
 * instantiated.
 */
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

const {
  ComponentRegistry,
  cardDefinition,
  buttonDefinition,
} = await import("@visual-ui/core");

const {
  getNativeComponentRegistry,
  NativeComponentRegistry,
  registerButton,
  registerCard,
  registerNativeComponents,
  registerText,
} = await import("../registry/index.js");

const { UIText, registerUIText } = await import("../text/ui-text.js");

const { UIButton, registerUIButton } = await import("../button/ui-button.js");

const { validateComponentInstance } = await import(
  "../validation/validate-instance.js"
);

test("registers Card metadata", () => {
  const metadataRegistry = new ComponentRegistry();
  registerCard(metadataRegistry);
  assertEqual(metadataRegistry.lookup("card")?.type, "card");
});

test("registers native card tag mapping", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  assertEqual(nativeRegistry.lookupTag("card"), "ui-card");
});

test("duplicate initialization is safe", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  registerCard(metadataRegistry, nativeRegistry);
  assertEqual(metadataRegistry.list().length, 1);
  assertEqual(nativeRegistry.list().length, 1);
});

test("native tag lookup returns undefined for unknown type", () => {
  const nativeRegistry = new NativeComponentRegistry();
  assertEqual(nativeRegistry.lookupTag("unknown"), undefined);
});

test("rejects conflicting native mappings", () => {
  const nativeRegistry = new NativeComponentRegistry();
  nativeRegistry.register("card", "ui-card");
  let threw = false;
  try {
    nativeRegistry.register("card", "other-card");
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected conflicting mapping to throw.");
});

test("idempotent registration of same mapping", () => {
  const nativeRegistry = new NativeComponentRegistry();
  nativeRegistry.register("card", "ui-card");
  nativeRegistry.register("card", "ui-card");
  assertEqual(nativeRegistry.list().length, 1);
});

test("validates a correct card instance", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(cardDefinition);
  const instance = createCardInstance();
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertEqual(errors.length, 0, "Expected no validation errors.");
});

test("card metadata includes description property", () => {
  const descriptionProperty = cardDefinition.properties.find(
    (property) => property.name === "description"
  );
  assertTrue(descriptionProperty !== undefined, "Expected description property.");
  assertEqual(descriptionProperty!.type, "string");
  assertEqual(descriptionProperty!.defaultValue, "");
});

test("validates a card instance without description", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(cardDefinition);
  const instance = createInstance("card", "card-1", {
    title: "Hello",
    padding: 16,
    backgroundColor: "#ffffff",
  });
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertEqual(errors.length, 0, "Expected no validation errors for card without description.");
});

test("rejects unknown component type", () => {
  const metadataRegistry = new ComponentRegistry();
  const instance = createInstance("unknown", "unknown-1", {});
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertEqual(errors.length, 1);
  assertTrue(errors[0].message.includes("Unknown component type"));
});

test("rejects unsupported property", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(cardDefinition);
  const instance = createInstance("card", "card-1", { unknownProp: "x" });
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertTrue(errors.some((error) => error.message.includes("not supported")));
});

test("rejects invalid property type", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(cardDefinition);
  const instance = createInstance("card", "card-1", { padding: "not-a-number" });
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertTrue(
    errors.some((error) => error.message.includes('must be of type "number"'))
  );
});

test("rejects invalid select value", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(buttonDefinition);
  const instance = createInstance("button", "button-1", { variant: "invalid" });
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertTrue(
    errors.some((error) => error.message.includes("not one of the allowed"))
  );
});

test("validates required properties", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register({
    ...cardDefinition,
    properties: [
      ...cardDefinition.properties,
      {
        name: "subtitle",
        type: "string",
        label: "Subtitle",
        required: true,
      },
    ],
  });
  const instance = createInstance("card", "card-1", { title: "Hello" });
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertTrue(
    errors.some((error) => error.message.includes("is required")),
    `Expected required-property error, got: ${errors.map((e) => e.message).join(", ")}`
  );
});

test("rejects children when not allowed", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(buttonDefinition);
  const instance = createInstance("button", "button-1", {}, [
    createCardInstance("nested-card"),
  ]);
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertTrue(
    errors.some((error) => error.message.includes("does not allow children"))
  );
});

test("validates nested children recursively", () => {
  const metadataRegistry = new ComponentRegistry();
  metadataRegistry.register(cardDefinition);
  metadataRegistry.register(buttonDefinition);
  const instance = createInstance("card", "card-1", { title: "Hello" }, [
    createInstance("button", "button-1", { variant: "invalid" }),
  ]);
  const errors = validateComponentInstance(instance, metadataRegistry);
  assertTrue(
    errors.some((error) => error.path.startsWith("card-1.children[0]")),
    `Expected nested path error, got paths: ${errors.map((e) => e.path).join(", ")}`
  );
  assertTrue(
    errors.some((error) => error.message.includes("not one of the allowed"))
  );
});

test("registerNativeComponents registers Card, Text, and Button", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerNativeComponents(metadataRegistry, nativeRegistry);
  assertEqual(metadataRegistry.lookup("card")?.type, "card");
  assertEqual(nativeRegistry.lookupTag("card"), "ui-card");
  assertEqual(metadataRegistry.lookup("text")?.type, "text");
  assertEqual(nativeRegistry.lookupTag("text"), "ui-text");
  assertEqual(metadataRegistry.lookup("button")?.type, "button");
  assertEqual(nativeRegistry.lookupTag("button"), "ui-button");
});

test("shared registry is used by default", () => {
  const metadataRegistry = new ComponentRegistry();
  registerCard(metadataRegistry);
  assertEqual(getNativeComponentRegistry().lookupTag("card"), "ui-card");
});

test("registers Text metadata", () => {
  const metadataRegistry = new ComponentRegistry();
  registerText(metadataRegistry);
  assertEqual(metadataRegistry.lookup("text")?.type, "text");
});

test("registers native text tag mapping", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerText(metadataRegistry, nativeRegistry);
  assertEqual(nativeRegistry.lookupTag("text"), "ui-text");
});

test("Text registration is idempotent", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerText(metadataRegistry, nativeRegistry);
  registerText(metadataRegistry, nativeRegistry);
  assertEqual(metadataRegistry.list().length, 1);
  assertEqual(nativeRegistry.list().length, 1);
});

test("registerUIText is defined", () => {
  assertTrue(typeof registerUIText === "function");
});

test("UIText class is defined", () => {
  assertTrue(typeof UIText === "function");
});

test("registers Button metadata", () => {
  const metadataRegistry = new ComponentRegistry();
  registerButton(metadataRegistry);
  assertEqual(metadataRegistry.lookup("button")?.type, "button");
});

test("registers native button tag mapping", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerButton(metadataRegistry, nativeRegistry);
  assertEqual(nativeRegistry.lookupTag("button"), "ui-button");
});

test("Button registration is idempotent", () => {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerButton(metadataRegistry, nativeRegistry);
  registerButton(metadataRegistry, nativeRegistry);
  assertEqual(metadataRegistry.list().length, 1);
  assertEqual(nativeRegistry.list().length, 1);
});

test("registerUIButton is defined", () => {
  assertTrue(typeof registerUIButton === "function");
});

test("UIButton class is defined", () => {
  assertTrue(typeof UIButton === "function");
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

