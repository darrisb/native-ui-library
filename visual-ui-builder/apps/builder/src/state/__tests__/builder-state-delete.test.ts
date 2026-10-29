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

const { createBuilderState } = await import("../builder-state.ts");
const { findComponentById } = await import("../builder-document.ts");
const { createNestedBuilderDocument } = await import(
  "../../fixtures/nested-document.ts"
);
type BuilderDocument = import("../builder-document.ts").BuilderDocument;

function ids(document: BuilderDocument): string {
  return document.rootInstances.map((instance) => instance.id).join(",");
}

function childIds(document: BuilderDocument, parentId: string): string {
  const parent = findComponentById(document, parentId);
  return parent?.children?.map((child) => child.id).join(",") ?? "";
}

// -----------------------------------------------------------------------------
// Successful deletion updates state.
// -----------------------------------------------------------------------------

test("Successful deletion removes the component from state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.deleteComponent("text-1");

  assertEqual(childIds(state.getDocument(), "root-card"), "button-1,nested-card");
  assertUndefined(
    findComponentById(state.getDocument(), "text-1"),
    "text-1 should be gone."
  );
});

test("Successful deletion removes the component and its descendants", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.deleteComponent("nested-card");

  assertEqual(childIds(state.getDocument(), "root-card"), "text-1,button-1");
  assertUndefined(
    findComponentById(state.getDocument(), "nested-card"),
    "nested-card should be gone."
  );
  assertUndefined(
    findComponentById(state.getDocument(), "text-2"),
    "text-2 should be gone."
  );
});

test("Successful deletion of the last root empties the document", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.deleteComponent("root-card");
  assertEqual(state.getDocument().rootInstances.length, 0);
});

test("Successful deletion returns a new document reference", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  state.deleteComponent("text-1");
  assertTrue(before !== state.getDocument(), "Document reference should change.");
});

// -----------------------------------------------------------------------------
// Selected component deletion clears selection.
// -----------------------------------------------------------------------------

test("Selected component deletion clears selection", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-1");
  state.deleteComponent("text-1");
  assertEqual(state.getSelectedInstanceId(), null);
});

test("Selected nested Card deletion clears selection", () => {
  const state = createNestedStateWithSelection("nested-card");
  state.deleteComponent("nested-card");
  assertEqual(state.getSelectedInstanceId(), null);
});

// -----------------------------------------------------------------------------
// Deleting a selected component's ancestor clears selection.
// -----------------------------------------------------------------------------

test("Deleting a selected component ancestor clears selection", () => {
  const state = createNestedStateWithSelection("text-2");
  state.deleteComponent("nested-card");
  assertEqual(state.getSelectedInstanceId(), null);
});

test("Deleting the root clears selection of a deeply nested descendant", () => {
  const state = createNestedStateWithSelection("text-2");
  state.deleteComponent("root-card");
  assertEqual(state.getSelectedInstanceId(), null);
});

// -----------------------------------------------------------------------------
// Unrelated selection is preserved.
// -----------------------------------------------------------------------------

test("Unrelated selection is preserved after deleting a sibling", () => {
  const state = createNestedStateWithSelection("text-1");
  state.deleteComponent("button-1");
  assertEqual(state.getSelectedInstanceId(), "text-1");
});

test("Unrelated selection is preserved after deleting an unrelated subtree", () => {
  const state = createNestedStateWithSelection("button-1");
  state.deleteComponent("nested-card");
  assertEqual(state.getSelectedInstanceId(), "button-1");
});

// -----------------------------------------------------------------------------
// Unknown IDs do not update state.
// -----------------------------------------------------------------------------

test("Unknown component id does not update state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  state.deleteComponent("missing-id");
  assertEqual(state.getDocument(), before);
  assertEqual(ids(state.getDocument()), "root-card");
  assertEqual(childIds(state.getDocument(), "root-card"), "text-1,button-1,nested-card");
});

test("Unknown component id preserves selection", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-1");
  state.deleteComponent("missing-id");
  assertEqual(state.getSelectedInstanceId(), "text-1");
});

// -----------------------------------------------------------------------------
// Subscriber notification counts.
// -----------------------------------------------------------------------------

test("Successful deletion notifies document subscribers exactly once", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  let documentCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });
  state.deleteComponent("text-1");
  assertEqual(documentCalls, 1);
});

test("Deletion clearing selection notifies selection subscribers exactly once", () => {
  const state = createNestedStateWithSelection("text-1");
  let selectionCalls = 0;
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });
  state.deleteComponent("text-1");
  assertEqual(selectionCalls, 1);
});

test("Deletion preserving selection does not notify selection subscribers", () => {
  const state = createNestedStateWithSelection("text-1");
  let selectionCalls = 0;
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });
  state.deleteComponent("button-1");
  assertEqual(selectionCalls, 0);
});

test("Unknown id does not notify any subscribers", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  let documentCalls = 0;
  let selectionCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });
  state.deleteComponent("missing-id");
  assertEqual(documentCalls, 0);
  assertEqual(selectionCalls, 0);
});

test("Document subscriber receives the updated document", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  let receivedRootCount = -1;
  state.subscribe((document) => {
    receivedRootCount = document.rootInstances.length;
  });
  state.deleteComponent("text-1");
  assertEqual(receivedRootCount, 1);
});

// -----------------------------------------------------------------------------
// Report.
// -----------------------------------------------------------------------------

function createNestedStateWithSelection(id: string) {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance(id);
  return state;
}

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
