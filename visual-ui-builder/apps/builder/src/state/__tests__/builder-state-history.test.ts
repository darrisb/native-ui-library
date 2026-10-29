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
  ComponentRegistry: HistoryComponentRegistry,
  registerSampleDefinitions: HistoryRegisterSampleDefinitions,
} = await import("@visual-ui/core");

const historyRegistry = new HistoryComponentRegistry();
HistoryRegisterSampleDefinitions(historyRegistry);

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

function rootIds(state: ReturnType<typeof createBuilderState>): string {
  return state
    .getDocument()
    .rootInstances.map((instance) => instance.id)
    .join(",");
}

// -----------------------------------------------------------------------------
// Undo component insertion.
// -----------------------------------------------------------------------------

test("Undo component insertion reverts the document", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);

  assertEqual(rootIds(state), "card-1,card-2");
  assertTrue(state.canUndo(), "Should be able to undo insertion.");

  state.undo();
  assertEqual(rootIds(state), "card-1");
});

// -----------------------------------------------------------------------------
// Undo component deletion.
// -----------------------------------------------------------------------------

test("Undo component deletion restores the removed subtree", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  state.deleteComponent("text-1");
  assertEqual(
    findComponentById(state.getDocument(), "text-1"),
    undefined,
    "text-1 should be deleted."
  );

  state.undo();
  const restored = findComponentById(state.getDocument(), "text-1");
  assertTrue(restored !== undefined, "text-1 should be restored.");
  assertEqual(restored!.properties.content, "Nested text content");
});

// -----------------------------------------------------------------------------
// Undo component movement.
// -----------------------------------------------------------------------------

test("Undo component movement restores the original position", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  state.moveComponent("nested-card", null, 0, historyRegistry);
  assertEqual(rootIds(state), "nested-card,root-card");

  state.undo();
  assertEqual(rootIds(state), "root-card");

  const root = findComponentById(state.getDocument(), "root-card")!;
  const childIds = root.children!.map((child) => child.id).join(",");
  assertEqual(childIds, "text-1,button-1,nested-card");
});

// -----------------------------------------------------------------------------
// Undo component property update.
// -----------------------------------------------------------------------------

test("Undo component property update restores original properties", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1", { title: "Original" }));

  state.updateInstanceProperties("card-1", { title: "Updated" }, historyRegistry);
  assertEqual(
    state.getDocument().rootInstances[0].properties.title,
    "Updated"
  );

  state.undo();
  assertEqual(
    state.getDocument().rootInstances[0].properties.title,
    "Original"
  );
});

// -----------------------------------------------------------------------------
// Redo previously undone changes.
// -----------------------------------------------------------------------------

test("Redo previously undone insertion re-applies the change", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);

  state.undo();
  assertEqual(rootIds(state), "card-1");
  assertTrue(state.canRedo(), "Should be able to redo.");

  state.redo();
  assertEqual(rootIds(state), "card-1,card-2");
});

test("Redo previously undone deletion re-applies the change", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  state.deleteComponent("text-1");
  state.undo();
  assertTrue(
    findComponentById(state.getDocument(), "text-1") !== undefined,
    "text-1 should be restored after undo."
  );

  state.redo();
  assertEqual(
    findComponentById(state.getDocument(), "text-1"),
    undefined,
    "text-1 should be deleted again after redo."
  );
});

test("Redo previously undone movement re-applies the change", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  state.moveComponent("nested-card", null, 0, historyRegistry);
  state.undo();
  assertEqual(rootIds(state), "root-card");

  state.redo();
  assertEqual(rootIds(state), "nested-card,root-card");
});

// -----------------------------------------------------------------------------
// Selection-only changes do not create history.
// -----------------------------------------------------------------------------

test("Selection-only changes do not create additional history", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));

  // One mutation means canUndo is already true.
  assertTrue(state.canUndo(), "History exists from addRootInstance.");

  // Selection changes must not add additional undo points.
  const undoCountBefore = getUndoCounts(state);
  state.selectInstance("card-1");
  const undoCountAfter = getUndoCounts(state);
  assertEqual(undoCountBefore, undoCountAfter, "Selection must not grow history.");
});

test("Selection does not affect canRedo", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);
  state.undo();

  assertTrue(state.canRedo(), "Redo available before selection change.");
  state.selectInstance("card-1");
  assertTrue(state.canRedo(), "Selection does not clear redo history.");
});

// -----------------------------------------------------------------------------
// Rejected operations do not create history.
// -----------------------------------------------------------------------------

test("Rejected insertion does not add a new history entry", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const undoCountBefore = getUndoCounts(state);

  let threw = false;
  try {
    state.insertRootInstance(createCardInstance("bad"), 5, historyRegistry);
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected out-of-range index to throw.");
  assertEqual(getUndoCounts(state), undoCountBefore);
});

test("Rejected property update does not add a new history entry", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const undoCountBefore = getUndoCounts(state);

  let threw = false;
  try {
    state.updateInstanceProperties(
      "card-1",
      { padding: "invalid" as unknown as number },
      historyRegistry
    );
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected invalid property to throw.");
  assertEqual(getUndoCounts(state), undoCountBefore);
});

test("Rejected move does not add a new history entry", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const undoCountBefore = getUndoCounts(state);

  let threw = false;
  try {
    state.moveComponent("text-1", null, 0, historyRegistry);
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected Text root move to throw.");
  assertEqual(getUndoCounts(state), undoCountBefore);
});

// -----------------------------------------------------------------------------
// New mutations after undo clear redo.
// -----------------------------------------------------------------------------

test("New mutations after undo clear redo history", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);

  state.undo();
  assertTrue(state.canRedo(), "Redo available after undo.");

  state.insertRootInstance(createCardInstance("card-3"), 1, historyRegistry);
  assertTrue(!state.canRedo(), "Redo should be cleared after new mutation.");
});

test("New mutation after undo preserves only linear history", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);

  state.undo();
  state.insertRootInstance(createCardInstance("card-3"), 1, historyRegistry);

  assertEqual(rootIds(state), "card-1,card-3");
  state.undo();
  assertEqual(rootIds(state), "card-1");
  state.undo();
  assertEqual(rootIds(state), "");
});

// -----------------------------------------------------------------------------
// Subscriber notifications remain correct.
// -----------------------------------------------------------------------------

test("Undo notifies document subscribers exactly once", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);

  let documentCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });

  state.undo();
  assertEqual(documentCalls, 1);
});

test("Redo notifies document subscribers exactly once", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);
  state.undo();

  let documentCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });

  state.redo();
  assertEqual(documentCalls, 1);
});

test("Unavailable undo does not notify subscribers", () => {
  const state = createBuilderState();
  // No mutations yet - nothing to undo.

  let documentCalls = 0;
  let selectionCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });

  state.undo();
  assertEqual(documentCalls, 0);
  assertEqual(selectionCalls, 0);
});

test("Unavailable redo does not notify subscribers", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  // No undo yet - nothing to redo.

  let documentCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });

  state.redo();
  assertEqual(documentCalls, 0);
});

test("Undo after multiple mutations notifies subscribers for each call", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);
  state.insertRootInstance(createCardInstance("card-3"), 2, historyRegistry);

  let documentCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });

  state.undo();
  assertEqual(documentCalls, 1);
  assertEqual(rootIds(state), "card-1,card-2");

  state.undo();
  assertEqual(documentCalls, 2);
  assertEqual(rootIds(state), "card-1");
});

test("Existing document mutations still notify subscribers once", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));

  let documentCalls = 0;
  let selectionCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });

  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);
  assertEqual(documentCalls, 1);
  assertEqual(selectionCalls, 0);
});

// -----------------------------------------------------------------------------
// Selection is validated (kept or cleared) on undo/redo.
// -----------------------------------------------------------------------------

test("Undo preserves selection when the selected component still exists", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.selectInstance("card-2");

  // Undo the second insertion - card-2 is removed.
  state.undo();
  // Selection was card-2 but it no longer exists - should be cleared.
  assertEqual(state.getSelectedInstanceId(), null);
});

test("Undo preserves selection when the selected component still exists after undo", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");

  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);
  // Undo the insertion of card-2. card-1 still exists.
  state.undo();
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Undo clears selection when the selected component no longer exists", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.selectInstance("card-2");

  state.undo();
  assertEqual(state.getSelectedInstanceId(), null);
});

test("Undo notifies selection subscribers when selection is cleared", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.selectInstance("card-2");

  let selectionCalls = 0;
  let lastSelection: string | null = "initial";
  state.subscribeToSelection((id) => {
    selectionCalls += 1;
    lastSelection = id;
  });

  state.undo();
  assertEqual(selectionCalls, 1);
  assertEqual(lastSelection, null);
});

test("Undo does not notify selection subscribers when selection is preserved", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");

  let selectionCalls = 0;
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });

  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);
  state.undo();

  assertEqual(selectionCalls, 0, "Selection should not change.");
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Redo clears selection when the selected component no longer exists", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.selectInstance("card-2");

  state.undo();
  // Selection is now null (card-2 removed).

  state.selectInstance("card-1");
  // Now select card-1, which exists in both states.

  state.redo();
  // card-2 is back, card-1 still exists.
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

// -----------------------------------------------------------------------------
// canUndo and canRedo reflect history state.
// -----------------------------------------------------------------------------

test("canUndo is false for a fresh state with no mutations", () => {
  const state = createBuilderState();
  assertEqual(state.canUndo(), false);
});

test("canRedo is false for a fresh state", () => {
  const state = createBuilderState();
  assertEqual(state.canRedo(), false);
});

test("canUndo becomes true after a successful mutation", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  assertEqual(state.canUndo(), true);
});

test("canRedo becomes true after undo and false after redo", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertRootInstance(createCardInstance("card-2"), 1, historyRegistry);

  state.undo();
  assertEqual(state.canRedo(), true);

  state.redo();
  assertEqual(state.canRedo(), false);
});

test("Multiple undo/redo round trips are stable", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("a"));
  state.insertRootInstance(createCardInstance("b"), 1, historyRegistry);
  state.insertRootInstance(createCardInstance("c"), 2, historyRegistry);

  assertEqual(rootIds(state), "a,b,c");

  state.undo();
  assertEqual(rootIds(state), "a,b");

  state.undo();
  assertEqual(rootIds(state), "a");

  state.redo();
  assertEqual(rootIds(state), "a,b");

  state.redo();
  assertEqual(rootIds(state), "a,b,c");
});

// -----------------------------------------------------------------------------
// No-op mutations do not create history.
// -----------------------------------------------------------------------------

test("No-op move does not create history", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const undoCountBefore = getUndoCounts(state);

  // Moving text-1 to its current position is a no-op.
  state.moveComponent("text-1", "root-card", 0, historyRegistry);
  assertEqual(getUndoCounts(state), undoCountBefore);
});

test("Unknown id delete does not create history", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const undoCountBefore = getUndoCounts(state);

  state.deleteComponent("missing-id");
  assertEqual(getUndoCounts(state), undoCountBefore);
});

// -----------------------------------------------------------------------------
// Undo delete of a root with nested children restores the full subtree.
// -----------------------------------------------------------------------------

test("Undo root deletion restores nested children", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  state.deleteComponent("root-card");
  assertEqual(state.getDocument().rootInstances.length, 0);

  state.undo();
  const restored = findComponentById(state.getDocument(), "root-card");
  assertTrue(restored !== undefined, "root-card should be restored.");

  const nestedCard = findComponentById(state.getDocument(), "nested-card");
  assertTrue(nestedCard !== undefined, "nested-card should be restored.");

  const text2 = findComponentById(state.getDocument(), "text-2");
  assertTrue(text2 !== undefined, "text-2 should be restored.");
});

// -----------------------------------------------------------------------------
// Report.
// -----------------------------------------------------------------------------

/**
 * Returns a coarse history-depth indicator used to verify that rejected or
 * no-op mutations do not create new undo entries.
 */
function getUndoCounts(
  state: ReturnType<typeof createBuilderState>
): number {
  return state.canUndo() ? 1 : 0;
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
