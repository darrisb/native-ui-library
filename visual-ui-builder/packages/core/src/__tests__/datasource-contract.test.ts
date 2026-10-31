/**
 * Focused tests for the declarative data source and binding contracts.
 *
 * Covers: valid REST data sources, omitted data source (legacy JSON), malformed
 * data sources (bad type, method, url scheme, secrets, responsePath, mapping,
 * loadOn), valid/malformed bindings, the safe path grammar, and JSON
 * round-trip serialization. No network requests are issued.
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

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

import type {
  DataSource,
  RestDataSource
} from "../types/data-source.js";
import type { Binding } from "../types/binding.js";
import type { ComponentInstance } from "../types/component-instance.js";

const { isValidDataPath } = await import("../types/data-source.js");
const { validateDataSourceContracts } = await import(
  "../validation/validate-data-source.js"
);

// A reusable valid REST data source used across tests.
function restDataSource(
  overrides: Partial<RestDataSource> = {}
): DataSource {
  return {
    type: "rest",
    method: "GET",
    url: "https://api.example.com/items",
    loadOn: "mount",
    ...overrides,
  } as DataSource;
}

// ---------------------------------------------------------------------------
// Valid data source contracts
// ---------------------------------------------------------------------------

test("a valid REST GET data source produces no errors", () => {
  const errors = validateDataSourceContracts(restDataSource(), undefined, "root", []);
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a valid REST data source with responsePath and mapping is accepted", () => {
  const errors = validateDataSourceContracts(
    restDataSource({
      responsePath: "data.items",
      mapping: { label: "name", value: "id" },
    }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a relative URL is accepted", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "/api/items" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

// ---------------------------------------------------------------------------
// Legacy JSON with no dataSource stays valid
// ---------------------------------------------------------------------------

test("an omitted data source produces no errors (legacy JSON)", () => {
  const errors = validateDataSourceContracts(undefined, undefined, "root", []);
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("legacy instance JSON omits dataSource and bindings keys", () => {
  const legacy: ComponentInstance = {
    id: "card-1",
    type: "card",
    properties: { title: "Hello" },
  };
  const serialized = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>;
  assertEqual("dataSource" in serialized, false);
  assertEqual("bindings" in serialized, false);
});

// ---------------------------------------------------------------------------
// Malformed data sources
// ---------------------------------------------------------------------------

test("an unknown data source type is rejected", () => {
  const errors = validateDataSourceContracts(
    { type: "graphql", url: "https://api.example.com" } as unknown as DataSource,
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "Unknown data source type");
});

test("an unsupported method is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ method: "POST" as never }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"method"');
  assertIncludes(errors[0]!.path, "root.dataSource.method");
});

test("an unsupported loadOn is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ loadOn: "click" as never }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"loadOn"');
  assertIncludes(errors[0]!.path, "root.dataSource.loadOn");
});

test("an empty URL is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"url"');
  assertIncludes(errors[0]!.path, "root.dataSource.url");
});

test("a javascript: URL scheme is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "javascript:alert(1)" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("a data: URL scheme is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "data:text/html,<h1>hi</h1>" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("an obfuscated javascript: scheme (leading whitespace) is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "  javascript:alert(1)" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "disallowed URL scheme");
});

test("a URL with an embedded api_key query param is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "https://api.example.com/items?api_key=secret" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "must not contain secrets");
  assertIncludes(errors[0]!.path, "root.dataSource.url");
});

test("a URL with an embedded token query param is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "https://api.example.com/items?token=abc" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "must not contain secrets");
});

test("a URL with an embedded password query param is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "https://api.example.com/items?user=x&password=y" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, "must not contain secrets");
});

test("a benign query parameter is not flagged as a secret", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ url: "https://api.example.com/items?page=2&limit=10" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a malformed responsePath is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ responsePath: "data..items" }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"responsePath"');
});

test("a mapping value that is not a safe path is rejected", () => {
  const errors = validateDataSourceContracts(
    restDataSource({ mapping: { label: "name", value: "user[" } }),
    undefined,
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.path, "root.dataSource.mapping.value");
  assertIncludes(errors[0]!.message, "not a safe path");
});

// ---------------------------------------------------------------------------
// Binding contracts
// ---------------------------------------------------------------------------

test("a valid binding to options is accepted", () => {
  const errors = validateDataSourceContracts(undefined, [{ target: "options" }], "root", []);
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("a valid binding to rows with a safe path is accepted", () => {
  const errors = validateDataSourceContracts(
    undefined,
    [{ target: "rows", path: "data[0]" }],
    "root",
    []
  );
  assertEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`);
});

test("an unknown binding target is rejected", () => {
  const errors = validateDataSourceContracts(
    undefined,
    [{ target: "columns" } as unknown as Binding],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"target"');
  assertIncludes(errors[0]!.path, "root.bindings[0].target");
});

test("a binding with a malformed path is rejected", () => {
  const errors = validateDataSourceContracts(
    undefined,
    [{ target: "options", path: "items[-1]" }],
    "root",
    []
  );
  assertEqual(errors.length, 1, `Expected 1 error, got: ${JSON.stringify(errors)}`);
  assertIncludes(errors[0]!.message, '"path"');
  assertIncludes(errors[0]!.path, "root.bindings[0].path");
});

// ---------------------------------------------------------------------------
// Safe path grammar
// ---------------------------------------------------------------------------

test("accepts simple identifiers", () => {
  assertTrue(isValidDataPath("data"));
  assertTrue(isValidDataPath("_items"));
  assertTrue(isValidDataPath("responseData"));
});

test("accepts dot-separated paths", () => {
  assertTrue(isValidDataPath("data.items"));
  assertTrue(isValidDataPath("a.b.c.d"));
});

test("accepts numeric array-index accessors", () => {
  assertTrue(isValidDataPath("items[0]"));
  assertTrue(isValidDataPath("data.items[0].name"));
  assertTrue(isValidDataPath("items[0][1][2]"));
});

test("rejects empty strings", () => {
  assertEqual(isValidDataPath(""), false);
});

test("rejects leading, trailing, and double dots", () => {
  assertEqual(isValidDataPath(".data"), false);
  assertEqual(isValidDataPath("data."), false);
  assertEqual(isValidDataPath("data..items"), false);
});

test("rejects bracket access with string keys", () => {
  assertEqual(isValidDataPath('data["items"]'), false);
  assertEqual(isValidDataPath("data['items']"), false);
});

test("rejects negative or non-numeric indices", () => {
  assertEqual(isValidDataPath("items[-1]"), false);
  assertEqual(isValidDataPath("items[x]"), false);
});

test("rejects whitespace-only paths", () => {
  assertEqual(isValidDataPath("   "), false);
});

// ---------------------------------------------------------------------------
// Round-trip serialization
// ---------------------------------------------------------------------------

test("dataSource and bindings survive JSON round-trip serialization", () => {
  const instance: ComponentInstance = {
    id: "dropdown-1",
    type: "dropdown",
    properties: { label: "Country" },
    dataSource: restDataSource({
      responsePath: "data.countries",
      mapping: { label: "name", value: "code" },
    }),
    bindings: [{ target: "options" }],
  };

  const roundTripped = JSON.parse(JSON.stringify(instance)) as ComponentInstance;
  assertDeepEqual(roundTripped.dataSource, instance.dataSource);
  assertDeepEqual(roundTripped.bindings, instance.bindings);

  const before = validateDataSourceContracts(
    instance.dataSource,
    instance.bindings,
    "root",
    []
  );
  const after = validateDataSourceContracts(
    roundTripped.dataSource,
    roundTripped.bindings,
    "root",
    []
  );
  assertEqual(after.length, before.length);
  assertDeepEqual(after, before);
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
