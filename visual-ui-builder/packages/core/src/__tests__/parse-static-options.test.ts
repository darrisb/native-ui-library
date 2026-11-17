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

const { parseStaticOptions } = await import("../data/parse-static-options.js");
const { dropdownDefinition, ComponentRegistry } = await import("../index.js");

// -- parseStaticOptions tests --

test("parses value|label lines", () => {
  const input = "opt1|Option One\nopt2|Option Two";
  const result = parseStaticOptions(input);
  assertDeepEqual(result, [
    { value: "opt1", label: "Option One" },
    { value: "opt2", label: "Option Two" },
  ]);
});

test("parses label-only lines", () => {
  const input = "Apple\nBanana";
  const result = parseStaticOptions(input);
  assertDeepEqual(result, [
    { value: "Apple", label: "Apple" },
    { value: "Banana", label: "Banana" },
  ]);
});

test("skips blank lines", () => {
  const input = "a|A\n\nb|B\n  \n\nc|C";
  const result = parseStaticOptions(input);
  assertDeepEqual(result, [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ]);
});

test("extra '|' kept in label", () => {
  const input = "key|label|extra|pipes";
  const result = parseStaticOptions(input);
  assertDeepEqual(result, [
    { value: "key", label: "label|extra|pipes" },
  ]);
});

test("empty input returns empty array", () => {
  assertDeepEqual(parseStaticOptions(""), []);
  assertDeepEqual(parseStaticOptions("   "), []);
  assertDeepEqual(parseStaticOptions("\n\n"), []);
});

// -- dropdownDefinition validation tests --

test("dropdownDefinition has correct metadata", () => {
  assertEqual(dropdownDefinition.type, "dropdown");
  assertEqual(dropdownDefinition.name, "Dropdown");
  assertEqual(dropdownDefinition.category, "form");
  assertTrue(typeof dropdownDefinition.description === "string");
  assertEqual(dropdownDefinition.allowChildren, false);
  assertDeepEqual(dropdownDefinition.dataBinding, ["options"]);
});

test("dropdownDefinition has all required properties", () => {
  const propNames = dropdownDefinition.properties.map((p) => p.name);
  assertTrue(propNames.includes("label"), "Missing label property");
  assertTrue(propNames.includes("placeholder"), "Missing placeholder property");
  assertTrue(propNames.includes("name"), "Missing name property");
  assertTrue(propNames.includes("required"), "Missing required property");
  assertTrue(propNames.includes("disabled"), "Missing disabled property");
  assertTrue(propNames.includes("staticOptions"), "Missing staticOptions property");
});

test("dropdownDefinition placeholder defaults to 'Select…'", () => {
  const placeholder = dropdownDefinition.properties.find(
    (p) => p.name === "placeholder"
  );
  assertTrue(placeholder !== undefined, "placeholder property should exist");
  assertEqual(placeholder!.defaultValue, "Select…");
});

test("dropdownDefinition staticOptions is multiline string", () => {
  const staticOptions = dropdownDefinition.properties.find(
    (p) => p.name === "staticOptions"
  );
  assertTrue(staticOptions !== undefined, "staticOptions property should exist");
  assertEqual(staticOptions!.type, "string");
  assertTrue(staticOptions!.multiline === true, "staticOptions should be multiline");
});

test("dropdownDefinition can be registered on ComponentRegistry", () => {
  const registry = new ComponentRegistry();
  registry.register(dropdownDefinition);
  assertEqual(registry.lookup("dropdown")?.type, "dropdown");
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
