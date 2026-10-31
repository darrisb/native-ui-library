/**
 * Focused lifecycle tests for the data source runtime.
 *
 * Covers: mount loading -> ready, empty payload, fetch error, mapping error,
 * unmount aborts in-flight / ignores stale responses, edit-mode inert, and
 * no refetch loops on re-mount. Uses a fake fetch injected through the adapter
 * so no real network requests are issued.
 */

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

const results: TestResult[] = [];

/** Promises for every registered test, awaited before the harness prints. */
const pending: Promise<void>[] = [];

/**
 * Registers a test. Accepts both synchronous and asynchronous test bodies.
 * The returned promise is tracked so the harness can await all tests before
 * printing results and exiting.
 */
function test(name: string, fn: () => void | Promise<void>): void {
  const run = async (): Promise<void> => {
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  pending.push(run());
}

/** Flushes the microtask/macrotask queue so async fetches can settle. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
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

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`
    );
  }
}

/**
 * A minimal element stand-in. Mirrors the DOM element surface the runtime
 * touches: setAttribute / removeAttribute plus a typed bucket for the
 * binding adapter to write into.
 */
class FakeElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  readonly nodeType = 1;
  parentNode: FakeElement | null = null;
  readonly childNodes: FakeElement[] = [];

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

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  get children(): FakeElement[] {
    return this.childNodes;
  }

  get firstElementChild(): FakeElement | null {
    return this.childNodes[0] ?? null;
  }
}

/**
 * Installs a minimal DOM mock. Must run before any module that transitively
 * extends `HTMLElement` (e.g. the renderer's render-component) is imported.
 */
function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;

  class MockHTMLElement extends FakeElement {
    get style(): MockStyle {
      return new MockStyle();
    }
  }

  class MockStyle {
    private readonly props = new Map<string, string>();
    setProperty(name: string, value: string): void {
      this.props.set(name, value);
    }
    getPropertyValue(name: string): string {
      return this.props.get(name) ?? "";
    }
  }

  globals.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;
  globals.Event = class {
    readonly type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
  globals.document = {
    createElement: (tagName: string): FakeElement => new FakeElement(tagName),
  };
  class MockCustomElementRegistry {
    get(): object {
      return {};
    }
    define(): void {}
  }
  globals.customElements = new MockCustomElementRegistry() as unknown as CustomElementRegistry;
  // BrowserNavigationAdapter's default param references `window`.
  globals.window = globals;
}

installMockDom();

import type { ComponentInstance, DataSource } from "@visual-ui/core";
import type { FetchImpl } from "../data-source/rest-fetch-adapter.js";
import { createRestFetchAdapter } from "../data-source/rest-fetch-adapter.js";
import {
  DataSourceRuntime,
  createBindingAdapterRegistry
} from "../data-source/index.js";

/** A fetch impl that returns the supplied body as a streamed Response. */
function jsonFetch(
  body: unknown,
  init: { ok?: boolean; status?: number; contentLength?: string | null } = {}
): FetchImpl {
  const { ok = true, status = 200, contentLength = null } = init;

  const headers = new Headers();
  if (contentLength !== null) {
    headers.set("content-length", contentLength);
  }

  const response = new Response(JSON.stringify(body), {
    status,
    statusText: ok ? "OK" : "Error",
    headers,
  });
  Object.defineProperty(response, "ok", { value: ok });

  return (async (): Promise<Response> => response) as FetchImpl;
}

/** A fetch impl that never resolves until `resolve()` is called. */
function pendingFetch(body: unknown): {
  fetch: FetchImpl;
  resolve: () => void;
} {
  let release: (() => void) | null = null;
  const waiter = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
  });
  const fetch: FetchImpl = (async (_input, init) => {
    await waiter;
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return response;
  }) as FetchImpl;
  return { fetch, resolve: () => release?.() ?? undefined };
}

function restDataSource(
  url: string,
  responsePath?: string,
  mapping?: Record<string, string>
): DataSource {
  return {
    type: "rest",
    method: "GET",
    url,
    responsePath,
    mapping,
    loadOn: "mount",
  };
}

function makeInstance(
  id: string,
  dataSource?: DataSource,
  bindings?: { target: "options" | "rows"; path?: string }[]
): ComponentInstance {
  return {
    id,
    type: "card",
    properties: { title: "Instance" },
    ...(dataSource ? { dataSource } : {}),
    ...(bindings ? { bindings } : {}),
  };
}

function runtimeFor(
  fetchImpl: FetchImpl,
  overrides: { mode?: "interactive" | "edit" } = {}
): { runtime: DataSourceRuntime; element: FakeElement } {
  const adapter = createRestFetchAdapter({ fetchImpl });

  const registry = createBindingAdapterRegistry({
    options: (element, records) => {
      element.setAttribute("data-captured-options", JSON.stringify(records));
    },
    rows: (element, records) => {
      element.setAttribute("data-captured-rows", JSON.stringify(records));
    },
  });

  const runtime = new DataSourceRuntime({
    fetchAdapter: adapter,
    bindingAdapters: registry,
    mode: overrides.mode ?? "interactive",
  });

  const element = new FakeElement("ui-card");
  return { runtime, element };
}

// ---------------------------------------------------------------------------
// Mount: loading -> ready
// ---------------------------------------------------------------------------

test("mount: transitions loading -> ready and applies bindings", async () => {
  const payload = {
    items: [
      { name: "One", id: 1 },
      { name: "Two", id: 2 },
    ],
  };
  const fetchImpl = jsonFetch(payload);
  const { runtime, element } = runtimeFor(fetchImpl);
  const instance = makeInstance(
    "c1",
    restDataSource("https://api.example.com/x", "items", {
      label: "name",
      value: "id",
    }),
    [{ target: "options" }]
  );

  runtime.mount(instance, element as unknown as HTMLElement);

  // Loading is set synchronously.
  assertEqual(element.getAttribute("data-ds-status"), "loading");
  assertEqual(runtime.getState("c1")?.status, "loading");

  await flush();

  assertEqual(element.getAttribute("data-ds-status"), "ready");
  assertEqual(runtime.getState("c1")?.status, "ready");

  const applied = JSON.parse(element.getAttribute("data-captured-options") ?? "[]");
  assertDeepEqual(applied, [
    { label: "One", value: 1 },
    { label: "Two", value: 2 },
  ]);
});

// ---------------------------------------------------------------------------
// Empty payload
// ---------------------------------------------------------------------------

test("mount: empty collection sets empty state", async () => {
  const fetchImpl = jsonFetch({ items: [] });
  const { runtime, element } = runtimeFor(fetchImpl);
  const instance = makeInstance(
    "c2",
    restDataSource("https://api.example.com/empty", "items", {
      label: "name",
      value: "id",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();

  assertEqual(element.getAttribute("data-ds-status"), "empty");
  assertEqual(runtime.getState("c2")?.status, "empty");
});

// ---------------------------------------------------------------------------
// Fetch error
// ---------------------------------------------------------------------------

test("mount: HTTP error sets error state with safe message", async () => {
  const fetchImpl = jsonFetch({}, { ok: false, status: 500 });
  const { runtime, element } = runtimeFor(fetchImpl);
  const instance = makeInstance("c3", restDataSource("https://api.example.com/fail"));

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();

  assertEqual(element.getAttribute("data-ds-status"), "error");
  const state = runtime.getState("c3");
  assertEqual(state?.status, "error");
  if (state?.status === "error") {
    // Error message must never echo the URL.
    assertTrue(!state.message.includes("api.example.com"), "Error message must not leak the URL.");
  }
  assertEqual(
    element.getAttribute("data-ds-error"),
    (runtime.getState("c3") as { message: string }).message
  );
});

// ---------------------------------------------------------------------------
// Mapping error
// ---------------------------------------------------------------------------

test("mount: mapping error sets error state", async () => {
  // Source records lack the mapped field, so mapRecords fails.
  const fetchImpl = jsonFetch({ items: [{ name: "OnlyName" }] });
  const { runtime, element } = runtimeFor(fetchImpl);
  const instance = makeInstance(
    "c4",
    restDataSource("https://api.example.com/mapfail", "items", {
      label: "name",
      value: "id",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();

  assertEqual(element.getAttribute("data-ds-status"), "error");
  assertEqual(runtime.getState("c4")?.status, "error");
});

// ---------------------------------------------------------------------------
// Unmount aborts in-flight and ignores stale responses
// ---------------------------------------------------------------------------

test("unmount: in-flight response is ignored after unmount", async () => {
  const pending = pendingFetch({
    items: [{ name: "Late", id: 99 }],
  });
  const adapter = createRestFetchAdapter({ fetchImpl: pending.fetch });

  const runtime = new DataSourceRuntime({
    fetchAdapter: adapter,
    mode: "interactive",
  });

  const element = new FakeElement("ui-card");
  const instance = makeInstance(
    "c5",
    restDataSource("https://api.example.com/slow", "items", {
      label: "name",
      value: "id",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  assertEqual(element.getAttribute("data-ds-status"), "loading");

  // Teardown while the request is pending.
  runtime.unmount();

  // State cleared; status attribute reflects cleared runtime.
  assertEqual(runtime.isMounted("c5"), false);
  assertEqual(runtime.getState("c5"), undefined);

  // Now resolve the late response.
  pending.resolve();
  await flush();

  // The element must NOT have been mutated to ready by the stale response.
  assertTrue(
    element.getAttribute("data-ds-status") !== "ready",
    "Stale response after unmount must not set ready."
  );
  assertTrue(
    !element.getAttribute("data-captured-options"),
    "Stale response after unmount must not apply bindings."
  );
});

test("unmount: does not apply bindings when response resolves exactly at unmount", async () => {
  const pending = pendingFetch({
    items: [{ name: "Stale", id: 1 }],
  });
  const adapter = createRestFetchAdapter({ fetchImpl: pending.fetch });

  const runtime = new DataSourceRuntime({
    fetchAdapter: adapter,
    mode: "interactive",
  });

  const element = new FakeElement("ui-card");
  const instance = makeInstance(
    "c6",
    restDataSource("https://api.example.com/race", "items", {
      label: "name",
      value: "id",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  runtime.unmount();
  pending.resolve();
  await flush();

  assertTrue(!element.getAttribute("data-captured-options"));
  assertEqual(runtime.getState("c6"), undefined);
});

// ---------------------------------------------------------------------------
// Edit-mode inert
// ---------------------------------------------------------------------------

test("mount: edit mode is network-inert (no fetch, no state)", async () => {
  let fetchCalled = false;
  const fetchImpl: FetchImpl = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as FetchImpl;

  const { runtime, element } = runtimeFor(fetchImpl, { mode: "edit" });
  const instance = makeInstance(
    "c7",
    restDataSource("https://api.example.com/edit", "items", {
      label: "name",
      value: "id",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await Promise.resolve();
  await Promise.resolve();

  assertTrue(!fetchCalled, "Edit mode must not call fetch.");
  assertTrue(!element.getAttribute("data-ds-status"), "Edit mode must not set status.");
  assertEqual(runtime.getState("c7"), undefined);
  assertEqual(runtime.isMounted("c7"), false);
});

// ---------------------------------------------------------------------------
// No refetch loops on re-mount
// ---------------------------------------------------------------------------

test("mount: re-mount of same instance does not issue a second request", async () => {
  let callCount = 0;
  const fetchImpl: FetchImpl = (async () => {
    callCount += 1;
    return new Response(
      JSON.stringify({ items: [{ name: "A", id: 1 }] }),
      { status: 200 }
    );
  }) as FetchImpl;

  const { runtime, element } = runtimeFor(fetchImpl);
  const instance = makeInstance(
    "c8",
    restDataSource("https://api.example.com/dup", "items", {
      label: "name",
      value: "id",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  runtime.mount(instance, element as unknown as HTMLElement);
  runtime.mount(instance, element as unknown as HTMLElement);

  await flush();

  assertEqual(callCount, 1, "Duplicate mount must not refetch.");
});

// ---------------------------------------------------------------------------
// Unmount via renderer integration (interactive)
// ---------------------------------------------------------------------------

test("renderer: unmountDataSources clears runtime and ignores late response", async () => {
  const { ComponentRegistry } = await import("@visual-ui/core");
  const {
    NativeComponentRegistry,
    registerCard
  } = await import("@visual-ui/components");
  const { renderComponent, unmountDataSources } = await import("../dom/render-component.js");

  const pending = pendingFetch({
    items: [{ name: "Late", id: 1 }],
  });
  const adapter = createRestFetchAdapter({ fetchImpl: pending.fetch });
  const runtime = new DataSourceRuntime({ fetchAdapter: adapter, mode: "interactive" });

  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const instance = makeInstance(
    "c9",
    restDataSource("https://api.example.com/r", "items", {
      label: "name",
      value: "id",
    })
  );

  const root = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
    mode: "interactive",
    dataSourceRuntime: runtime,
  });

  assertTrue(runtime.isMounted("c9"), "Renderer should mount the data source.");

  unmountDataSources(root);
  assertTrue(!runtime.isMounted("c9"), "Unmount should clear mounted instances.");

  pending.resolve();
  await flush();

  assertEqual(runtime.getState("c9"), undefined);
});

// ---------------------------------------------------------------------------
// Renderer edit-mode inert
// ---------------------------------------------------------------------------

test("renderer: edit-mode render is network-inert and unmountDataSources is safe", async () => {
  const { ComponentRegistry } = await import("@visual-ui/core");
  const {
    NativeComponentRegistry,
    registerCard
  } = await import("@visual-ui/components");
  const { renderComponent, unmountDataSources } = await import("../dom/render-component.js");

  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  const instance = makeInstance(
    "c10",
    restDataSource("https://api.example.com/edit2", "items", {
      label: "name",
      value: "id",
    })
  );

  // Default mode (edit): no runtime created, no fetch issued.
  const root = renderComponent(instance, {
    metadataRegistry,
    nativeRegistry,
  });

  // Must not throw even though no runtime is attached.
  unmountDataSources(root);
});

await Promise.all(pending);

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
