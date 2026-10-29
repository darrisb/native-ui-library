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
const {
  ComponentRegistry: WorkflowComponentRegistry,
  registerSampleDefinitions: WorkflowRegisterSampleDefinitions,
} = await import("@visual-ui/core");

const workflowRegistry = new WorkflowComponentRegistry();
WorkflowRegisterSampleDefinitions(workflowRegistry);

function createCardInstance(
  id: string,
  properties: Record<string, string | number | boolean> = {}
) {
  return {
    id,
    type: "card",
    properties: {
      title: "",
      padding: 16,
      backgroundColor: "#ffffff",
      ...properties,
    },
  };
}

function createTextInstance(
  id: string,
  properties: Record<string, string | number | boolean> = {}
) {
  return {
    id,
    type: "text",
    properties: {
      content: "",
      color: "#000000",
      align: "left",
      ...properties,
    },
  };
}

function childIds(state: ReturnType<typeof createBuilderState>, parentId: string): string {
  const parent = findComponentById(state.getDocument(), parentId);
  return parent?.children?.map((child) => child.id).join(",") ?? "";
}

function childCount(state: ReturnType<typeof createBuilderState>, parentId: string): number {
  const parent = findComponentById(state.getDocument(), parentId);
  return parent?.children?.length ?? 0;
}

// -----------------------------------------------------------------------------
// Insert nested Text, undo, then redo.
// -----------------------------------------------------------------------------

test("Insert nested Text, undo, then redo restores the full subtree", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  // Record baseline.
  assertEqual(childCount(state, "root-card"), 3);
  assertEqual(childIds(state, "root-card"), "text-1,button-1,nested-card");

  // Insert a new Text as a child of root-card.
  state.insertChildInstance(
    "root-card",
    createTextInstance("new-text", { content: "Inserted text", color: "#ff0000" }),
    0,
    workflowRegistry
  );
  assertEqual(childCount(state, "root-card"), 4);
  assertEqual(
    childIds(state, "root-card"),
    "new-text,text-1,button-1,nested-card"
  );

  const inserted = findComponentById(state.getDocument(), "new-text")!;
  assertEqual(inserted.properties.content, "Inserted text");
  assertEqual(inserted.properties.color, "#ff0000");

  // Undo the insertion.
  state.undo();
  assertEqual(childCount(state, "root-card"), 3);
  assertEqual(childIds(state, "root-card"), "text-1,button-1,nested-card");
  assertEqual(
    findComponentById(state.getDocument(), "new-text"),
    undefined,
    "new-text should be gone after undo."
  );
  assertTrue(state.canRedo(), "Redo should be available after undo.");

  // Redo the insertion.
  state.redo();
  assertEqual(childCount(state, "root-card"), 4);
  assertEqual(
    childIds(state, "root-card"),
    "new-text,text-1,button-1,nested-card"
  );

  const restored = findComponentById(state.getDocument(), "new-text")!;
  assertEqual(restored.id, "new-text", "Component ID must be preserved.");
  assertEqual(restored.type, "text");
  assertEqual(restored.properties.content, "Inserted text");
  assertEqual(restored.properties.color, "#ff0000");
  assertEqual(restored.properties.align, "left");
});

// -----------------------------------------------------------------------------
// Delete Card with descendants, undo, then redo.
// -----------------------------------------------------------------------------

test("Delete Card subtree, undo, then redo restores and re-applies", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  // Confirm nested-card and its descendant text-2 exist.
  assertTrue(
    findComponentById(state.getDocument(), "nested-card") !== undefined,
    "nested-card should exist initially."
  );
  assertTrue(
    findComponentById(state.getDocument(), "text-2") !== undefined,
    "text-2 should exist initially."
  );
  assertEqual(childCount(state, "root-card"), 3);

  // Delete nested-card and its entire descendant subtree.
  state.deleteComponent("nested-card");
  assertEqual(childCount(state, "root-card"), 2);
  assertEqual(childIds(state, "root-card"), "text-1,button-1");
  assertEqual(
    findComponentById(state.getDocument(), "nested-card"),
    undefined,
    "nested-card should be deleted."
  );
  assertEqual(
    findComponentById(state.getDocument(), "text-2"),
    undefined,
    "text-2 should be deleted."
  );

  // Undo the deletion.
  state.undo();
  assertEqual(childCount(state, "root-card"), 3);
  assertEqual(childIds(state, "root-card"), "text-1,button-1,nested-card");

  const restoredNested = findComponentById(state.getDocument(), "nested-card")!;
  assertEqual(restoredNested.id, "nested-card");
  assertEqual(restoredNested.properties.title, "Nested Card");
  assertEqual(restoredNested.properties.backgroundColor, "#f0f0f0");

  const restoredText2 = findComponentById(state.getDocument(), "text-2")!;
  assertEqual(restoredText2.id, "text-2");
  assertEqual(restoredText2.properties.content, "Text inside nested card");
  assertEqual(restoredText2.properties.align, "center");

  // Redo the deletion.
  state.redo();
  assertEqual(childCount(state, "root-card"), 2);
  assertEqual(childIds(state, "root-card"), "text-1,button-1");
  assertEqual(
    findComponentById(state.getDocument(), "nested-card"),
    undefined,
    "nested-card should be deleted again after redo."
  );
  assertEqual(
    findComponentById(state.getDocument(), "text-2"),
    undefined,
    "text-2 should be deleted again after redo."
  );
});

// -----------------------------------------------------------------------------
// Change component property, undo, then redo.
// -----------------------------------------------------------------------------

test("Change component property, undo, then redo preserves values", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  // Change a nested Text property.
  state.updateInstanceProperties(
    "text-2",
    { content: "Updated content", color: "#123456" },
    workflowRegistry
  );
  const updated = findComponentById(state.getDocument(), "text-2")!;
  assertEqual(updated.properties.content, "Updated content");
  assertEqual(updated.properties.color, "#123456");

  // Undo the property change.
  state.undo();
  const reverted = findComponentById(state.getDocument(), "text-2")!;
  assertEqual(reverted.id, "text-2", "ID must be preserved after undo.");
  assertEqual(reverted.properties.content, "Text inside nested card");
  assertEqual(reverted.properties.color, "#333333");
  assertEqual(reverted.properties.align, "center");
  assertTrue(state.canRedo(), "Redo should be available after undo.");

  // Redo the property change.
  state.redo();
  const redone = findComponentById(state.getDocument(), "text-2")!;
  assertEqual(redone.id, "text-2", "ID must be preserved after redo.");
  assertEqual(redone.properties.content, "Updated content");
  assertEqual(redone.properties.color, "#123456");
  assertEqual(redone.properties.align, "center");
});

// -----------------------------------------------------------------------------
// Undo then make a new edit and verify redo is unavailable.
// -----------------------------------------------------------------------------

test("Undo then new edit invalidates redo", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  // First edit: update text-1 content.
  state.updateInstanceProperties(
    "text-1",
    { content: "First edit" },
    workflowRegistry
  );
  assertEqual(
    findComponentById(state.getDocument(), "text-1")!.properties.content,
    "First edit"
  );

  // Second edit: update text-1 content again.
  state.updateInstanceProperties(
    "text-1",
    { content: "Second edit" },
    workflowRegistry
  );
  assertEqual(
    findComponentById(state.getDocument(), "text-1")!.properties.content,
    "Second edit"
  );

  // Undo once: back to "First edit".
  state.undo();
  assertEqual(
    findComponentById(state.getDocument(), "text-1")!.properties.content,
    "First edit"
  );
  assertTrue(state.canRedo(), "Redo should be available after undo.");

  // Make a new edit: redo history should be cleared.
  state.updateInstanceProperties(
    "text-1",
    { content: "New edit" },
    workflowRegistry
  );
  assertEqual(
    findComponentById(state.getDocument(), "text-1")!.properties.content,
    "New edit"
  );
  assertTrue(
    !state.canRedo(),
    "Redo should be unavailable after a new edit."
  );

  // Undo should still work to go back to "First edit".
  state.undo();
  assertEqual(
    findComponentById(state.getDocument(), "text-1")!.properties.content,
    "First edit"
  );
});

// -----------------------------------------------------------------------------
// Multiple undos and redos in sequence with intermediate states.
// -----------------------------------------------------------------------------

test("Multiple undos and redos in sequence restore correct states", () => {
  const state = createBuilderState();

  // Step 1: add first Card.
  state.addRootInstance(createCardInstance("card-1"));
  assertEqual(
    state.getDocument().rootInstances.map((i) => i.id).join(","),
    "card-1"
  );

  // Step 2: add second Card.
  state.addRootInstance(createCardInstance("card-2"));
  assertEqual(
    state.getDocument().rootInstances.map((i) => i.id).join(","),
    "card-1,card-2"
  );

  // Step 3: insert Text into card-1.
  state.insertChildInstance(
    "card-1",
    createTextInstance("text-a", { content: "A" }),
    0,
    workflowRegistry
  );
  assertEqual(childIds(state, "card-1"), "text-a");

  // Step 4: insert Text into card-2.
  state.insertChildInstance(
    "card-2",
    createTextInstance("text-b", { content: "B" }),
    0,
    workflowRegistry
  );
  assertEqual(childIds(state, "card-2"), "text-b");

  // Undo step 4.
  state.undo();
  assertEqual(childIds(state, "card-2"), "", "text-b should be gone after undo.");

  // Undo step 3.
  state.undo();
  assertEqual(childIds(state, "card-1"), "", "text-a should be gone after undo.");

  // Undo step 2.
  state.undo();
  assertEqual(
    state.getDocument().rootInstances.map((i) => i.id).join(","),
    "card-1",
    "card-2 should be gone after undo."
  );

  // Redo step 2.
  state.redo();
  assertEqual(
    state.getDocument().rootInstances.map((i) => i.id).join(","),
    "card-1,card-2"
  );

  // Redo step 3.
  state.redo();
  assertEqual(childIds(state, "card-1"), "text-a");

  // Redo step 4.
  state.redo();
  assertEqual(childIds(state, "card-2"), "text-b");

  assertTrue(!state.canRedo(), "No further redo should be available.");
});

// -----------------------------------------------------------------------------
// Verify history operations preserve component IDs.
// -----------------------------------------------------------------------------

test("Undo and redo preserve component IDs across mutations", () => {
  const state = createNestedBuilderState();

  // Capture all IDs before any mutations.
  const beforeIds = collectAllIds(state.getDocument());
  assertEqual(beforeIds.includes("root-card"), true);
  assertEqual(beforeIds.includes("text-1"), true);
  assertEqual(beforeIds.includes("button-1"), true);
  assertEqual(beforeIds.includes("nested-card"), true);
  assertEqual(beforeIds.includes("text-2"), true);

  // Mutation 1: insert a new Text.
  state.insertChildInstance(
    "nested-card",
    createTextInstance("deep-text", { content: "Deep" }),
    0,
    workflowRegistry
  );
  assertTrue(
    collectAllIds(state.getDocument()).includes("deep-text"),
    "deep-text should exist after insertion."
  );

  // Mutation 2: move button-1 into nested-card.
  state.moveComponent("button-1", "nested-card", 1, workflowRegistry);
  const afterMoveButton = findComponentById(state.getDocument(), "button-1")!;
  assertEqual(afterMoveButton.id, "button-1", "button-1 ID preserved after move.");

  // Undo mutation 2: button-1 should be back in root-card.
  state.undo();
  assertEqual(childIds(state, "root-card"), "text-1,button-1,nested-card");
  const afterUndoButton = findComponentById(state.getDocument(), "button-1")!;
  assertEqual(afterUndoButton.id, "button-1", "button-1 ID preserved after undo.");

  // Undo mutation 1: deep-text should be gone.
  state.undo();
  assertEqual(
    findComponentById(state.getDocument(), "deep-text"),
    undefined,
    "deep-text should be gone after undo."
  );
  assertTrue(
    collectAllIds(state.getDocument()).includes("text-2"),
    "text-2 should still exist."
  );

  // Redo both mutations.
  state.redo();
  assertTrue(
    collectAllIds(state.getDocument()).includes("deep-text"),
    "deep-text should be restored after redo."
  );

  state.redo();
  assertEqual(childIds(state, "root-card"), "text-1,nested-card");
  const finalButton = findComponentById(state.getDocument(), "button-1")!;
  assertEqual(finalButton.id, "button-1", "button-1 ID preserved through all ops.");
  assertEqual(finalButton.properties.label, "Nested Button");
});

function createNestedBuilderState() {
  return createBuilderState(createNestedBuilderDocument());
}

function collectAllIds(
  document: import("../builder-document.ts").BuilderDocument
): string[] {
  const ids: string[] = [];
  function walk(instances: readonly import("../builder-document.ts").ComponentInstance[]): void {
    for (const instance of instances) {
      ids.push(instance.id);
      const children = instance.children ?? [];
      if (children.length > 0) {
        walk(children);
      }
    }
  }
  walk(document.rootInstances);
  return ids;
}

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
