/** Focused schema-version warning tests for REST-backed generated pages. */

import type { ComponentInstance } from "@visual-ui/core";
import { DataSourceRuntime } from "../data-source-runtime.js";
import { createRestFetchAdapter, type FetchImpl } from "../rest-fetch-adapter.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

class TestCustomEvent<T = unknown> extends Event {
  readonly detail: T;

  constructor(type: string, init: CustomEventInit<T> = {}) {
    super(type, { bubbles: init.bubbles });
    this.detail = init.detail as T;
  }
}

if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = TestCustomEvent as unknown as typeof CustomEvent;
}

function source(schemaVersion = "built-v1"): ComponentInstance {
  return {
    id: "orders-table",
    type: "table",
    properties: {},
    dataSource: {
      type: "rest",
      method: "GET",
      url: "https://api.example.com/orders",
      schemaVersion,
      loadOn: "mount",
    },
  };
}

function fetchWithVersion(schemaVersion?: string): FetchImpl {
  return async () => {
    const headers = new Headers({ "content-type": "application/json" });
    if (schemaVersion !== undefined) headers.set("X-Schema-Version", schemaVersion);
    return new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers });
  };
}

async function resolveWithVersion(schemaVersion?: string): Promise<{
  element: HTMLElement;
  events: CustomEvent<{ expected: string; actual: string }>[];
  runtime: DataSourceRuntime;
}> {
  const element = new EventTarget() as HTMLElement;
  const attributes = new Map<string, string>();
  element.setAttribute = (name, value) => attributes.set(name, value);
  element.getAttribute = (name) => attributes.get(name) ?? null;
  element.removeAttribute = (name) => { attributes.delete(name); };

  const events: CustomEvent<{ expected: string; actual: string }>[] = [];
  element.addEventListener("schema-changed", (event) => {
    events.push(event as CustomEvent<{ expected: string; actual: string }>);
  });

  const runtime = new DataSourceRuntime({
    mode: "interactive",
    fetchAdapter: createRestFetchAdapter({ fetchImpl: fetchWithVersion(schemaVersion) }),
  });
  runtime.mount(source(), element);
  await flush();
  return { element, events, runtime };
}

const stale = await resolveWithVersion("server-v2");
assert(stale.element.getAttribute("data-ds-schema") === "stale", "Different version should mark the element stale");
assert(stale.events.length === 1, "Different version should fire schema-changed once");
assert(stale.events[0]?.bubbles === true, "schema-changed should bubble");
assert(stale.events[0]?.detail.expected === "built-v1", "Event should include the expected version");
assert(stale.events[0]?.detail.actual === "server-v2", "Event should include the actual version");
assert(stale.runtime.getState("orders-table")?.status === "ready", "Stale schema data should still render");

for (const actual of ["built-v1", undefined]) {
  const current = await resolveWithVersion(actual);
  assert(current.element.getAttribute("data-ds-schema") === null, "Matching or missing version should not mark stale");
  assert(current.events.length === 0, "Matching or missing version should not fire schema-changed");
  assert(current.runtime.getState("orders-table")?.status === "ready", "Data should render normally");
}

console.log("[PASS] schema version mismatch warning and matching/missing behavior");
