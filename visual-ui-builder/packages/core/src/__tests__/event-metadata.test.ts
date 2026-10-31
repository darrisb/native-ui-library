/**
 * Focused tests for component event capability metadata.
 *
 * Verifies that the registry metadata correctly declares which events each
 * component supports, and that the editor can consume this data generically
 * without per-type branching.
 */

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

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`
    );
  }
}

const {
  buttonDefinition,
  cardDefinition,
  textDefinition,
  sampleDefinitions,
} = await import("../definitions/sample-definitions.js");

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "../index.js"
);

test("Button declares click as a supported event", () => {
  const events = buttonDefinition.events ?? [];
  const click = events.find((e) => e.event === "click");
  assertTrue(click !== undefined, "Expected Button to declare click event.");
});

test("Button click does not require an action to be configured", () => {
  const click = (buttonDefinition.events ?? []).find(
    (e) => e.event === "click"
  );
  assertEqual(
    click?.requiresAction ?? false,
    false,
    "Expected Button click to not require an action."
  );
});

test("Card declares click as a supported event", () => {
  const events = cardDefinition.events ?? [];
  const click = events.find((e) => e.event === "click");
  assertTrue(click !== undefined, "Expected Card to declare click event.");
});

test("Card click requires an action to be configured", () => {
  const click = (cardDefinition.events ?? []).find(
    (e) => e.event === "click"
  );
  assertEqual(
    click?.requiresAction,
    true,
    "Expected Card click to require an action."
  );
});

test("Text declares no events", () => {
  const events = textDefinition.events ?? [];
  assertEqual(events.length, 0, "Expected Text to declare no events.");
});

test("all sample definitions expose a consistent events shape", () => {
  for (const definition of sampleDefinitions) {
    if (definition.events) {
      for (const event of definition.events) {
        assertTrue(
          typeof event.event === "string" && event.event.length > 0,
          `Expected event name on ${definition.type} to be a non-empty string.`
        );
        assertTrue(
          typeof event.label === "string" && event.label.length > 0,
          `Expected event label on ${definition.type} to be a non-empty string.`
        );
      }
    }
  }
});

test("event metadata survives registry registration and lookup", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);

  const button = registry.lookup("button");
  assertTrue(button !== undefined, "Expected button definition in registry.");
  assertDeepEqual(
    button!.events,
    [{ event: "click", label: "Click" }]
  );

  const card = registry.lookup("card");
  assertTrue(card !== undefined, "Expected card definition in registry.");
  assertDeepEqual(card!.events, [
    { event: "click", label: "Click", requiresAction: true },
  ]);

  const text = registry.lookup("text");
  assertTrue(text !== undefined, "Expected text definition in registry.");
  assertEqual((text!.events ?? []).length, 0);
});

test("editor can consume events generically via registry lookup", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);

  // Simulate the editor iterating over registered definitions and reading
  // event metadata without per-type branching.
  const allEvents = registry
    .list()
    .flatMap((d) => d.events ?? [])
    .map((e) => e.event);

  assertTrue(allEvents.includes("click"), "Expected click in event list.");
  assertEqual(
    allEvents.filter((e) => e === "click").length,
    2,
    "Expected exactly two click declarations (button + card)."
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
