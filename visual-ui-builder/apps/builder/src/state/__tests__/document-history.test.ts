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

const { createDocumentHistory } = await import("../document-history.ts");
type BuilderDocument = import("../builder-document.ts").BuilderDocument;

function createDocument(tag: string): BuilderDocument {
  return {
    rootInstances: [
      {
        id: tag,
        type: "card",
        properties: { title: tag },
      },
    ],
  };
}

test("Initial history exposes the initial document without undo or redo", () => {
  const initial = createDocument("initial");
  const history = createDocumentHistory(initial);

  assertEqual(history.present, initial);
  assertEqual(history.past.length, 0);
  assertEqual(history.future.length, 0);
  assertTrue(!history.canUndo, "Fresh history should not allow undo.");
  assertTrue(!history.canRedo, "Fresh history should not allow redo.");
});

test("record moves the present into past and enables undo", () => {
  const initial = createDocument("initial");
  const next = createDocument("next");
  const history = createDocumentHistory(initial).record(next);

  assertEqual(history.present, next);
  assertEqual(history.past.length, 1);
  assertEqual(history.past[0], initial);
  assertEqual(history.future.length, 0);
  assertTrue(history.canUndo, "Recording should enable undo.");
  assertTrue(!history.canRedo, "Recording should clear redo.");
});

test("record returns the same history for an identical reference", () => {
  const initial = createDocument("initial");
  const history = createDocumentHistory(initial);
  assertEqual(history.record(initial), history);
});

test("undo restores the most recent past snapshot", () => {
  const initial = createDocument("initial");
  const first = createDocument("first");
  const second = createDocument("second");
  const history = createDocumentHistory(initial).record(first).record(second);

  const undone = history.undo();
  assertEqual(undone.present, first);
  assertEqual(undone.past.length, 1);
  assertEqual(undone.past[0], initial);
  assertEqual(undone.future.length, 1);
  assertEqual(undone.future[0], second);
  assertTrue(undone.canUndo, "Undo should remain available.");
  assertTrue(undone.canRedo, "Undo should enable redo.");
});

test("undo with no past returns the same history", () => {
  const history = createDocumentHistory(createDocument("initial"));
  assertEqual(history.undo(), history);
});

test("redo restores the nearest future snapshot", () => {
  const initial = createDocument("initial");
  const next = createDocument("next");
  const history = createDocumentHistory(initial).record(next);
  const undone = history.undo();

  const redone = undone.redo();
  assertEqual(redone.present, next);
  assertEqual(redone.past.length, 1);
  assertEqual(redone.past[0], initial);
  assertEqual(redone.future.length, 0);
  assertTrue(redone.canUndo, "Redo should restore undo availability.");
  assertTrue(!redone.canRedo, "Redo should consume the future entry.");
});

test("redo with no future returns the same history", () => {
  const history = createDocumentHistory(createDocument("initial"));
  assertEqual(history.redo(), history);
});

test("Recording a new document after undo clears the redo future", () => {
  const initial = createDocument("initial");
  const undone = createDocumentHistory(initial)
    .record(createDocument("undone"))
    .undo();

  assertTrue(undone.canRedo, "Expected redo to be available before re-recording.");
  const recorded = undone.record(createDocument("new"));

  assertEqual(recorded.future.length, 0);
  assertTrue(!recorded.canRedo, "A new mutation should discard the redo future.");
  assertEqual(recorded.past.length, 1);
  assertEqual(recorded.past[0], initial);
});

test("replacePresent updates the present without adding a past entry", () => {
  const initial = createDocument("initial");
  const first = createDocument("first");
  const second = createDocument("second");
  const history = createDocumentHistory(initial)
    .record(first)
    .replacePresent(second);

  assertEqual(history.present, second);
  assertEqual(history.past.length, 1);
  assertEqual(history.past[0], initial);
  assertEqual(history.future.length, 0);
  assertTrue(history.canUndo);
});

test("replacePresent preserves the redo future", () => {
  const initial = createDocument("initial");
  const undone = createDocumentHistory(initial)
    .record(createDocument("undone"))
    .undo();

  const replaced = undone.replacePresent(createDocument("replaced"));
  assertEqual(replaced.present.rootInstances[0].id, "replaced");
  assertEqual(replaced.past.length, 0);
  assertEqual(replaced.future.length, 1);
  assertTrue(replaced.canRedo, "replacePresent should not clear the future.");
});

test("replacePresent returns the same history for an identical reference", () => {
  const initial = createDocument("initial");
  const history = createDocumentHistory(initial);
  assertEqual(history.replacePresent(initial), history);
});

test("Past history is capped at MAX_PAST_HISTORY entries", () => {
  const documents = Array.from({ length: 52 }, (_value, index) =>
    createDocument(`doc-${String(index)}`)
  );

  let history = createDocumentHistory(documents[0]);
  for (let index = 1; index < documents.length; index += 1) {
    history = history.record(documents[index]);
  }

  assertEqual(history.past.length, 50);
  assertEqual(history.present, documents[51]);

  for (let count = 0; count < 50; count += 1) {
    history = history.undo();
  }

  assertEqual(
    history.present,
    documents[1],
    "The oldest snapshot should have been dropped by the cap."
  );
  assertTrue(!history.canUndo, "No past entries should remain after 50 undos.");
  assertTrue(history.canRedo, "Undone snapshots should be redoable.");
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
