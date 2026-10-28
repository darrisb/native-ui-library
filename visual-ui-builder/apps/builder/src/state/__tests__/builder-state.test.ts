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
const {
  createEmptyBuilderDocument,
  findComponentById,
  findComponentLocationById,
  moveComponentById,
  updateComponentById,
} = await import("../builder-document.ts");
type BuilderDocument = import("../builder-document.ts").BuilderDocument;
const { createNestedBuilderDocument } = await import(
  "../../fixtures/nested-document.ts"
);

const createSampleInstance = (id: string) => ({
  id,
  type: "card",
  properties: { title: "Hello" },
});

test("Initial document is empty", () => {
  const state = createBuilderState();
  assertEqual(state.getDocument().rootInstances.length, 0);
});

test("Adding an instance appends it to the document", () => {
  const state = createBuilderState();
  const instance = createSampleInstance("card-1");
  state.addRootInstance(instance);
  assertEqual(state.getDocument().rootInstances.length, 1);
  assertEqual(state.getDocument().rootInstances[0].id, "card-1");
});

test("Multiple instances preserve insertion order", () => {
  const state = createBuilderState();
  state.addRootInstance(createSampleInstance("card-1"));
  state.addRootInstance(createSampleInstance("card-2"));
  state.addRootInstance(createSampleInstance("card-3"));
  const ids = state.getDocument().rootInstances.map((instance) => instance.id);
  assertEqual(ids.join(","), "card-1,card-2,card-3");
});

test("State updates are immutable", () => {
  const state = createBuilderState();
  const before = state.getDocument();
  state.addRootInstance(createSampleInstance("card-1"));
  const after = state.getDocument();
  assertTrue(before !== after, "Document reference should change.");
  assertTrue(
    before.rootInstances !== after.rootInstances,
    "Root instances array should change."
  );
  assertEqual(before.rootInstances.length, 0);
  assertEqual(after.rootInstances.length, 1);
});

test("Subscribers receive updates", () => {
  const state = createBuilderState();
  const calls: number[] = [];
  state.subscribe(() => {
    calls.push(state.getDocument().rootInstances.length);
  });
  state.addRootInstance(createSampleInstance("card-1"));
  state.addRootInstance(createSampleInstance("card-2"));
  assertEqual(calls.length, 2);
  assertEqual(calls[0], 1);
  assertEqual(calls[1], 2);
});

test("Unsubscribed listeners stop receiving updates", () => {
  const state = createBuilderState();
  let calls = 0;
  const unsubscribe = state.subscribe(() => {
    calls += 1;
  });
  state.addRootInstance(createSampleInstance("card-1"));
  unsubscribe();
  state.addRootInstance(createSampleInstance("card-2"));
  assertEqual(calls, 1);
});

test("Can initialize with a non-empty document", () => {
  const document = createEmptyBuilderDocument();
  const state = createBuilderState(document);
  assertEqual(state.getDocument().rootInstances.length, 0);
});

const {
  ComponentRegistry: SelectionComponentRegistry,
  registerSampleDefinitions: SelectionRegisterSampleDefinitions,
} = await import("@visual-ui/core");

const selectionRegistry = new SelectionComponentRegistry();
SelectionRegisterSampleDefinitions(selectionRegistry);

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

test("Selecting an existing Card", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Rejecting selection of an unknown ID", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  state.selectInstance("unknown-id");
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Clearing selection", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  state.selectInstance(null);
  assertEqual(state.getSelectedInstanceId(), null);
});

test("Selecting another Card", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.selectInstance("card-1");
  state.selectInstance("card-2");
  assertEqual(state.getSelectedInstanceId(), "card-2");
});

test("Preserving selection after property updates", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  state.updateInstanceProperties(
    "card-1",
    { title: "Updated" },
    selectionRegistry
  );
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Updating Card title", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.updateInstanceProperties(
    "card-1",
    { title: "First Card" },
    selectionRegistry
  );
  assertEqual(
    state.getDocument().rootInstances[0].properties.title,
    "First Card"
  );
});

test("Updating Card padding", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.updateInstanceProperties("card-1", { padding: 24 }, selectionRegistry);
  assertEqual(state.getDocument().rootInstances[0].properties.padding, 24);
});

test("Updating Card background color", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.updateInstanceProperties(
    "card-1",
    { backgroundColor: "#ff0000" },
    selectionRegistry
  );
  assertEqual(
    state.getDocument().rootInstances[0].properties.backgroundColor,
    "#ff0000"
  );
});

test("Updating Card description", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.updateInstanceProperties(
    "card-1",
    { description: "Updated description" },
    selectionRegistry
  );
  assertEqual(
    state.getDocument().rootInstances[0].properties.description,
    "Updated description"
  );
});

test("Updating one Card description does not change another", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1", { description: "First" }));
  state.addRootInstance(createCardInstance("card-2", { description: "Second" }));
  state.updateInstanceProperties(
    "card-1",
    { description: "Updated First" },
    selectionRegistry
  );
  assertEqual(
    state.getDocument().rootInstances[0].properties.description,
    "Updated First"
  );
  assertEqual(
    state.getDocument().rootInstances[1].properties.description,
    "Second"
  );
});

test("Rejecting invalid property types", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  let threw = false;
  try {
    state.updateInstanceProperties(
      "card-1",
      { padding: "not-a-number" as unknown as number },
      selectionRegistry
    );
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected invalid property type to throw.");
});

test("Rejecting unknown properties", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  let threw = false;
  try {
    state.updateInstanceProperties(
      "card-1",
      { unknownProperty: "value" },
      selectionRegistry
    );
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected unknown property to throw.");
});

test("Preserving unrelated instances", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1", { title: "First" }));
  state.addRootInstance(createCardInstance("card-2", { title: "Second" }));
  state.updateInstanceProperties(
    "card-1",
    { title: "Updated" },
    selectionRegistry
  );
  assertEqual(
    state.getDocument().rootInstances[1].properties.title,
    "Second"
  );
});

test("Preserving instance IDs", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.updateInstanceProperties(
    "card-1",
    { title: "Updated" },
    selectionRegistry
  );
  assertEqual(state.getDocument().rootInstances[0].id, "card-1");
});

test("Ensuring updates are immutable", () => {
  const state = createBuilderState();
  const instance = createCardInstance("card-1", { title: "Original" });
  state.addRootInstance(instance);
  const beforeDocument = state.getDocument();
  const beforeInstance = beforeDocument.rootInstances[0];
  const beforeProperties = beforeInstance.properties;

  state.updateInstanceProperties(
    "card-1",
    { title: "Updated" },
    selectionRegistry
  );

  const afterDocument = state.getDocument();
  const afterInstance = afterDocument.rootInstances[0];
  const afterProperties = afterInstance.properties;

  assertTrue(beforeDocument !== afterDocument, "Document reference changed.");
  assertTrue(
    beforeDocument.rootInstances !== afterDocument.rootInstances,
    "Root instances array changed."
  );
  assertTrue(beforeInstance !== afterInstance, "Instance reference changed.");
  assertTrue(
    beforeProperties !== afterProperties,
    "Properties reference changed."
  );
  assertEqual(instance.properties.title, "Original");
});

test("Ensuring failed validation does not mutate state", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1", { title: "Original" }));
  const beforeDocument = state.getDocument();

  try {
    state.updateInstanceProperties(
      "card-1",
      { padding: "bad" as unknown as number },
      selectionRegistry
    );
  } catch {
    // Expected.
  }

  assertEqual(state.getDocument(), beforeDocument);
});

test("Ensuring document subscribers receive successful updates", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  let receivedTitle: string | null = null;
  state.subscribe((document) => {
    receivedTitle = document.rootInstances[0].properties.title as string;
  });
  state.updateInstanceProperties(
    "card-1",
    { title: "Notified" },
    selectionRegistry
  );
  assertEqual(receivedTitle, "Notified");
});

test("Selection subscribers receive updates", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const calls: (string | null)[] = [];
  state.subscribeToSelection((id) => {
    calls.push(id);
  });
  state.selectInstance("card-1");
  state.selectInstance(null);
  assertEqual(calls.length, 2);
  assertEqual(calls[0], "card-1");
  assertEqual(calls[1], null);
});

test("Selecting the same instance again is harmless", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  let calls = 0;
  state.subscribeToSelection(() => {
    calls += 1;
  });
  state.selectInstance("card-1");
  state.selectInstance("card-1");
  assertEqual(calls, 1);
});

test("Adding a new Card does not clear selection", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  state.addRootInstance(createCardInstance("card-2"));
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

function insertedIds(state: ReturnType<typeof createBuilderState>): string {
  return state
    .getDocument()
    .rootInstances.map((instance) => instance.id)
    .join(",");
}

function expectInsertThrows(fn: () => void, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assertTrue(threw, message);
}

test("Inserting into an empty document", () => {
  const state = createBuilderState();
  state.insertRootInstance(createCardInstance("card-1"), 0, selectionRegistry);
  assertEqual(insertedIds(state), "card-1");
});

test("Inserting at index zero places the instance first", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.insertRootInstance(createCardInstance("new"), 0, selectionRegistry);
  assertEqual(insertedIds(state), "new,card-1,card-2");
});

test("Inserting between existing Cards", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.insertRootInstance(createCardInstance("new"), 1, selectionRegistry);
  assertEqual(insertedIds(state), "card-1,new,card-2");
});

test("Inserting at the current length appends", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.addRootInstance(createCardInstance("card-2"));
  state.insertRootInstance(createCardInstance("new"), 2, selectionRegistry);
  assertEqual(insertedIds(state), "card-1,card-2,new");
});

test("Rejecting negative insertion indices", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const before = state.getDocument();
  expectInsertThrows(
    () => state.insertRootInstance(createCardInstance("new"), -1, selectionRegistry),
    "Expected negative index to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Rejecting out-of-range and non-integer insertion indices", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const before = state.getDocument();
  for (const index of [2, 99, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expectInsertThrows(
      () => state.insertRootInstance(createCardInstance("new"), index, selectionRegistry),
      `Expected index ${String(index)} to throw.`
    );
  }
  assertEqual(state.getDocument(), before);
});

test("Rejecting invalid instances on insertion", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertRootInstance(
        { id: "bad", type: "card", properties: { padding: "wide" } },
        0,
        selectionRegistry
      ),
    "Expected invalid property type to throw."
  );
  expectInsertThrows(
    () =>
      state.insertRootInstance(
        { id: "bad", type: "unknown", properties: {} },
        0,
        selectionRegistry
      ),
    "Expected unknown type to throw."
  );
  expectInsertThrows(
    () => state.insertRootInstance(createCardInstance("card-1"), 0, selectionRegistry),
    "Expected duplicate id to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Insertion preserves existing instance IDs and objects", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1", { title: "First" }));
  state.addRootInstance(createCardInstance("card-2", { title: "Second" }));
  const [first, second] = state.getDocument().rootInstances;
  state.insertRootInstance(createCardInstance("new"), 1, selectionRegistry);
  const after = state.getDocument().rootInstances;
  assertEqual(after[0], first);
  assertEqual(after[2], second);
  assertEqual(after[0].properties.title, "First");
  assertEqual(after[2].properties.title, "Second");
});

test("Insertion produces new immutable snapshots", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  const before = state.getDocument();
  const beforeRoots = before.rootInstances;
  state.insertRootInstance(createCardInstance("new"), 0, selectionRegistry);
  const after = state.getDocument();
  assertTrue(before !== after, "Document reference should change.");
  assertTrue(beforeRoots !== after.rootInstances, "Roots array should change.");
  assertEqual(beforeRoots.length, 1);
  assertEqual(beforeRoots[0].id, "card-1");
  assertEqual(after.rootInstances.length, 2);
});

test("Insertion notifies document subscribers exactly once", () => {
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
  state.insertRootInstance(createCardInstance("new"), 0, selectionRegistry);
  assertEqual(documentCalls, 1);
  assertEqual(selectionCalls, 0);
});

test("Failed insertion notifies nobody and keeps selection", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  let documentCalls = 0;
  let selectionCalls = 0;
  state.subscribe(() => {
    documentCalls += 1;
  });
  state.subscribeToSelection(() => {
    selectionCalls += 1;
  });
  expectInsertThrows(
    () => state.insertRootInstance(createCardInstance("new"), 5, selectionRegistry),
    "Expected out-of-range index to throw."
  );
  assertEqual(documentCalls, 0);
  assertEqual(selectionCalls, 0);
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Successful insertion does not alter selection", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.selectInstance("card-1");
  state.insertRootInstance(createCardInstance("new"), 0, selectionRegistry);
  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("Rejecting Text insertion at the root", () => {
  const state = createBuilderState();
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertRootInstance(
        { id: "text-1", type: "text", properties: { content: "" } },
        0,
        selectionRegistry
      ),
    "Expected Text root insertion to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Rejecting Button insertion at the root", () => {
  const state = createBuilderState();
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertRootInstance(
        { id: "button-1", type: "button", properties: { label: "Button" } },
        0,
        selectionRegistry
      ),
    "Expected Button root insertion to throw."
  );
  assertEqual(state.getDocument(), before);
});

// -----------------------------------------------------------------------------
// Nested component lookup and updates.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Nested insertion.
// -----------------------------------------------------------------------------

test("Inserting into an empty Card", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardInstance("card-1"));
  state.insertChildInstance(
    "card-1",
    { id: "text-1", type: "text", properties: { content: "Hello" } },
    0,
    selectionRegistry
  );
  const card = state.getDocument().rootInstances[0];
  assertEqual(card.children!.length, 1);
  assertEqual(card.children![0].id, "text-1");
});

test("Inserting Card, Text, and Button into a Card", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const rootId = "root-card";

  state.insertChildInstance(
    rootId,
    { id: "new-card", type: "card", properties: { title: "New" } },
    3,
    selectionRegistry
  );
  state.insertChildInstance(
    rootId,
    { id: "new-text", type: "text", properties: { content: "New" } },
    4,
    selectionRegistry
  );
  state.insertChildInstance(
    rootId,
    { id: "new-button", type: "button", properties: { label: "New" } },
    5,
    selectionRegistry
  );

  const root = findComponentById(state.getDocument(), rootId)!;
  assertEqual(root.children!.length, 6);
  assertEqual(root.children![3].type, "card");
  assertEqual(root.children![4].type, "text");
  assertEqual(root.children![5].type, "button");
});

test("Inserting into a deeply nested Card", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.insertChildInstance(
    "nested-card",
    { id: "deep-text", type: "text", properties: { content: "Deep" } },
    0,
    selectionRegistry
  );
  const nested = findComponentById(state.getDocument(), "nested-card")!;
  assertEqual(nested.children!.length, 2);
  assertEqual(nested.children![0].id, "deep-text");
  assertEqual(nested.children![1].id, "text-2");
});

test("Nested insertion at beginning, middle, and end preserves order", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const rootId = "root-card";

  state.insertChildInstance(
    rootId,
    { id: "first", type: "text", properties: { content: "First" } },
    0,
    selectionRegistry
  );
  state.insertChildInstance(
    rootId,
    { id: "middle", type: "text", properties: { content: "Middle" } },
    2,
    selectionRegistry
  );
  state.insertChildInstance(
    rootId,
    { id: "last", type: "text", properties: { content: "Last" } },
    5,
    selectionRegistry
  );

  const root = findComponentById(state.getDocument(), rootId)!;
  const ids = root.children!.map((child) => child.id);
  assertEqual(ids.join(","), "first,text-1,middle,button-1,nested-card,last");
});

test("Nested insertion preserves unrelated references", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const beforeText1 = findComponentById(state.getDocument(), "text-1")!;
  const beforeNestedCard = findComponentById(
    state.getDocument(),
    "nested-card"
  )!;
  const beforeText2 = findComponentById(state.getDocument(), "text-2")!;

  state.insertChildInstance(
    "root-card",
    { id: "new-text", type: "text", properties: { content: "New" } },
    0,
    selectionRegistry
  );

  const afterDocument = state.getDocument();
  assertEqual(findComponentById(afterDocument, "text-1"), beforeText1);
  assertEqual(findComponentById(afterDocument, "nested-card"), beforeNestedCard);
  assertEqual(findComponentById(afterDocument, "text-2"), beforeText2);
});

test("Nested insertion is immutable", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const beforeDocument = state.getDocument();
  const beforeRoot = beforeDocument.rootInstances[0];

  state.insertChildInstance(
    "root-card",
    { id: "new-text", type: "text", properties: { content: "New" } },
    0,
    selectionRegistry
  );

  const afterDocument = state.getDocument();
  assertTrue(beforeDocument !== afterDocument);
  assertTrue(beforeDocument.rootInstances !== afterDocument.rootInstances);
  assertTrue(beforeRoot !== afterDocument.rootInstances[0]);
  assertEqual(beforeRoot.children!.length, 3);
});

test("Nested insertion rejects unknown parents", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertChildInstance(
        "missing-id",
        { id: "new-text", type: "text", properties: { content: "New" } },
        0,
        selectionRegistry
      ),
    "Expected unknown parent to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Nested insertion rejects Text as parent", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertChildInstance(
        "text-1",
        { id: "new-text", type: "text", properties: { content: "New" } },
        0,
        selectionRegistry
      ),
    "Expected Text parent to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Nested insertion rejects Button as parent", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertChildInstance(
        "button-1",
        { id: "new-text", type: "text", properties: { content: "New" } },
        0,
        selectionRegistry
      ),
    "Expected Button parent to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Nested insertion rejects invalid indices", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  for (const index of [-1, 4, 0.5, Number.NaN]) {
    expectInsertThrows(
      () =>
        state.insertChildInstance(
          "root-card",
          { id: `new-${String(index)}`, type: "text", properties: { content: "New" } },
          index,
          selectionRegistry
        ),
      `Expected index ${String(index)} to throw.`
    );
  }
  assertEqual(state.getDocument(), before);
});

test("Nested insertion rejects duplicate ids", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertChildInstance(
        "root-card",
        { id: "text-1", type: "text", properties: { content: "New" } },
        0,
        selectionRegistry
      ),
    "Expected duplicate id to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Nested insertion validates the instance", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectInsertThrows(
    () =>
      state.insertChildInstance(
        "root-card",
        { id: "bad-text", type: "text", properties: { unknownProp: "x" } },
        0,
        selectionRegistry
      ),
    "Expected invalid instance to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Nested insertion notifies document subscribers exactly once", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  let calls = 0;
  state.subscribe(() => {
    calls += 1;
  });
  state.insertChildInstance(
    "root-card",
    { id: "new-text", type: "text", properties: { content: "New" } },
    0,
    selectionRegistry
  );
  assertEqual(calls, 1);
});

// -----------------------------------------------------------------------------
// Nested component lookup and updates.
// -----------------------------------------------------------------------------

test("Finding a root component by ID", () => {
  const document = createNestedBuilderDocument();
  const found = findComponentById(document, "root-card");
  assertTrue(found !== undefined, "Expected to find root-card.");
  assertEqual(found!.id, "root-card");
  assertEqual(found!.type, "card");
});

test("Finding a direct child by ID", () => {
  const document = createNestedBuilderDocument();
  const found = findComponentById(document, "text-1");
  assertTrue(found !== undefined, "Expected to find text-1.");
  assertEqual(found!.id, "text-1");
  assertEqual(found!.type, "text");
});

test("Finding a deeply nested child by ID", () => {
  const document = createNestedBuilderDocument();
  const found = findComponentById(document, "text-2");
  assertTrue(found !== undefined, "Expected to find text-2.");
  assertEqual(found!.id, "text-2");
  assertEqual(found!.type, "text");
});

test("Missing ID handling in findComponentById", () => {
  const document = createNestedBuilderDocument();
  const found = findComponentById(document, "missing-id");
  assertEqual(found, undefined);
});

test("Selecting a nested component through state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-1");
  assertEqual(state.getSelectedInstanceId(), "text-1");
});

test("Selecting a deeply nested component through state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-2");
  assertEqual(state.getSelectedInstanceId(), "text-2");
});

test("Selecting a nested Button through state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("button-1");
  assertEqual(state.getSelectedInstanceId(), "button-1");
});

test("Selecting a nested Card through state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("nested-card");
  assertEqual(state.getSelectedInstanceId(), "nested-card");
});

test("Rejecting selection of an unknown nested ID", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-1");
  state.selectInstance("missing-id");
  assertEqual(state.getSelectedInstanceId(), "text-1");
});

test("Immutable nested property update through state", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const beforeDocument = state.getDocument();
  const beforeRoot = beforeDocument.rootInstances[0];
  const beforeText = findComponentById(beforeDocument, "text-1")!;

  state.updateInstanceProperties(
    "text-1",
    { content: "Updated text" },
    selectionRegistry
  );

  const afterDocument = state.getDocument();
  const afterText = findComponentById(afterDocument, "text-1")!;

  assertTrue(beforeDocument !== afterDocument, "Document reference changed.");
  assertTrue(
    beforeDocument.rootInstances !== afterDocument.rootInstances,
    "Root array changed."
  );
  assertTrue(beforeRoot !== afterDocument.rootInstances[0], "Root changed.");
  assertTrue(beforeText !== afterText, "Text instance changed.");
  assertEqual(afterText.properties.content, "Updated text");
});

test("Preserving sibling order during nested updates", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.updateInstanceProperties(
    "button-1",
    { label: "Updated Button" },
    selectionRegistry
  );

  const root = state.getDocument().rootInstances[0];
  const childIds = root.children!.map((child) => child.id);
  assertEqual(childIds.join(","), "text-1,button-1,nested-card");
});

test("Preserving unrelated component references during nested updates", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const beforeText1 = findComponentById(state.getDocument(), "text-1")!;
  const beforeNestedCard = findComponentById(state.getDocument(), "nested-card")!;
  const beforeText2 = findComponentById(state.getDocument(), "text-2")!;

  state.updateInstanceProperties(
    "button-1",
    { label: "Updated Button" },
    selectionRegistry
  );

  const afterDocument = state.getDocument();
  assertEqual(findComponentById(afterDocument, "text-1"), beforeText1);
  assertEqual(findComponentById(afterDocument, "nested-card"), beforeNestedCard);
  assertEqual(findComponentById(afterDocument, "text-2"), beforeText2);
});

test("Nested update preserves parent-child relationships", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.updateInstanceProperties(
    "text-2",
    { content: "Updated nested text" },
    selectionRegistry
  );

  const nestedCard = findComponentById(state.getDocument(), "nested-card")!;
  assertEqual(nestedCard.children!.length, 1);
  assertEqual(nestedCard.children![0].id, "text-2");
  assertEqual(
    nestedCard.children![0].properties.content,
    "Updated nested text"
  );
});

test("Nested update validates against metadata", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  let threw = false;
  try {
    state.updateInstanceProperties(
      "button-1",
      { disabled: "not-a-boolean" as unknown as boolean },
      selectionRegistry
    );
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected invalid boolean property to throw.");
});

test("Nested update does not mutate original document on failure", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const beforeDocument = state.getDocument();
  try {
    state.updateInstanceProperties(
      "button-1",
      { disabled: "not-a-boolean" as unknown as boolean },
      selectionRegistry
    );
  } catch {
    // Expected.
  }
  assertEqual(state.getDocument(), beforeDocument);
});

test("updateComponentById returns original document when id is missing", () => {
  const document = createNestedBuilderDocument();
  const updated = updateComponentById(document, "missing-id", (instance) => ({
    ...instance,
    properties: { ...instance.properties },
  }));
  assertEqual(updated, document);
});

// -----------------------------------------------------------------------------
// Component movement.
// -----------------------------------------------------------------------------

function childIds(document: BuilderDocument, parentId: string): string {
  const parent = findComponentById(document, parentId);
  return parent?.children?.map((child) => child.id).join(",") ?? "";
}

function rootIds(document: BuilderDocument): string {
  return document.rootInstances.map((instance) => instance.id).join(",");
}

function expectMoveThrows(fn: () => void, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assertTrue(threw, message);
}

test("Moving a root Card reorders root instances", () => {
  const document = createNestedBuilderDocument();
  const state = createBuilderState(document);

  // Document contains [root-card]. Add two more root Cards first.
  state.addRootInstance(createCardInstance("card-a"));
  state.addRootInstance(createCardInstance("card-b"));
  assertEqual(rootIds(state.getDocument()), "root-card,card-a,card-b");

  state.moveComponent("root-card", null, 1, selectionRegistry);
  assertEqual(rootIds(state.getDocument()), "card-a,root-card,card-b");
});

test("Moving a nested sibling forward within the same Card", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  // text-1 is at index 0; move it after button-1 (index 2 in post-removal array).
  state.moveComponent("text-1", "root-card", 2, selectionRegistry);
  assertEqual(childIds(state.getDocument(), "root-card"), "button-1,nested-card,text-1");
});

test("Moving a nested sibling backward within the same Card", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  // nested-card is at index 2; move it before text-1 (visual index 0).
  state.moveComponent("nested-card", "root-card", 0, selectionRegistry);
  assertEqual(childIds(state.getDocument(), "root-card"), "nested-card,text-1,button-1");
});

test("Moving a component from one Card to another", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.addRootInstance(createCardInstance("second-card"));

  state.moveComponent("text-1", "second-card", 0, selectionRegistry);
  assertEqual(childIds(state.getDocument(), "root-card"), "button-1,nested-card");
  assertEqual(childIds(state.getDocument(), "second-card"), "text-1");
});

test("Moving a nested Card to the root canvas", () => {
  const state = createBuilderState(createNestedBuilderDocument());

  state.moveComponent("nested-card", null, 0, selectionRegistry);
  assertEqual(rootIds(state.getDocument()), "nested-card,root-card");
  assertEqual(childIds(state.getDocument(), "root-card"), "text-1,button-1");
});

test("Moving a root Card into another Card", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.addRootInstance(createCardInstance("second-card"));

  state.moveComponent("second-card", "root-card", 0, selectionRegistry);
  assertEqual(rootIds(state.getDocument()), "root-card");
  assertEqual(
    childIds(state.getDocument(), "root-card"),
    "second-card,text-1,button-1,nested-card"
  );
});

test("Moving preserves subtree, ids, and properties", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const beforeNested = findComponentById(state.getDocument(), "nested-card")!;
  const beforeText2 = findComponentById(state.getDocument(), "text-2")!;

  state.moveComponent("nested-card", null, 0, selectionRegistry);
  const afterDocument = state.getDocument();

  const movedNested = findComponentById(afterDocument, "nested-card")!;
  const movedText2 = findComponentById(afterDocument, "text-2")!;

  assertEqual(movedNested, beforeNested);
  assertEqual(movedText2, beforeText2);
  assertEqual(movedNested.properties.title, "Nested Card");
  assertEqual(movedText2.properties.content, "Text inside nested card");
});

test("Move rejects moving a component into itself", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("root-card", "root-card", 0, selectionRegistry),
    "Expected move into self to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects moving a parent into one of its descendants", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("root-card", "nested-card", 0, selectionRegistry),
    "Expected move into descendant to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects Text at the root", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("text-1", null, 0, selectionRegistry),
    "Expected Text root move to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects Button at the root", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("button-1", null, 0, selectionRegistry),
    "Expected Button root move to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects destination that does not allow children", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("text-1", "text-2", 0, selectionRegistry),
    "Expected move into Text to throw."
  );
  expectMoveThrows(
    () => state.moveComponent("text-1", "button-1", 0, selectionRegistry),
    "Expected move into Button to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects unknown component id", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("missing-id", "root-card", 0, selectionRegistry),
    "Expected unknown source id to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects unknown destination parent", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  expectMoveThrows(
    () => state.moveComponent("text-1", "missing-id", 0, selectionRegistry),
    "Expected unknown destination id to throw."
  );
  assertEqual(state.getDocument(), before);
});

test("Move rejects invalid indices", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();
  for (const index of [-1, 4, 0.5, Number.NaN]) {
    expectMoveThrows(
      () => state.moveComponent("text-1", "root-card", index, selectionRegistry),
      `Expected index ${String(index)} to throw.`
    );
  }
  assertEqual(state.getDocument(), before);
});

test("Moving to the same position is a no-op", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  const before = state.getDocument();

  state.moveComponent("text-1", "root-card", 0, selectionRegistry);
  assertEqual(state.getDocument(), before);
});

test("Move notifies document subscribers exactly once", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.addRootInstance(createCardInstance("second-card"));
  let calls = 0;
  state.subscribe(() => {
    calls += 1;
  });

  state.moveComponent("text-1", "second-card", 0, selectionRegistry);
  assertEqual(calls, 1);
});

test("No-op move does not notify subscribers", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  let calls = 0;
  state.subscribe(() => {
    calls += 1;
  });

  state.moveComponent("text-1", "root-card", 0, selectionRegistry);
  assertEqual(calls, 0);
});

test("Rejected move does not notify subscribers and preserves selection", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-1");
  let calls = 0;
  state.subscribe(() => {
    calls += 1;
  });

  expectMoveThrows(
    () => state.moveComponent("text-1", null, 0, selectionRegistry),
    "Expected rejected move to throw."
  );
  assertEqual(calls, 0);
  assertEqual(state.getSelectedInstanceId(), "text-1");
});

test("Successful move preserves selection", () => {
  const state = createBuilderState(createNestedBuilderDocument());
  state.selectInstance("text-1");

  state.moveComponent("text-1", "root-card", 2, selectionRegistry);
  assertEqual(state.getSelectedInstanceId(), "text-1");
});

test("moveComponentById is immutable", () => {
  const document = createNestedBuilderDocument();
  const before = document;
  const after = moveComponentById(document, "nested-card", null, 0);

  assertTrue(after !== before);
  assertTrue(after.rootInstances !== before.rootInstances);
  assertEqual(before.rootInstances.length, 1);
  assertEqual(after.rootInstances.length, 2);
});

test("findComponentLocationById locates root and nested positions", () => {
  const document = createNestedBuilderDocument();
  assertEqual(findComponentLocationById(document, "root-card")?.parentId, null);
  assertEqual(findComponentLocationById(document, "root-card")?.index, 0);
  assertEqual(findComponentLocationById(document, "text-1")?.parentId, "root-card");
  assertEqual(findComponentLocationById(document, "text-1")?.index, 0);
  assertEqual(findComponentLocationById(document, "text-2")?.parentId, "nested-card");
  assertEqual(findComponentLocationById(document, "text-2")?.index, 0);
  assertEqual(findComponentLocationById(document, "missing-id"), undefined);
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
