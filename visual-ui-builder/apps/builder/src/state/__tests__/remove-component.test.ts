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

function assertUndefined(value: unknown, message?: string): void {
  if (value !== undefined) {
    throw new Error(message ?? `Expected undefined, but got ${String(value)}.`);
  }
}

const {
  removeComponentById,
  findComponentById,
} = await import("../builder-document.ts");
type BuilderDocument = import("../builder-document.ts").BuilderDocument;
const { createNestedBuilderDocument } = await import(
  "../../fixtures/nested-document.ts"
);

function ids(document: BuilderDocument): string {
  return document.rootInstances.map((instance) => instance.id).join(",");
}

function childIds(document: BuilderDocument, parentId: string): string {
  const parent = findComponentById(document, parentId);
  return parent?.children?.map((child) => child.id).join(",") ?? "";
}

// -----------------------------------------------------------------------------
// Delete a root Card.
// -----------------------------------------------------------------------------

test("Delete a root Card", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "root-card");

  assertEqual(result.rootInstances.length, 0);
});

// -----------------------------------------------------------------------------
// Delete nested Text and Button.
// -----------------------------------------------------------------------------

test("Delete nested Text preserves siblings and order", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "text-1");

  assertEqual(childIds(result, "root-card"), "button-1,nested-card");
  assertUndefined(findComponentById(result, "text-1"), "text-1 should be gone.");
});

test("Delete nested Button preserves siblings and order", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "button-1");

  assertEqual(childIds(result, "root-card"), "text-1,nested-card");
  assertUndefined(findComponentById(result, "button-1"), "button-1 should be gone.");
});

// -----------------------------------------------------------------------------
// Delete nested Card and descendants.
// -----------------------------------------------------------------------------

test("Delete nested Card removes the Card and all descendants", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "nested-card");

  assertEqual(childIds(result, "root-card"), "text-1,button-1");
  assertUndefined(
    findComponentById(result, "nested-card"),
    "nested-card should be gone."
  );
  assertUndefined(
    findComponentById(result, "text-2"),
    "text-2 (descendant) should be gone."
  );
});

// -----------------------------------------------------------------------------
// Preserve unrelated components.
// -----------------------------------------------------------------------------

test("Preserve unrelated components and their references", () => {
  const document = createNestedBuilderDocument();
  const beforeText1 = findComponentById(document, "text-1")!;
  const beforeButton1 = findComponentById(document, "button-1")!;
  // text-2 is inside nested-card, so it should be removed along with it.

  const result = removeComponentById(document, "nested-card");

  assertEqual(findComponentById(result, "text-1"), beforeText1);
  assertEqual(findComponentById(result, "button-1"), beforeButton1);
  assertUndefined(
    findComponentById(result, "text-2"),
    "text-2 (descendant of nested-card) should be gone."
  );
});

test("Preserve sibling order when deleting the middle child", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "button-1");

  assertEqual(childIds(result, "root-card"), "text-1,nested-card");
});

// -----------------------------------------------------------------------------
// Reject unknown IDs.
// -----------------------------------------------------------------------------

test("Reject unknown IDs without modifying the document", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "missing-id");

  assertEqual(result, document, "Original document should be returned.");
  assertEqual(ids(result), "root-card");
  assertEqual(childIds(result, "root-card"), "text-1,button-1,nested-card");
});

// -----------------------------------------------------------------------------
// Verify immutability.
// -----------------------------------------------------------------------------

test("removeComponentById does not mutate the input document", () => {
  const document = createNestedBuilderDocument();
  const beforeRoots = document.rootInstances;
  const beforeRoot = beforeRoots[0];
  const beforeChildren = beforeRoot.children;
  const beforeText1 = findComponentById(document, "text-1")!;

  removeComponentById(document, "text-1");

  assertEqual(document.rootInstances, beforeRoots);
  assertEqual(document.rootInstances[0], beforeRoot);
  assertEqual(document.rootInstances[0].children, beforeChildren);
  assertEqual(findComponentById(document, "text-1"), beforeText1);
});

test("removeComponentById returns a new document reference", () => {
  const document = createNestedBuilderDocument();
  const result = removeComponentById(document, "text-1");

  assertTrue(result !== document, "Document reference should change.");
  assertTrue(
    result.rootInstances !== document.rootInstances,
    "Root instances array should change."
  );
});

test("removeComponentById preserves the unaffected root object reference", () => {
  const multiDocument: BuilderDocument = {
    rootInstances: [
      { id: "keep", type: "card", properties: { title: "Keep" } },
      {
        id: "remove",
        type: "card",
        properties: { title: "Remove" },
        children: [
          { id: "child-1", type: "text", properties: { content: "Hi" } },
        ],
      },
    ],
  };

  const keepBefore = multiDocument.rootInstances[0];
  const result = removeComponentById(multiDocument, "remove");

  assertEqual(result.rootInstances.length, 1);
  assertEqual(result.rootInstances[0], keepBefore, "Unrelated root kept.");
});

// -----------------------------------------------------------------------------
// Report.
// -----------------------------------------------------------------------------

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
