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
      message ?? `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`
    );
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(
      message ?? `Expected ${expectedStr}, but got ${actualStr}.`
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

const { parseTableColumns } = await import("../data/parse-table-columns.js");
const {
  tableDefinition,
  sampleDefinitions,
  ComponentRegistry,
} = await import("../index.js");

// -- parseTableColumns tests --

test("parses field|Label lines", () => {
  const input = "name|Full Name\nprice|Price (€)";
  const result = parseTableColumns(input);
  assertDeepEqual(result, [
    { field: "name", label: "Full Name" },
    { field: "price", label: "Price (€)" },
  ]);
});

test("parses field-only lines", () => {
  const input = "id\nstatus";
  const result = parseTableColumns(input);
  assertDeepEqual(result, [
    { field: "id", label: "id" },
    { field: "status", label: "status" },
  ]);
});

test("skips blank lines", () => {
  const input = "name|Name\n\n  \n\ncode|Code";
  const result = parseTableColumns(input);
  assertDeepEqual(result, [
    { field: "name", label: "Name" },
    { field: "code", label: "Code" },
  ]);
});

test("extra '|' kept in label", () => {
  const input = "sku|SKU | reference";
  const result = parseTableColumns(input);
  assertDeepEqual(result, [
    { field: "sku", label: "SKU | reference" },
  ]);
});

test("empty input returns empty array", () => {
  assertDeepEqual(parseTableColumns(""), []);
  assertDeepEqual(parseTableColumns("   "), []);
  assertDeepEqual(parseTableColumns("\n\n"), []);
});

test("lines are trimmed before parsing", () => {
  const input = "  name|Name  \n  status";
  const result = parseTableColumns(input);
  assertDeepEqual(result, [
    { field: "name", label: "Name" },
    { field: "status", label: "status" },
  ]);
});

// -- tableDefinition validation tests --

test("tableDefinition has correct metadata", () => {
  assertEqual(tableDefinition.type, "table");
  assertEqual(tableDefinition.name, "Table");
  assertEqual(tableDefinition.category, "data");
  assertTrue(typeof tableDefinition.description === "string");
  assertEqual(tableDefinition.allowChildren, false);
  assertDeepEqual(tableDefinition.dataBinding, ["rows"]);
});

test("tableDefinition declares columns, pageSize, and sort properties", () => {
  const propNames = tableDefinition.properties.map((p) => p.name);
  assertDeepEqual(propNames, ["columns", "pageSize", "sort"]);
});

test("tableDefinition columns is a multiline string property", () => {
  const columns = tableDefinition.properties.find((p) => p.name === "columns");
  assertTrue(columns !== undefined, "columns property should exist");
  assertEqual(columns!.type, "string");
  assertTrue(columns!.multiline === true, "columns should be multiline");
});

test("tableDefinition pageSize is a number defaulting to 25", () => {
  const pageSize = tableDefinition.properties.find((p) => p.name === "pageSize");
  assertTrue(pageSize !== undefined, "pageSize property should exist");
  assertEqual(pageSize!.type, "number");
  assertEqual(pageSize!.defaultValue, 25);
});

test("tableDefinition sort is a string property", () => {
  const sort = tableDefinition.properties.find((p) => p.name === "sort");
  assertTrue(sort !== undefined, "sort property should exist");
  assertEqual(sort!.type, "string");
});

test("tableDefinition is included in sampleDefinitions", () => {
  assertTrue(
    sampleDefinitions.some((definition) => definition.type === "table"),
    "table should be part of the sample definitions"
  );
});

test("tableDefinition can be registered on ComponentRegistry", () => {
  const registry = new ComponentRegistry();
  registry.register(tableDefinition);
  assertEqual(registry.lookup("table")?.type, "table");
});

// -- Summary --

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
