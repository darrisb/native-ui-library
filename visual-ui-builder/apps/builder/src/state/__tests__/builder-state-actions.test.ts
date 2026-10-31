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
const {
  ComponentRegistry: ActionsComponentRegistry,
  registerSampleDefinitions: ActionsRegisterSampleDefinitions,
} = await import("@visual-ui/core");

const actionsRegistry = new ActionsComponentRegistry();
ActionsRegisterSampleDefinitions(actionsRegistry);

function createCardWithActions(
  id: string,
  actions: readonly import("@visual-ui/core").ComponentAction[] = []
): import("@visual-ui/core").ComponentInstance {
  return {
    id,
    type: "card",
    properties: { title: "Hello", padding: 16, backgroundColor: "#ffffff" },
    actions: actions.length > 0 ? actions : undefined,
  };
}

test("updateInstanceActions adds a navigate action", () => {
  const state = createBuilderState();
  const instance = createCardWithActions("card-1");
  state.addRootInstance(instance);

  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com", target: "_self" },
  };

  state.updateInstanceActions("card-1", [action], actionsRegistry);

  const updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.actions!.length, 1);
  assertEqual(updated.actions![0].id, "click-navigate");
  assertEqual(updated.actions![0].config.url, "https://example.com");
});

test("updateInstanceActions replaces the full action list", () => {
  const initialAction: import("@visual-ui/core").NavigateAction = {
    id: "initial",
    event: "click",
    type: "navigate",
    config: { url: "https://initial.com" },
  };
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1", [initialAction]));

  const replacement: import("@visual-ui/core").NavigateAction = {
    id: "replacement",
    event: "click",
    type: "navigate",
    config: { url: "https://replaced.com" },
  };

  state.updateInstanceActions("card-1", [replacement], actionsRegistry);

  const updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.actions!.length, 1);
  assertEqual(updated.actions![0].id, "replacement");
});

test("updateInstanceActions removes actions by passing empty array", () => {
  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1", [action]));

  state.updateInstanceActions("card-1", [], actionsRegistry);

  const updated = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(updated.actions!.length, 0);
});

test("updateInstanceActions throws for invalid URL scheme", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));

  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "javascript:alert(1)" },
  };

  let threw = false;
  try {
    state.updateInstanceActions("card-1", [action], actionsRegistry);
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : "";
    assertTrue(
      message.includes("url") || message.includes("scheme"),
      `Expected URL validation error, got: ${message}`
    );
  }
  assertTrue(threw, "Expected invalid URL scheme to throw.");
});

test("updateInstanceActions throws for empty URL", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));

  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "" },
  };

  let threw = false;
  try {
    state.updateInstanceActions("card-1", [action], actionsRegistry);
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected empty URL to throw.");
});

test("updateInstanceActions throws for unknown event", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));

  const action = {
    id: "click-navigate",
    event: "unknown",
    type: "navigate",
    config: { url: "https://example.com" },
  } as unknown as import("@visual-ui/core").NavigateAction;

  let threw = false;
  try {
    state.updateInstanceActions("card-1", [action], actionsRegistry);
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : "";
    assertTrue(
      message.includes("event") || message.includes("unknown"),
      `Expected event validation error, got: ${message}`
    );
  }
  assertTrue(threw, "Expected unknown event to throw.");
});

test("updateInstanceActions throws for unknown instance", () => {
  const state = createBuilderState();
  let threw = false;
  try {
    state.updateInstanceActions(
      "missing-id",
      [],
      actionsRegistry
    );
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : "";
    assertTrue(message.includes("does not exist"));
  }
  assertTrue(threw, "Expected unknown instance to throw.");
});

test("updateInstanceActions does not mutate on failure", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));
  const beforeDocument = state.getDocument();

  const badAction: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "javascript:alert(1)" },
  };

  try {
    state.updateInstanceActions("card-1", [badAction], actionsRegistry);
  } catch {
    // Expected.
  }

  assertEqual(state.getDocument(), beforeDocument);
  const instance = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(instance.actions, undefined);
});

test("updateInstanceActions is immutable", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));
  const beforeDocument = state.getDocument();

  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };

  state.updateInstanceActions("card-1", [action], actionsRegistry);
  const afterDocument = state.getDocument();

  assertTrue(beforeDocument !== afterDocument, "Document reference should change.");
  assertTrue(
    beforeDocument.rootInstances !== afterDocument.rootInstances,
    "Root array should change."
  );
});

test("undo after action update restores previous actions", () => {
  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1", [action]));

  // Clear actions.
  state.updateInstanceActions("card-1", [], actionsRegistry);
  let instance = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(instance.actions!.length, 0);

  // Undo to restore the action.
  state.undo();
  instance = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(instance.actions!.length, 1);
  assertEqual(instance.actions![0].id, "click-navigate");
});

test("redo after undo restores cleared actions", () => {
  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1", [action]));

  // Clear actions.
  state.updateInstanceActions("card-1", [], actionsRegistry);

  // Undo (restore action).
  state.undo();

  // Redo (clear again).
  state.redo();
  const instance = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(instance.actions!.length, 0);
});

test("action update records history and clears redo", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));

  const action1: import("@visual-ui/core").NavigateAction = {
    id: "a1",
    event: "click",
    type: "navigate",
    config: { url: "https://first.com" },
  };
  state.updateInstanceActions("card-1", [action1], actionsRegistry);

  assertTrue(state.canUndo());
  assertTrue(!state.canRedo());

  // Undo once.
  state.undo();
  assertTrue(state.canRedo());

  // New mutation clears redo.
  const action2: import("@visual-ui/core").NavigateAction = {
    id: "a2",
    event: "click",
    type: "navigate",
    config: { url: "https://second.com" },
  };
  state.updateInstanceActions("card-1", [action2], actionsRegistry);
  assertTrue(!state.canRedo());
});

test("action update preserves selection", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));
  state.selectInstance("card-1");

  const action: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com" },
  };
  state.updateInstanceActions("card-1", [action], actionsRegistry);

  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("failed action update does not affect selection", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));
  state.selectInstance("card-1");

  const badAction: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "javascript:alert(1)" },
  };

  try {
    state.updateInstanceActions("card-1", [badAction], actionsRegistry);
  } catch {
    // Expected.
  }

  assertEqual(state.getSelectedInstanceId(), "card-1");
});

test("multiple actions can be added and edited", () => {
  const state = createBuilderState();
  state.addRootInstance(createCardWithActions("card-1"));

  const action1: import("@visual-ui/core").NavigateAction = {
    id: "click-navigate",
    event: "click",
    type: "navigate",
    config: { url: "https://one.com" },
  };
  const action2: import("@visual-ui/core").NavigateAction = {
    id: "focus-navigate",
    event: "focus",
    type: "navigate",
    config: { url: "https://two.com" },
  };

  state.updateInstanceActions("card-1", [action1, action2], actionsRegistry);

  const instance = findComponentById(state.getDocument(), "card-1")!;
  assertEqual(instance.actions!.length, 2);
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
