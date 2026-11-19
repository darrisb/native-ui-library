/**
 * Focused tests for wiring declarative actions onto rendered components.
 *
 * Covers the input's submit action end to end: an interactive render binds a
 * `submit` listener from the component definition's event metadata, the
 * executor substitutes `{value}` from the event detail, and edit mode stays
 * inert.
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

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

class MockStyle {
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? "";
  }
}

class MockElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly style = new MockStyle();
  parentNode: MockElement | null = null;
  readonly childNodes: MockElement[] = [];

  private readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor(nodeName: string) {
    this.nodeName = nodeName.toLowerCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name.toLowerCase(), String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name.toLowerCase());
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  get children(): MockElement[] {
    return this.childNodes;
  }

  get firstElementChild(): MockElement | null {
    return this.childNodes[0] ?? null;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    const entries = this.listeners.get(type) ?? [];
    const index = entries.indexOf(listener);
    if (index !== -1) {
      entries.splice(index, 1);
    }
    this.listeners.set(type, entries);
  }

  listenerCount(type: string): number {
    return (this.listeners.get(type) ?? []).length;
  }

  fire(type: string, event: MockEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as unknown as Event);
    }
  }
}

class MockEvent {
  readonly type: string;
  readonly detail: unknown;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, detail: unknown = undefined) {
    this.type = type;
    this.detail = detail;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  class MockHTMLElement extends MockElement {}
  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => new MockElement(tagName),
  };

  globals.customElements = {
    get: (name: string): object | undefined =>
      name === "ui-input" ? {} : undefined,
    define: (): void => {},
  };
}

installMockDom();

import type { ComponentInstance, NavigateAction } from "@visual-ui/core";
import type { NavigationAdapter } from "../action/navigation-adapter.js";
import type { RendererMode } from "../types/renderer-options.js";

const { ActionExecutor } = await import("../action/execute-action.js");
const { renderComponent } = await import("../dom/render-component.js");
const { detachActionListeners } = await import("../dom/bind-action-events.js");

const { ComponentRegistry } = await import("@visual-ui/core");
const {
  NativeComponentRegistry,
  registerInput,
} = await import("@visual-ui/components");

class FakeNavigationAdapter implements NavigationAdapter {
  readonly calls: Array<{ method: "navigateTo" | "openInNewWindow"; url: string }> = [];

  navigateTo(url: string): void {
    this.calls.push({ method: "navigateTo", url });
  }

  openInNewWindow(url: string): void {
    this.calls.push({ method: "openInNewWindow", url });
  }
}

function createRegistries() {
  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerInput(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

function submitAction(
  overrides: Partial<NavigateAction> = {}
): NavigateAction {
  return {
    id: "submit-1",
    event: "submit",
    type: "navigate",
    config: { url: "/search?q={value}" },
    ...overrides,
  };
}

function focusAction(): NavigateAction {
  return {
    id: "focus-1",
    event: "focus",
    type: "navigate",
    config: { url: "/search?q={value}" },
  };
}

function searchInstance(action: NavigateAction): ComponentInstance {
  return {
    id: "input-1",
    type: "input",
    properties: { label: "Search" },
    actions: [action],
  };
}

function render(
  instance: ComponentInstance,
  mode: RendererMode,
  adapter: FakeNavigationAdapter = new FakeNavigationAdapter()
): MockElement {
  const { metadataRegistry, nativeRegistry } = createRegistries();
  return renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
    mode,
    actionExecutor: new ActionExecutor({ navigationAdapter: adapter }),
  }) as unknown as MockElement;
}

test("interactive mode binds the input's submit event", () => {
  const element = render(searchInstance(submitAction()), "interactive");
  assertEqual(element.listenerCount("submit"), 1);
});

test("interactive mode binds the input's focus event", () => {
  const element = render(searchInstance(focusAction()), "interactive");
  assertEqual(element.listenerCount("focus"), 1);
});

test("focus action navigates using the event value", () => {
  const adapter = new FakeNavigationAdapter();
  const element = render(searchInstance(focusAction()), "interactive", adapter);

  element.fire("focus", new MockEvent("focus", { value: "a b" }));

  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "/search?q=a%20b");
});

test("edit mode binds no action listeners", () => {
  const element = render(searchInstance(submitAction()), "edit");
  assertEqual(element.listenerCount("submit"), 0);
});

test("Enter submit navigates to the URL-encoded search results", () => {
  const adapter = new FakeNavigationAdapter();
  const element = render(searchInstance(submitAction()), "interactive", adapter);

  element.fire(
    "submit",
    new MockEvent("submit", { value: "a b&c" })
  );

  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "/search?q=a%20b%26c");
});

test("multiple actions bound to the same event all execute", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "input-multi",
    type: "input",
    properties: { label: "Search" },
    actions: [
      submitAction({ id: "submit-1", config: { url: "/first?q={value}" } }),
      submitAction({ id: "submit-2", config: { url: "/second?q={value}" } }),
    ],
  };
  const element = render(instance, "interactive", adapter);

  assertEqual(element.listenerCount("submit"), 1);
  element.fire("submit", new MockEvent("submit", { value: "x" }));

  assertEqual(adapter.calls.length, 2);
  assertEqual(adapter.calls[0]!.url, "/first?q=x");
  assertEqual(adapter.calls[1]!.url, "/second?q=x");
});

test("edit mode submit does not navigate", () => {
  const adapter = new FakeNavigationAdapter();
  const element = render(searchInstance(submitAction()), "edit", adapter);

  element.fire(
    "submit",
    new MockEvent("submit", { value: "a b&c" })
  );

  assertEqual(adapter.calls.length, 0);
});

test("an input with no actions binds no listeners", () => {
  const instance: ComponentInstance = {
    id: "input-plain",
    type: "input",
    properties: { label: "Search" },
  };
  const element = render(instance, "interactive");
  assertEqual(element.listenerCount("submit"), 0);
});

test("detachActionListeners removes the submit listener", () => {
  const adapter = new FakeNavigationAdapter();
  const element = render(searchInstance(submitAction()), "interactive", adapter);
  assertEqual(element.listenerCount("submit"), 1);

  detachActionListeners(element as unknown as HTMLElement);
  assertEqual(element.listenerCount("submit"), 0);

  element.fire(
    "submit",
    new MockEvent("submit", { value: "a b&c" })
  );
  assertEqual(adapter.calls.length, 0);
});

test("invalid action URLs are rejected during render", () => {
  let threw = false;
  try {
    render(
      searchInstance(
        submitAction({ config: { url: "/search/{value}" } })
      ),
      "interactive"
    );
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected render to reject a misplaced {value} token.");
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
