/**
 * Focused tests for linking filter controls (dropdown/input) to a table.
 *
 * Covers the runtime wiring: a dropdown `change` re-fetches the target table
 * with `eq.<field>` and `offset=0`; an input filters on `change` and
 * `submit` only (never on keystrokes); an empty value removes the filter key;
 * a never-mounted target is a harmless no-op; unmount detaches the listeners.
 * Also covers the document-level validator: a valid document produces no
 * issues, while a missing or non-table target, a `contains` mode on a
 * dropdown, a malformed field, or an unknown mode each fail.
 *
 * Uses a fake fetch injected through the adapter so no real network requests
 * are issued.
 */

import type { ComponentInstance, DataSource } from "@visual-ui/core";
import { validateFilterLinks } from "@visual-ui/core";
import type { FetchImpl } from "../rest-fetch-adapter.js";
import { createRestFetchAdapter } from "../rest-fetch-adapter.js";
import { DataSourceRuntime } from "../index.js";

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

const results: TestResult[] = [];

/** Promises for every registered test, awaited before the harness prints. */
const pending: Promise<void>[] = [];

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
async function flush(times = 8): Promise<void> {
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

function assertIncludes(haystack: string, needle: string, message?: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(
      message ?? `Expected "${haystack}" to contain "${needle}".`
    );
  }
}

/**
 * A minimal element stand-in with an event system. Mirrors the surface the
 * runtime touches: attribute access plus addEventListener / removeEventListener
 * / dispatchEvent for the filter event wiring.
 */
class MockEvent {
  readonly type: string;
  readonly detail: unknown;

  constructor(type: string, detail: unknown) {
    this.type = type;
    this.detail = detail;
  }
}

type MockEventListener = (event: MockEvent) => void;

class EventElement {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, MockEventListener[]>();

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

  addEventListener(type: string, handler: MockEventListener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: MockEventListener): void {
    const list = this.listeners.get(type);
    if (!list) {
      return;
    }
    this.listeners.set(
      type,
      list.filter((entry) => entry !== handler)
    );
  }

  dispatchEvent(event: MockEvent): void {
    for (const handler of [...(this.listeners.get(event.type) ?? [])]) {
      handler(event);
    }
  }
}

/** A fetch impl that records every requested URL and returns a fixed body. */
function recordingFetch(body: unknown): {
  fetch: FetchImpl;
  urls: string[];
} {
  const urls: string[] = [];
  const response = new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
  });
  const fetch: FetchImpl = (async (input) => {
    urls.push(String(input));
    return response;
  }) as FetchImpl;
  return { fetch, urls };
}

function restDataSource(
  url: string,
  query?: Record<string, string>
): DataSource {
  return {
    type: "rest",
    method: "GET",
    url,
    ...(query ? { query } : {}),
    loadOn: "mount",
  };
}

function makeTableInstance(
  id: string,
  dataSource: DataSource
): ComponentInstance {
  return {
    id,
    type: "table",
    properties: {},
    dataSource,
    bindings: [{ target: "rows" }],
  };
}

function makeFilterInstance(
  id: string,
  type: "dropdown" | "input",
  properties: Record<string, string>
): ComponentInstance {
  return { id, type, properties };
}

function runtimeFor(fetchImpl: FetchImpl): DataSourceRuntime {
  const adapter = createRestFetchAdapter({ fetchImpl });
  return new DataSourceRuntime({
    fetchAdapter: adapter,
    mode: "interactive",
  });
}

// ---------------------------------------------------------------------------
// Dropdown selection re-fetches the target table with eq.<field> + offset 0
// ---------------------------------------------------------------------------

test("dropdown: selecting an option re-fetches the table with eq.customer_id and offset=0", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);

  const tableElement = new EventElement("ui-table");
  runtime.mount(
    makeTableInstance(
      "t1",
      restDataSource("https://api.example.com/orders")
    ),
    tableElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 1);
  assertEqual(urls[0], "https://api.example.com/orders");

  const filterElement = new EventElement("ui-dropdown");
  runtime.mount(
    makeFilterInstance("f1", "dropdown", {
      filterTarget: "t1",
      filterField: "customer_id",
      filterMode: "eq",
    }),
    filterElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 1, "Mounting the filter itself must not fetch.");

  filterElement.dispatchEvent(new MockEvent("change", { value: "c42" }));
  await flush();

  assertEqual(
    urls.length,
    2,
    "A dropdown selection must trigger exactly one fetch."
  );
  assertEqual(
    urls[1],
    "https://api.example.com/orders?eq.customer_id=c42&offset=0",
    "The fetch must carry the eq filter and reset the offset to 0."
  );
});

// ---------------------------------------------------------------------------
// Input filters on change/submit only, never on keystrokes
// ---------------------------------------------------------------------------

test("input: keystrokes do not fetch; submit filters with contains.<field>", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);

  const tableElement = new EventElement("ui-table");
  runtime.mount(
    makeTableInstance(
      "t1",
      restDataSource("https://api.example.com/orders")
    ),
    tableElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 1);

  const filterElement = new EventElement("ui-input");
  runtime.mount(
    makeFilterInstance("f1", "input", {
      filterTarget: "t1",
      filterField: "name",
      filterMode: "contains",
    }),
    filterElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 1);

  // Typing fires `input` events on every keystroke — none may fetch.
  filterElement.dispatchEvent(new MockEvent("input", { value: "a" }));
  await flush();
  assertEqual(urls.length, 1, "A keystroke must not fetch.");
  filterElement.dispatchEvent(new MockEvent("input", { value: "ab" }));
  await flush();
  assertEqual(urls.length, 1, "A keystroke must not fetch.");

  // Enter commits the search.
  filterElement.dispatchEvent(new MockEvent("submit", { value: "ab" }));
  await flush();

  assertEqual(urls.length, 2, "submit must trigger exactly one fetch.");
  assertEqual(
    urls[1],
    "https://api.example.com/orders?contains.name=ab&offset=0",
    "The fetch must carry the contains filter and reset the offset to 0."
  );
});

test("input: clearing the value removes the contains.<field> key", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);

  const tableElement = new EventElement("ui-table");
  runtime.mount(
    makeTableInstance(
      "t1",
      restDataSource("https://api.example.com/orders")
    ),
    tableElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 1);

  const filterElement = new EventElement("ui-input");
  runtime.mount(
    makeFilterInstance("f1", "input", {
      filterTarget: "t1",
      filterField: "name",
      filterMode: "contains",
    }),
    filterElement as unknown as HTMLElement
  );
  await flush();

  // Commit a value first, so the filter key exists.
  filterElement.dispatchEvent(new MockEvent("change", { value: "alpha" }));
  await flush();
  assertEqual(urls.length, 2);
  assertEqual(
    urls[1],
    "https://api.example.com/orders?contains.name=alpha&offset=0"
  );

  // Clearing the input (empty value) removes the key.
  filterElement.dispatchEvent(new MockEvent("change", { value: "" }));
  await flush();

  assertEqual(
    urls.length,
    3,
    "Clearing the input must trigger exactly one fetch."
  );
  assertEqual(
    urls[2],
    "https://api.example.com/orders?offset=0",
    "The cleared filter key must be absent and the offset reset to 0."
  );
});

test("dropdown: selecting the placeholder (empty value) removes the eq key", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);

  const tableElement = new EventElement("ui-table");
  runtime.mount(
    makeTableInstance(
      "t1",
      restDataSource("https://api.example.com/orders")
    ),
    tableElement as unknown as HTMLElement
  );
  await flush();

  const filterElement = new EventElement("ui-dropdown");
  runtime.mount(
    makeFilterInstance("f1", "dropdown", {
      filterTarget: "t1",
      filterField: "customer_id",
    }),
    filterElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 1);

  filterElement.dispatchEvent(new MockEvent("change", { value: "c42" }));
  await flush();
  assertEqual(urls.length, 2);
  assertEqual(
    urls[1],
    "https://api.example.com/orders?eq.customer_id=c42&offset=0"
  );

  // Selecting the placeholder reports an empty value -> key removed.
  filterElement.dispatchEvent(new MockEvent("change", { value: "" }));
  await flush();
  assertEqual(urls.length, 3, "Clearing the dropdown must fetch exactly once.");
  assertEqual(
    urls[2],
    "https://api.example.com/orders?offset=0",
    "The removed key must be absent and the offset reset to 0."
  );
});

// ---------------------------------------------------------------------------
// Defensive behavior: unmounted target, teardown
// ---------------------------------------------------------------------------

test("filter: a target that is never mounted is a harmless no-op", async () => {
  const { fetch, urls } = recordingFetch([]);
  const runtime = runtimeFor(fetch);

  const filterElement = new EventElement("ui-dropdown");
  runtime.mount(
    makeFilterInstance("f1", "dropdown", {
      filterTarget: "missing",
      filterField: "customer_id",
    }),
    filterElement as unknown as HTMLElement
  );
  await flush();
  assertEqual(urls.length, 0, "A filter alone must not fetch.");

  filterElement.dispatchEvent(new MockEvent("change", { value: "c42" }));
  await flush();
  assertEqual(
    urls.length,
    0,
    "An unmounted target must not cause a fetch or a throw."
  );
});

test("unmount: detaches filter listeners so later changes do not fetch", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);

  const tableElement = new EventElement("ui-table");
  runtime.mount(
    makeTableInstance(
      "t1",
      restDataSource("https://api.example.com/orders")
    ),
    tableElement as unknown as HTMLElement
  );
  await flush();

  const filterElement = new EventElement("ui-input");
  runtime.mount(
    makeFilterInstance("f1", "input", {
      filterTarget: "t1",
      filterField: "name",
      filterMode: "contains",
    }),
    filterElement as unknown as HTMLElement
  );
  await flush();

  filterElement.dispatchEvent(new MockEvent("change", { value: "alpha" }));
  await flush();
  assertEqual(urls.length, 2);

  runtime.unmount();

  filterElement.dispatchEvent(new MockEvent("change", { value: "beta" }));
  await flush();
  assertEqual(
    urls.length,
    2,
    "After unmount, filter events must not fetch."
  );
});

// ---------------------------------------------------------------------------
// Document-level validation
// ---------------------------------------------------------------------------

test("validation: a valid filter document produces no issues", () => {
  const roots: ComponentInstance[] = [
    {
      id: "card1",
      type: "card",
      properties: {},
      children: [
        makeFilterInstance("d1", "dropdown", {
          filterTarget: "t1",
          filterField: "customer_id",
        }),
        makeFilterInstance("i1", "input", {
          filterTarget: "t1",
          filterField: "name",
          filterMode: "contains",
        }),
      ],
    },
    {
      id: "t1",
      type: "table",
      properties: {},
      dataSource: restDataSource("https://api.example.com/orders"),
    },
  ];

  assertEqual(validateFilterLinks(roots).length, 0);
});

test("validation: a filter target that is missing or not a table fails", () => {
  const roots: ComponentInstance[] = [
    // Target id does not exist anywhere in the document.
    makeFilterInstance("f1", "input", {
      filterTarget: "nope",
      filterField: "name",
      filterMode: "contains",
    }),
    // Target exists but is a button, not a table.
    makeFilterInstance("f2", "dropdown", {
      filterTarget: "btn1",
      filterField: "customer_id",
    }),
    { id: "btn1", type: "button", properties: {} },
  ];

  const issues = validateFilterLinks(roots);
  assertEqual(issues.length, 2, "Both bad targets must be reported.");
  assertIncludes(issues[0].path, "f1.properties.filterTarget");
  assertIncludes(issues[0].message, "nope");
  assertIncludes(issues[0].message, "table");
  assertIncludes(issues[1].path, "f2.properties.filterTarget");
  assertIncludes(issues[1].message, "btn1");
});

test("validation: contains on a dropdown, a bad field, and an unknown mode fail", () => {
  const roots: ComponentInstance[] = [
    { id: "t1", type: "table", properties: {} },
    makeFilterInstance("d1", "dropdown", {
      filterTarget: "t1",
      filterField: "customer_id",
      filterMode: "contains",
    }),
    makeFilterInstance("i1", "input", {
      filterTarget: "t1",
      filterField: "9bad",
      filterMode: "fuzzy",
    }),
  ];

  const issues = validateFilterLinks(roots);
  assertEqual(issues.length, 3, "Each invalid property must be reported.");

  const byPath = new Map(issues.map((issue) => [issue.path, issue.message]));
  assertIncludes(
    byPath.get("d1.properties.filterMode") ?? "",
    "contains",
    "A dropdown must not be allowed to use contains."
  );
  assertIncludes(
    byPath.get("i1.properties.filterField") ?? "",
    "[A-Za-z_][A-Za-z0-9_]{0,127}",
    "A malformed field must be rejected."
  );
  assertIncludes(
    byPath.get("i1.properties.filterMode") ?? "",
    "eq, contains",
    "An unknown mode must be rejected."
  );
});

test("validation: a control without a filter target is inert", () => {
  const roots: ComponentInstance[] = [
    // Empty filterTarget: no link declared, so even the odd field passes.
    makeFilterInstance("d1", "dropdown", {
      filterTarget: "",
      filterField: "whatever",
    }),
  ];

  assertEqual(
    validateFilterLinks(roots).length,
    0,
    "An inert control must produce no issues."
  );
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
