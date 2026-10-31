/**
 * Focused tests for action event wiring in the recursive renderer.
 *
 * Covers: nested event isolation, no duplicate listeners, edit mode inert,
 * interactive mode dispatch.
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
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string) {
    this.type = type;
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
    get: (name: string): object | undefined => {
      const defined = new Set(["ui-card", "ui-text", "ui-button"]);
      return defined.has(name) ? {} : undefined;
    },
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

const { ComponentRegistry, registerSampleDefinitions } = await import(
  "@visual-ui/core"
);
const {
  NativeComponentRegistry,
  registerCard,
  registerText,
  registerButton,
} = await import("@visual-ui/components");

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

function createRegistries() {
  const metadataRegistry = new ComponentRegistry();
  registerSampleDefinitions(metadataRegistry);
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  registerText(metadataRegistry, nativeRegistry);
  registerButton(metadataRegistry, nativeRegistry);
  return { metadataRegistry, nativeRegistry };
}

function navigateAction(
  id: string,
  overrides: Partial<NavigateAction> = {}
): NavigateAction {
  return {
    id,
    event: "click",
    type: "navigate",
    config: { url: "https://example.com", target: "_self" },
    ...overrides,
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

// ---------------------------------------------------------------------------
// Edit mode is inert — no listeners attached, no actions dispatched
// ---------------------------------------------------------------------------

test("edit mode: no action listeners attached", () => {
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
    actions: [navigateAction("a1")],
  };
  const element = render(instance, "edit");
  assertEqual(element.listenerCount("click"), 0);
});

test("edit mode: click does not dispatch navigation", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
    actions: [navigateAction("a1")],
  };
  const element = render(instance, "edit", adapter);
  element.fire("click", new MockEvent("click"));
  assertEqual(adapter.calls.length, 0);
});

test("interactive mode without actions: no listeners attached", () => {
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
  };
  const element = render(instance, "interactive");
  assertEqual(element.listenerCount("click"), 0);
});

// ---------------------------------------------------------------------------
// Interactive mode dispatches actions through the executor
// ---------------------------------------------------------------------------

test("interactive mode: click dispatches navigate action", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
    actions: [navigateAction("a1")],
  };
  const element = render(instance, "interactive", adapter);
  assertEqual(element.listenerCount("click"), 1);
  element.fire("click", new MockEvent("click"));
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "navigateTo");
  assertEqual(adapter.calls[0]!.url, "https://example.com");
});

test("interactive mode: _blank target opens in new window", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Open", variant: "primary" },
    actions: [navigateAction("a1", { config: { url: "https://example.com", target: "_blank" } })],
  };
  const element = render(instance, "interactive", adapter);
  element.fire("click", new MockEvent("click"));
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.method, "openInNewWindow");
});

// ---------------------------------------------------------------------------
// Nested event isolation — child action does not trigger parent action
// ---------------------------------------------------------------------------

test("nested Button click does not invoke parent Card click action", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "card-1",
    type: "card",
    properties: { title: "Parent" },
    actions: [navigateAction("card-action", { config: { url: "https://parent.com" } })],
    children: [
      {
        id: "button-1",
        type: "button",
        properties: { label: "Child", variant: "primary" },
        actions: [navigateAction("button-action", { config: { url: "https://child.com" } })],
      },
    ],
  };
  const card = render(instance, "interactive", adapter);
  const button = card.firstElementChild!;

  // Click the nested button.
  const event = new MockEvent("click");
  button.fire("click", event);

  // Only the button's action should fire.
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.url, "https://child.com");

  // The child listener must have stopped propagation so the parent card's
  // listener is never invoked.
  assertTrue(event.propagationStopped, "Expected child listener to stop propagation.");
});

test("parent Card action still fires when clicking Card directly", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "card-1",
    type: "card",
    properties: { title: "Parent" },
    actions: [navigateAction("card-action", { config: { url: "https://parent.com" } })],
    children: [
      {
        id: "button-1",
        type: "button",
        properties: { label: "Child", variant: "primary" },
        actions: [navigateAction("button-action", { config: { url: "https://child.com" } })],
      },
    ],
  };
  const card = render(instance, "interactive", adapter);

  // Click the card body directly (simulated by firing on the card element).
  card.fire("click", new MockEvent("click"));
  assertEqual(adapter.calls.length, 1);
  assertEqual(adapter.calls[0]!.url, "https://parent.com");
});

// ---------------------------------------------------------------------------
// No duplicate listeners across rerenders / rebinds
// ---------------------------------------------------------------------------

test("re-rendering the same instance produces one listener per element", () => {
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
    actions: [navigateAction("a1")],
  };
  render(instance, "interactive");
  const second = render(instance, "interactive");
  assertEqual(second.listenerCount("click"), 1);
});

test("detachActionListeners removes all attached action listeners", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
    actions: [navigateAction("a1")],
  };
  const element = render(instance, "interactive", adapter);
  assertEqual(element.listenerCount("click"), 1);

  detachActionListeners(element as unknown as HTMLElement);
  assertEqual(element.listenerCount("click"), 0);

  // After detach, no action fires.
  element.fire("click", new MockEvent("click"));
  assertEqual(adapter.calls.length, 0);
});

test("detachActionListeners is safe to call with no listeners attached", () => {
  const instance: ComponentInstance = {
    id: "button-1",
    type: "button",
    properties: { label: "Click", variant: "primary" },
  };
  const element = render(instance, "interactive");
  // Should not throw.
  detachActionListeners(element as unknown as HTMLElement);
  assertEqual(element.listenerCount("click"), 0);
});

// ---------------------------------------------------------------------------
// Text (no event support) never receives action listeners
// ---------------------------------------------------------------------------

test("Text instance with actions but no event support gets no listeners", () => {
  const adapter = new FakeNavigationAdapter();
  const instance: ComponentInstance = {
    id: "text-1",
    type: "text",
    properties: { content: "Hello" },
    actions: [navigateAction("a1")],
  };
  const element = render(instance, "interactive", adapter);
  assertEqual(element.listenerCount("click"), 0);
  element.fire("click", new MockEvent("click"));
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
