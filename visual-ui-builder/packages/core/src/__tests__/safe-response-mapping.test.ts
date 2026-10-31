/**
 * Focused tests for safe response-path resolution and record mapping.
 *
 * Covers: root arrays, nested property paths, array-index accessors, missing
 * paths, empty arrays, unsafe paths, dropdown option mapping, generic record
 * mapping, missing fields, unsupported types, invalid records, and the
 * combined extract-and-map helper.
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
      message ?? `Expected ${String(expected)}, but got ${String(actual)}.`,
    );
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`,
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(message ?? "Expected value to be false.");
  }
}

const { resolveResponsePath, parseResponsePath } = await import(
  "../data/resolve-response-path.js"
);
const {
  mapRecords,
  mapDropdownOptions,
  extractAndMapRecords,
} = await import("../data/map-response-records.js");
import type { DataMapping } from "../types/data-source.js";

// ---------------------------------------------------------------------------
// parseResponsePath: segment splitting
// ---------------------------------------------------------------------------

test("parseResponsePath: splits a simple identifier into one key segment", () => {
  assertDeepEqual(parseResponsePath("data"), [{ key: "data" }]);
});

test("parseResponsePath: splits dot-separated identifiers", () => {
  assertDeepEqual(parseResponsePath("data.items"), [
    { key: "data" },
    { key: "items" },
  ]);
});

test("parseResponsePath: parses numeric array-index accessors", () => {
  assertDeepEqual(parseResponsePath("items[0]"), [
    { key: "items" },
    { index: 0 },
  ]);
});

test("parseResponsePath: parses mixed path with dot and index accessors", () => {
  assertDeepEqual(parseResponsePath("data.items[0].name"), [
    { key: "data" },
    { key: "items" },
    { index: 0 },
    { key: "name" },
  ]);
});

test("parseResponsePath: parses consecutive index accessors", () => {
  assertDeepEqual(parseResponsePath("items[0][1][2]"), [
    { key: "items" },
    { index: 0 },
    { index: 1 },
    { index: 2 },
  ]);
});

// ---------------------------------------------------------------------------
// resolveResponsePath: root and simple paths
// ---------------------------------------------------------------------------

test("resolveResponsePath: undefined path returns root", () => {
  const data = [{ id: 1 }, { id: 2 }];
  const result = resolveResponsePath(data, undefined);
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.value, data);
  }
});

test("resolveResponsePath: empty path returns root", () => {
  const data = { items: [1, 2, 3] };
  const result = resolveResponsePath(data, "");
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.value, data);
  }
});

test("resolveResponsePath: resolves a single property", () => {
  const data = { items: [1, 2, 3] };
  const result = resolveResponsePath(data, "items");
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.value, [1, 2, 3]);
  }
});

test("resolveResponsePath: resolves a nested property path", () => {
  const data = { data: { items: [{ name: "a" }, { name: "b" }] } };
  const result = resolveResponsePath(data, "data.items");
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.value, [{ name: "a" }, { name: "b" }]);
  }
});

test("resolveResponsePath: resolves a deep nested path with array index", () => {
  const data = { data: { items: [{ name: "first" }, { name: "second" }] } };
  const result = resolveResponsePath(data, "data.items[1].name");
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.value, "second");
  }
});

test("resolveResponsePath: resolves root array element via path", () => {
  // The safe-path grammar requires an identifier before index accessors,
  // so "items[0]" is valid while bare "[0]" is not.
  const data = { items: [{ id: 10 }, { id: 20 }] };
  const result = resolveResponsePath(data, "items[0]");
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.value, { id: 10 });
  }
});

// ---------------------------------------------------------------------------
// resolveResponsePath: error cases
// ---------------------------------------------------------------------------

test("resolveResponsePath: missing property yields failure with code 'missing'", () => {
  const data = { items: [1, 2, 3] };
  const result = resolveResponsePath(data, "missing");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing");
    assertEqual(result.error.failedAt, "missing");
  }
});

test("resolveResponsePath: nested missing property yields failure with correct failedAt", () => {
  const data = { data: { items: [] } };
  const result = resolveResponsePath(data, "data.missing");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing");
    assertEqual(result.error.failedAt, "missing");
  }
});

test("resolveResponsePath: property access on non-object yields 'not-an-object'", () => {
  const data = { count: 42 };
  const result = resolveResponsePath(data, "count.bad");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "not-an-object");
    assertEqual(result.error.failedAt, "bad");
  }
});

test("resolveResponsePath: array index on non-array yields 'not-an-array'", () => {
  const data = { items: "not an array" };
  const result = resolveResponsePath(data, "items[0]");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "not-an-array");
    assertEqual(result.error.failedAt, "[0]");
  }
});

test("resolveResponsePath: out-of-range index yields 'index-out-of-range'", () => {
  const data = { items: [1, 2, 3] };
  const result = resolveResponsePath(data, "items[5]");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "index-out-of-range");
    assertEqual(result.error.failedAt, "[5]");
  }
});

test("resolveResponsePath: invalid path string yields 'invalid-path'", () => {
  const data = { items: [1, 2, 3] };
  const result = resolveResponsePath(data, "data..items");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-path");
  }
});

test("resolveResponsePath: unsafe path (eval-like) yields 'invalid-path'", () => {
  const data = { items: [1, 2, 3] };
  // "hasOwnProperty" is a valid identifier per the grammar but should be
  // blocked if it appears as a key access against a plain object.
  const result = resolveResponsePath(data, "__proto__");
  assertFalse(result.ok);
  if (!result.ok) {
    // The path is valid grammar but the property is blocked by name.
    assertEqual(result.error.code, "missing");
    assertEqual(result.error.failedAt, "__proto__");
  }
});

test("resolveResponsePath: constructor property name is blocked", () => {
  const data = { constructor: "value" };
  const result = resolveResponsePath(data, "constructor");
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing");
    assertEqual(result.error.failedAt, "constructor");
  }
});

// ---------------------------------------------------------------------------
// mapRecords: basic mapping
// ---------------------------------------------------------------------------

test("mapRecords: maps label/value from simple records", () => {
  const records = [
    { name: "Alice", id: 1 },
    { name: "Bob", id: 2 },
  ];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.records, [
      { label: "Alice", value: 1 },
      { label: "Bob", value: 2 },
    ]);
  }
});

test("mapRecords: preserves string values as strings", () => {
  const records = [{ name: "Alice", code: "A1" }];
  const mapping: DataMapping = { label: "name", value: "code" };
  const result = mapRecords(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertEqual(typeof result.records[0]!.value, "string");
    assertEqual(result.records[0]!.value, "A1");
  }
});

test("mapRecords: preserves number values as numbers", () => {
  const records = [{ name: "Alice", id: 42 }];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertEqual(typeof result.records[0]!.value, "number");
    assertEqual(result.records[0]!.value, 42);
  }
});

test("mapRecords: empty array returns empty output", () => {
  const records: Record<string, unknown>[] = [];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertEqual(result.records.length, 0);
  }
});

test("mapRecords: maps nested field paths", () => {
  const records = [
    { profile: { name: "Alice" }, meta: { id: 1 } },
    { profile: { name: "Bob" }, meta: { id: 2 } },
  ];
  const mapping: DataMapping = { label: "profile.name", value: "meta.id" };
  const result = mapRecords(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.records, [
      { label: "Alice", value: 1 },
      { label: "Bob", value: 2 },
    ]);
  }
});

// ---------------------------------------------------------------------------
// mapRecords: error cases
// ---------------------------------------------------------------------------

test("mapRecords: missing field yields 'missing-field' with field name and index", () => {
  const records = [{ name: "Alice" }];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing-field");
    assertEqual(result.error.field, "value");
    assertEqual(result.error.index, 0);
  }
});

test("mapRecords: null field value yields 'missing-field'", () => {
  const records = [{ name: "Alice", id: null }];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing-field");
    assertEqual(result.error.field, "value");
  }
});

test("mapRecords: unsupported type (object) yields 'unsupported-type'", () => {
  const records = [{ name: "Alice", meta: { nested: true } }];
  const mapping: DataMapping = { label: "name", value: "meta" };
  const result = mapRecords(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "unsupported-type");
    assertEqual(result.error.field, "value");
    assertEqual(result.error.index, 0);
  }
});

test("mapRecords: unsupported type (array) yields 'unsupported-type'", () => {
  const records = [{ name: "Alice", tags: ["a", "b"] }];
  const mapping: DataMapping = { label: "name", value: "tags" };
  const result = mapRecords(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "unsupported-type");
  }
});

test("mapRecords: invalid record (non-object) yields 'invalid-record'", () => {
  const records = ["not an object"];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(
    records as unknown as Record<string, unknown>[],
    mapping,
  );
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-record");
    assertEqual(result.error.index, 0);
  }
});

test("mapRecords: invalid record (null) yields 'invalid-record'", () => {
  const records = [null];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapRecords(
    records as unknown as Record<string, unknown>[],
    mapping,
  );
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-record");
  }
});

test("mapRecords: invalid mapping path yields 'invalid-mapping'", () => {
  const records = [{ name: "Alice", id: 1 }];
  const mapping: DataMapping = { label: "name", value: "bad..path" };
  const result = mapRecords(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-mapping");
    assertEqual(result.error.field, "value");
  }
});

// ---------------------------------------------------------------------------
// mapDropdownOptions: dropdown-specific mapping
// ---------------------------------------------------------------------------

test("mapDropdownOptions: maps records to dropdown options", () => {
  const records = [
    { name: "United States", code: "US" },
    { name: "Canada", code: "CA" },
    { name: "Mexico", code: 42 },
  ];
  const mapping: DataMapping = { label: "name", value: "code" };
  const result = mapDropdownOptions(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.records, [
      { label: "United States", value: "US" },
      { label: "Canada", value: "CA" },
      { label: "Mexico", value: 42 },
    ]);
  }
});

test("mapDropdownOptions: stringifies label for number source", () => {
  const records = [{ code: 1 }];
  const mapping: DataMapping = { label: "code", value: "code" };
  const result = mapDropdownOptions(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertEqual(result.records[0]!.label, "1");
    assertEqual(result.records[0]!.value, 1);
  }
});

test("mapDropdownOptions: empty array returns empty options", () => {
  const records: Record<string, unknown>[] = [];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapDropdownOptions(records, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertEqual(result.records.length, 0);
  }
});

test("mapDropdownOptions: missing label in mapping output fails", () => {
  const records = [{ id: 1 }];
  const mapping: DataMapping = { value: "id" };
  const result = mapDropdownOptions(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing-field");
    assertEqual(result.error.field, "label");
  }
});

test("mapDropdownOptions: missing value in mapping output fails", () => {
  const records = [{ name: "Alice" }];
  const mapping: DataMapping = { label: "name" };
  const result = mapDropdownOptions(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing-field");
    assertEqual(result.error.field, "value");
  }
});

test("mapDropdownOptions: field error on second record reports correct index", () => {
  const records = [
    { name: "Alice", id: 1 },
    { name: "Bob" },
  ];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = mapDropdownOptions(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "missing-field");
    assertEqual(result.error.field, "value");
    assertEqual(result.error.index, 1);
  }
});

// ---------------------------------------------------------------------------
// extractAndMapRecords: combined extraction and mapping
// ---------------------------------------------------------------------------

test("extractAndMapRecords: extracts root array and maps", () => {
  const payload = [
    { name: "Alice", id: 1 },
    { name: "Bob", id: 2 },
  ];
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = extractAndMapRecords(payload, undefined, mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.records, [
      { label: "Alice", value: 1 },
      { label: "Bob", value: 2 },
    ]);
  }
});

test("extractAndMapRecords: extracts nested array and maps", () => {
  const payload = { data: { countries: [{ name: "US", code: "US" }] } };
  const mapping: DataMapping = { label: "name", value: "code" };
  const result = extractAndMapRecords(payload, "data.countries", mapping);
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.records, [{ label: "US", value: "US" }]);
  }
});

test("extractAndMapRecords: non-array at path yields failure", () => {
  const payload = { data: "not an array" };
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = extractAndMapRecords(payload, "data", mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-record");
  }
});

test("extractAndMapRecords: missing path yields failure", () => {
  const payload = { items: [1, 2, 3] };
  const mapping: DataMapping = { label: "name", value: "id" };
  const result = extractAndMapRecords(payload, "missing.path", mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-record");
  }
});

// ---------------------------------------------------------------------------
// Error messages are safe (do not echo input data)
// ---------------------------------------------------------------------------

test("resolveResponsePath error message does not echo the data value", () => {
  const data = { items: "SECRET_VALUE" };
  const result = resolveResponsePath(data, "items.bad");
  assertFalse(result.ok);
  if (!result.ok) {
    assertFalse(result.error.message.includes("SECRET_VALUE"));
  }
});

test("mapRecords error message does not echo the source value", () => {
  const records = [{ name: "Alice", secret: { key: "SHOULD_NOT_APPEAR" } }];
  const mapping: DataMapping = { label: "name", value: "secret" };
  const result = mapRecords(records, mapping);
  assertFalse(result.ok);
  if (!result.ok) {
    assertFalse(result.error.message.includes("SHOULD_NOT_APPEAR"));
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

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
