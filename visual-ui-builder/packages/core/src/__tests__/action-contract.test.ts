/**
 * Focused tests for the declarative action contracts and their validator.
 *
 * Covers: valid actions, omitted actions, malformed records, unknown action
 * types, unsafe URL schemes, malformed targets, `{value}` token placement,
 * the submit event, and JSON round-trip serialization.
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

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`
    );
  }
}

function assertIncludes(actual: string, expected: string, message?: string): void {
  if (!actual.includes(expected)) {
    throw new Error(
      message ?? `Expected "${actual}" to include "${expected}".`
    );
  }
}

import type {
  ComponentAction,
  NavigateAction,
} from "../types/action.js";
import type { ComponentInstance } from "../types/component-instance.js";
import { inputDefinition } from "../definitions/sample-definitions.js";

const { validateActions } = await import("../validation/validate-action.js");

// A reusable valid navigate action used across tests.
function navigateAction(
  overrides: Partial<NavigateAction> = {}
): ComponentAction {
  return {
    id: "action-1",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com", target: "_self" },
    ...overrides,
  } as ComponentAction;
}

test("a valid navigate action produces no errors", () => {
  const errors = validateActions([navigateAction()], "root", []);
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a valid navigate action with a relative URL is accepted", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "/about" } })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a valid navigate action without target is accepted", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "https://example.com" } })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a valid https URL is accepted", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "https://example.com/path?q=1" } })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a valid mailto URL is accepted", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "mailto:hello@example.com" } })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("omitted actions produce no errors (legacy JSON stays valid)", () => {
  const errors = validateActions(undefined, "root", []);
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("an empty actions array produces no errors", () => {
  const errors = validateActions([], "root", []);
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("an unknown action type is rejected", () => {
  const errors = validateActions(
    [{ id: "a", event: "click", type: "runScript", config: {} } as unknown as ComponentAction],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "Unknown action type");
  assertIncludes(errors[0]!.path, "root.actions[0].type");
});

test("a missing action id is rejected", () => {
  const errors = validateActions(
    [{ event: "click", type: "navigate", config: { url: "https://example.com" } } as unknown as ComponentAction],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"id"');
  assertIncludes(errors[0]!.path, "root.actions[0].id");
});

test("an empty action id is rejected", () => {
  const errors = validateActions(
    [navigateAction({ id: "" })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"id"');
});

test("an unsupported event is rejected", () => {
  const errors = validateActions(
    [navigateAction({ event: "keypress" as never })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"event"');
  assertIncludes(errors[0]!.path, "root.actions[0].event");
});

test("the submit event is accepted", () => {
  const errors = validateActions(
    [navigateAction({ event: "submit" })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a malformed navigate target is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "https://example.com", target: "_top" as never } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"target"');
  assertIncludes(errors[0]!.path, "root.actions[0].config.target");
});

test("an empty URL is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"url"');
  assertIncludes(errors[0]!.path, "root.actions[0].config.url");
});

test("a javascript: URL scheme is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "javascript:alert(1)" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("a data: URL scheme is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "data:text/html,<h1>hi</h1>" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("an obfuscated javascript: scheme (leading whitespace) is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "  javascript:alert(1)" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("an obfuscated javascript: scheme (control char) is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "\tjavascript:alert(1)" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("an uppercase JAVASCRIPT: scheme is rejected (case-insensitive)", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "JAVASCRIPT:alert(1)" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

// ---------------------------------------------------------------------------
// {value} token placement
// ---------------------------------------------------------------------------

test("a {value} token in the query string is accepted", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "/search?q={value}" } })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a {value} token in an absolute URL query string is accepted", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "https://example.com/search?q={value}" } })],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a {value} token in the path is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "/search/{value}" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "{value}");
  assertIncludes(errors[0]!.path, "root.actions[0].config.url");
});

test("a {value} token without a query string is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "{value}" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "{value}");
});

test("a {value} token in the scheme is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "java{value}script:alert(1)" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "{value}");
  assertIncludes(errors[0]!.path, "root.actions[0].config.url");
});

test("a {value} token before the query string is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "{value}/search?q=1" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "{value}");
});

test("more than one {value} token is rejected", () => {
  const errors = validateActions(
    [navigateAction({ config: { url: "/search?q={value}&r={value}" } })],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "at most one");
});

test("the input definition declares focus and submit events", () => {
  assertDeepEqual(inputDefinition.events, [
    { event: "focus", label: "Focus" },
    { event: "submit", label: "Submit" },
  ]);
});

test("actions survive JSON round-trip serialization", () => {
  const instance: ComponentInstance = {
    id: "input-1",
    type: "input",
    properties: { label: "Search" },
    actions: [
      navigateAction({
        event: "submit",
        config: { url: "/search?q={value}" },
      }),
    ],
  };

  const roundTripped = JSON.parse(JSON.stringify(instance)) as ComponentInstance;
  assertDeepEqual(roundTripped.actions, instance.actions);

  // The parsed result should validate identically to the original.
  const before = validateActions(instance.actions, "root", []);
  const after = validateActions(roundTripped.actions, "root", []);
  assertEqual(after.length, before.length);
  assertDeepEqual(after, before);
});

test("the instance JSON shape is unchanged when actions are omitted", () => {
  const legacy: ComponentInstance = {
    id: "card-1",
    type: "card",
    properties: { title: "Hello" },
  };
  const serialized = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>;
  assertEqual("actions" in serialized, false);
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
