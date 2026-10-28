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

const { calculateDropIndex, getIndicatorY } = await import(
  "../drop-position.ts"
);

// Three stacked wrappers with midpoints at 50, 170, and 290.
const bounds = [
  { top: 0, bottom: 100 },
  { top: 120, bottom: 220 },
  { top: 240, bottom: 340 },
];

test("Empty canvas returns index zero", () => {
  assertEqual(calculateDropIndex(0, []), 0);
  assertEqual(calculateDropIndex(500, []), 0);
});

test("Pointer above first midpoint inserts before first Card", () => {
  assertEqual(calculateDropIndex(-20, bounds), 0);
  assertEqual(calculateDropIndex(49, bounds), 0);
});

test("Pointer between Card midpoints inserts at the correct index", () => {
  assertEqual(calculateDropIndex(50, bounds), 1);
  assertEqual(calculateDropIndex(110, bounds), 1);
  assertEqual(calculateDropIndex(169, bounds), 1);
  assertEqual(calculateDropIndex(170, bounds), 2);
  assertEqual(calculateDropIndex(289, bounds), 2);
});

test("Pointer below last midpoint appends", () => {
  assertEqual(calculateDropIndex(290, bounds), 3);
  assertEqual(calculateDropIndex(1000, bounds), 3);
});

test("Single Card splits at its midpoint", () => {
  const single = [{ top: 100, bottom: 200 }];
  assertEqual(calculateDropIndex(120, single), 0);
  assertEqual(calculateDropIndex(180, single), 1);
});

test("Non-finite pointer position appends", () => {
  assertEqual(calculateDropIndex(Number.NaN, bounds), 3);
});

test("Indicator y matches the insertion index", () => {
  assertEqual(getIndicatorY(0, bounds), 0);
  assertEqual(getIndicatorY(1, bounds), 110);
  assertEqual(getIndicatorY(2, bounds), 230);
  assertEqual(getIndicatorY(3, bounds), 340);
  assertEqual(getIndicatorY(0, []), null);
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
