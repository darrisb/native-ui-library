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

const {
  createDocumentHistory,
} = await import("../document-history.ts");
const {
  createEmptyBuilderDocument,
  addRootInstance,
} = await import("../builder-document.ts");
type BuilderDocument = import("../builder-document.ts").BuilderDocument;

function makeInstance(id: string) {
  return {
    id,
    type: "card",
    properties: { title: id },
  };
}

function makeDocument(...ids: string[]): BuilderDocument {
  let document = createEmptyBuilderDocument();
  for (const id of ids) {
    document = addRootInstance(document, makeInstance(id));
  }
  return document;
}

function documentIds(document: BuilderDocument): string {
  return document.rootInstances.map((instance) => instance.id).join(",");
}

test("Record one document change", () => {
  const initial = makeDocument("a");
  const next = makeDocument("a", "b");
  const history = createDocumentHistory(initial);
  const after = history.record(next);

  assertEqual(after.present, next);
  assertEqual(after.past.length, 1);
  assertEqual(after.past[0], initial);
  assertEqual(after.future.length, 0);
});

test("Undo restores the previous document", () => {
  const first = makeDocument("a");
  const second = makeDocument("a", "b");
  const history = createDocumentHistory(first).record(second);
  const undone = history.undo();

  assertEqual(undone.present, first);
  assertEqual(undone.past.length, 0);
  assertEqual(undone.future.length, 1);
  assertEqual(undone.future[0], second);
});

test("Redo restores the next document", () => {
  const first = makeDocument("a");
  const second = makeDocument("a", "b");
  const history = createDocumentHistory(first).record(second);
  const undone = history.undo();
  const redone = undone.redo();

  assertEqual(redone.present, second);
  assertEqual(redone.past.length, 1);
  assertEqual(redone.past[0], first);
  assertEqual(redone.future.length, 0);
});

test("New changes clear redo history", () => {
  const first = makeDocument("a");
  const second = makeDocument("a", "b");
  const third = makeDocument("a", "b", "c");
  const history = createDocumentHistory(first).record(second);
  const undone = history.undo();
  const afterNewChange = undone.record(third);

  assertEqual(afterNewChange.present, third);
  assertEqual(afterNewChange.future.length, 0);
  assertEqual(afterNewChange.canRedo, false);
});

test("Undo with empty history is a no-op", () => {
  const initial = makeDocument("a");
  const history = createDocumentHistory(initial);
  const undone = history.undo();

  assertEqual(undone, history);
  assertEqual(undone.present, initial);
  assertEqual(undone.canUndo, false);
});

test("Redo with empty history is a no-op", () => {
  const initial = makeDocument("a");
  const history = createDocumentHistory(initial);
  const redone = history.redo();

  assertEqual(redone, history);
  assertEqual(redone.present, initial);
  assertEqual(redone.canRedo, false);
});

test("History retains at most 50 past snapshots", () => {
  const initial = makeDocument("seed");
  let history = createDocumentHistory(initial);

  for (let i = 0; i < 60; i++) {
    const doc = makeDocument(`doc-${i}`);
    history = history.record(doc);
  }

  assertEqual(history.past.length, 50);
  assertEqual(documentIds(history.present), "doc-59");
});

test("Recording identical document reference is a no-op", () => {
  const initial = makeDocument("a");
  const history = createDocumentHistory(initial);
  const next = makeDocument("a", "b");
  const afterRecord = history.record(next);
  const afterRepeat = afterRecord.record(next);

  assertEqual(afterRepeat, afterRecord);
  assertEqual(afterRepeat.past.length, 1);
});

test("Original document snapshots remain unchanged", () => {
  const first = makeDocument("a");
  const second = makeDocument("a", "b");
  const firstRoots = first.rootInstances;
  const firstRootRef = firstRoots[0];

  const history = createDocumentHistory(first).record(second).undo();

  assertEqual(history.present, first);
  assertEqual(history.present.rootInstances, firstRoots);
  assertEqual(history.present.rootInstances[0], firstRootRef);
});

test("canUndo reflects past availability", () => {
  const initial = makeDocument("a");
  const next = makeDocument("a", "b");

  const emptyHistory = createDocumentHistory(initial);
  assertEqual(emptyHistory.canUndo, false);

  const withHistory = emptyHistory.record(next);
  assertEqual(withHistory.canUndo, true);

  const undone = withHistory.undo();
  assertEqual(undone.canUndo, false);
});

test("canRedo reflects future availability", () => {
  const initial = makeDocument("a");
  const next = makeDocument("a", "b");

  const noRedo = createDocumentHistory(initial).record(next);
  assertEqual(noRedo.canRedo, false);

  const withRedo = noRedo.undo();
  assertEqual(withRedo.canRedo, true);

  const redone = withRedo.redo();
  assertEqual(redone.canRedo, false);
});

test("Multiple undo and redo round trips are stable", () => {
  const doc1 = makeDocument("a");
  const doc2 = makeDocument("a", "b");
  const doc3 = makeDocument("a", "b", "c");
  const history = createDocumentHistory(doc1)
    .record(doc2)
    .record(doc3);

  const undone1 = history.undo();
  assertEqual(undone1.present, doc2);

  const undone2 = undone1.undo();
  assertEqual(undone2.present, doc1);

  const redone1 = undone2.redo();
  assertEqual(redone1.present, doc2);

  const redone2 = redone1.redo();
  assertEqual(redone2.present, doc3);
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
