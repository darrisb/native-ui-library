/**
 * Focused tests for the shared action executor.
 *
 * Verifies that valid navigate actions dispatch through the injected
 * navigation adapter, and that unsafe/invalid actions (blocked schemes,
 * unsupported types, invalid targets, edit mode) are silently ignored and
 * never reach the adapter.
 */

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

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

import type { ComponentAction, NavigateAction } from "@visual-ui/core";
import type { NavigationAdapter } from "../action/navigation-adapter.js";
import { ActionExecutor } from "../action/execute-action.js";

/** Fake navigation adapter that records calls for assertions. */
class FakeNavigationAdapter implements NavigationAdapter {
  readonly calls: Array<{ method: "navigateTo" | "openInNewWindow"; url: string }> = [];

  navigateTo(url: string): void {
    this.calls.push({ method: "navigateTo", url });
  }

  openInNewWindow(url: string): void {
    this.calls.push({ method: "openInNewWindow", url });
  }

  reset(): void {
    this.calls.length = 0;
  }
}

function navigateAction(
  overrides: Partial<NavigateAction> = {}
): ComponentAction {
  return {
    id: "action-1",
    event: "click",
    type: "navigate",
    config: { url: "https://example.com", target: "_self" },
    ...overrides,
  } as ComponentAction;
}

// ---------------------------------------------------------------------------
// Valid navigate actions
// ---------------------------------------------------------------------------

test("valid https navigate calls navigateTo with _self target", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(navigateAction(), undefined, {} as HTMLElement);
  assertEqual(adapter.calls.length, 1);
  assertDeepEqual(adapter.calls[0], {
    method: "navigateTo",
    url: "https://example.com",
  });
});

test("valid http navigate calls navigateTo", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "http://example.com" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "http://example.com");
});

test("valid mailto navigate calls navigateTo", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "mailto:hello@example.com" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "mailto:hello@example.com");
});

test("valid tel navigate calls navigateTo", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "tel:+1234567890" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "tel:+1234567890");
});

test("relative URL navigate calls navigateTo", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "/about" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "/about");
});

test("_blank target calls openInNewWindow", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({
      config: { url: "https://example.com", target: "_blank" },
    }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 1);
  assertDeepEqual(adapter.calls[0], {
    method: "openInNewWindow",
    url: "https://example.com",
  });
});

test("missing target defaults to navigateTo (_self)", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "https://example.com" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
});

// ---------------------------------------------------------------------------
// Edit mode blocks all actions
// ---------------------------------------------------------------------------

test("edit mode: valid action is not dispatched", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({
    navigationAdapter: adapter,
    isEditMode: true,
  });
  executor.execute(navigateAction(), undefined, {} as HTMLElement);
  assertEqual(adapter.calls.length, 0, "No navigation should occur in edit mode");
});

test("edit mode: javascript: URL is blocked (even though it would be blocked anyway)", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({
    navigationAdapter: adapter,
    isEditMode: true,
  });
  executor.execute(
    navigateAction({ config: { url: "javascript:alert(1)" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Unsafe URL schemes — blocked at execution boundary
// ---------------------------------------------------------------------------

test("javascript: URL is silently ignored (no navigation)", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "javascript:alert(1)" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("JAVASCRIPT: URL (uppercase) is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "JAVASCRIPT:alert(1)" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("data: URL is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "data:text/html,<h1>hi</h1>" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("vbscript: URL is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "vbscript:MsgBox" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("file: URL is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "file:///etc/passwd" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("obfuscated javascript: (leading whitespace) is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "  javascript:alert(1)" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("obfuscated javascript: (tab) is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "\tjavascript:alert(1)" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Unsupported action types
// ---------------------------------------------------------------------------

test("unknown action type is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  const unknownAction = {
    id: "a",
    event: "click",
    type: "runScript",
    config: {},
  } as unknown as ComponentAction;
  executor.execute(unknownAction, undefined, {} as HTMLElement);
  assertEqual(adapter.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Invalid targets
// ---------------------------------------------------------------------------

test("invalid target _top is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({
      config: { url: "https://example.com", target: "_top" as never },
    }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("invalid target _parent is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({
      config: { url: "https://example.com", target: "_parent" as never },
    }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Malformed / edge cases
// ---------------------------------------------------------------------------

test("empty URL is silently ignored", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  executor.execute(
    navigateAction({ config: { url: "" } }),
    undefined,
    {} as HTMLElement
  );
  assertEqual(adapter.calls.length, 0);
});

test("executor does not throw on null-ish action", () => {
  const adapter = new FakeNavigationAdapter();
  const executor = new ActionExecutor({ navigationAdapter: adapter });
  let threw = false;
  try {
    executor.execute(null as unknown as ComponentAction, undefined, {} as HTMLElement);
  } catch {
    threw = true;
  }
  assertTrue(!threw, "Executor should not throw on null action.");
  assertEqual(adapter.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

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
