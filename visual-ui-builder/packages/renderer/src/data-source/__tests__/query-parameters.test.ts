/**
 * Focused tests for query parameter support in the data source runtime.
 *
 * Covers: declarative `query` merging into the fetch URL with proper
 * URLSearchParams encoding, `updateQuery` merging/removal and single
 * re-fetch (including unknown instance ids), stale-response protection when a
 * slow earlier request resolves after a newer one, and the table
 * `page-change` / `sort-change` wiring that re-fetches with the new
 * parameters. Uses a fake fetch injected through the adapter so no real
 * network requests are issued.
 */

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

import type { ComponentInstance, DataSource } from "@visual-ui/core";
import type { FetchImpl } from "../rest-fetch-adapter.js";
import { createRestFetchAdapter } from "../rest-fetch-adapter.js";
import { DataSourceRuntime } from "../index.js";

/**
 * A minimal element stand-in with an event system. Mirrors the surface the
 * runtime touches: attribute access plus addEventListener / removeEventListener
 * / dispatchEvent for the table event wiring.
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

/**
 * A fetch impl whose responses are individually deferred, in call order.
 * `resolveNext` settles the NEWEST unresolved call with the given body, so
 * tests can make a newer request finish before an older, slower one.
 */
function deferredFetch(): {
  fetch: FetchImpl;
  urls: string[];
  resolveNext: (body: unknown) => void;
} {
  const urls: string[] = [];
  interface Deferred {
    body: unknown;
    release: () => void;
  }
  const queue: Deferred[] = [];

  const fetch: FetchImpl = (async (input) => {
    urls.push(String(input));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deferred: Deferred = { body: null, release };
    queue.push(deferred);
    await gate;
    return new Response(JSON.stringify(deferred.body), {
      status: 200,
      statusText: "OK",
    });
  }) as FetchImpl;

  return {
    fetch,
    urls,
    resolveNext: (body: unknown): void => {
      const deferred = queue.pop();
      if (deferred) {
        deferred.body = body;
        deferred.release();
      }
    },
  };
}

function restDataSource(
  url: string,
  query?: Record<string, string>,
  mapping?: Record<string, string>
): DataSource {
  return {
    type: "rest",
    method: "GET",
    url,
    ...(query ? { query } : {}),
    ...(mapping ? { mapping } : {}),
    loadOn: "mount",
  };
}

function makeInstance(
  id: string,
  type: string,
  dataSource: DataSource
): ComponentInstance {
  return {
    id,
    type,
    properties: {},
    dataSource,
    bindings: [{ target: "rows" }],
  };
}

function runtimeFor(
  fetchImpl: FetchImpl,
  overrides: { mode?: "interactive" | "edit" } = {}
): DataSourceRuntime {
  const adapter = createRestFetchAdapter({ fetchImpl });
  return new DataSourceRuntime({
    fetchAdapter: adapter,
    mode: overrides.mode ?? "interactive",
  });
}

// ---------------------------------------------------------------------------
// Declarative query merges into the URL with proper encoding
// ---------------------------------------------------------------------------

test("mount: query merges into the URL with URLSearchParams encoding", async () => {
  const { fetch, urls } = recordingFetch([{ name: "One", id: 1 }]);
  const runtime = runtimeFor(fetch);
  const element = new EventElement("ui-table");
  const instance = makeInstance(
    "q1",
    "table",
    restDataSource("https://api.example.com/items?pageSize=5&filter=active", {
      filter: "a b&c",
      q: "x y",
    })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();

  assertEqual(urls.length, 1, "Expected exactly one fetch on mount.");
  // `filter` (already in the URL) keeps its position, the declared query
  // value wins, and values are percent-encoded — never string-concatenated.
  assertEqual(
    urls[0],
    "https://api.example.com/items?pageSize=5&filter=a+b%26c&q=x+y"
  );
  assertEqual(element.getAttribute("data-ds-status"), "ready");
});

// ---------------------------------------------------------------------------
// updateQuery merges changes, removes keys on null, re-fetches once
// ---------------------------------------------------------------------------

test("updateQuery: merges changes, removes keys on null, ignores unknown ids", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);
  const element = new EventElement("ui-table");
  const instance = makeInstance(
    "q2",
    "table",
    restDataSource("https://api.example.com/t1", { a: "1", b: "2" })
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();
  assertEqual(urls.length, 1);
  assertEqual(urls[0], "https://api.example.com/t1?a=1&b=2");

  runtime.updateQuery("q2", { b: "3", c: "4" });
  await flush();
  assertEqual(urls.length, 2, "updateQuery must re-fetch exactly once.");
  assertEqual(urls[1], "https://api.example.com/t1?a=1&b=3&c=4");

  runtime.updateQuery("q2", { a: null });
  await flush();
  assertEqual(urls.length, 3, "updateQuery must re-fetch exactly once.");
  assertEqual(urls[2], "https://api.example.com/t1?b=3&c=4");

  // Unknown instance ids are ignored — no fetch, no throw.
  runtime.updateQuery("nope", { z: "9" });
  await flush();
  assertEqual(urls.length, 3, "Unknown instance id must not fetch.");
});

// ---------------------------------------------------------------------------
// A slow earlier response must not overwrite a newer one
// ---------------------------------------------------------------------------

test("stale: a slow earlier response does not overwrite a newer one", async () => {
  const { fetch, urls, resolveNext } = deferredFetch();
  const runtime = runtimeFor(fetch);
  const element = new EventElement("ui-table");
  const instance = makeInstance(
    "q3",
    "table",
    restDataSource(
      "https://api.example.com/t3",
      { page: "1" },
      { name: "name", id: "id" }
    )
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();
  assertEqual(urls.length, 1);
  assertEqual(urls[0], "https://api.example.com/t3?page=1");
  assertEqual(element.getAttribute("data-ds-status"), "loading");

  // A newer request starts while the first is still in flight.
  runtime.updateQuery("q3", { page: "2" });
  await flush();
  assertEqual(urls.length, 2);
  assertEqual(urls[1], "https://api.example.com/t3?page=2");

  // The NEWER request (page=2) finishes first.
  resolveNext([{ name: "New", id: 2 }]);
  await flush();
  assertEqual(element.getAttribute("data-ds-status"), "ready");
  assertEqual(
    element.getAttribute("data-bound-rows"),
    JSON.stringify([{ name: "New", id: 2 }])
  );

  // The older, slow request (page=1) finishes last — it must be ignored.
  resolveNext([{ name: "Old", id: 1 }]);
  await flush();
  assertEqual(element.getAttribute("data-ds-status"), "ready");
  assertEqual(
    element.getAttribute("data-bound-rows"),
    JSON.stringify([{ name: "New", id: 2 }]),
    "Stale earlier response must not overwrite the newer one."
  );
  assertEqual(urls.length, 2, "No further fetch may be issued.");
});

// ---------------------------------------------------------------------------
// Table page-change wiring
// ---------------------------------------------------------------------------

test("table: page-change triggers a fetch with limit and offset", async () => {
  const body = [{ name: "One", id: 1 }, { name: "Two", id: 2 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);
  const element = new EventElement("ui-table");
  const instance = makeInstance(
    "q4",
    "table",
    restDataSource("https://api.example.com/table")
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();
  assertEqual(urls.length, 1);
  assertEqual(urls[0], "https://api.example.com/table");

  element.dispatchEvent(
    new MockEvent("page-change", { offset: 20, limit: 10 })
  );
  await flush();

  assertEqual(urls.length, 2, "page-change must trigger exactly one fetch.");
  assertIncludes(urls[1] ?? "", "limit=10", "Fetch must carry the limit.");
  assertIncludes(urls[1] ?? "", "offset=20", "Fetch must carry the offset.");
  assertEqual(
    urls[1],
    "https://api.example.com/table?limit=10&offset=20"
  );
});

test("table: sort-change sets the sort parameter and reloads from offset 0", async () => {
  const body = [{ name: "One", id: 1 }];
  const { fetch, urls } = recordingFetch(body);
  const runtime = runtimeFor(fetch);
  const element = new EventElement("ui-table");
  const instance = makeInstance(
    "q5",
    "table",
    restDataSource("https://api.example.com/table")
  );

  runtime.mount(instance, element as unknown as HTMLElement);
  await flush();

  // Advance a page so a non-zero offset is part of the query state.
  element.dispatchEvent(
    new MockEvent("page-change", { offset: 10, limit: 10 })
  );
  await flush();
  assertEqual(urls.length, 2);

  element.dispatchEvent(new MockEvent("sort-change", { sort: "-name" }));
  await flush();

  assertEqual(urls.length, 3, "sort-change must trigger exactly one fetch.");
  assertEqual(
    urls[2],
    "https://api.example.com/table?limit=10&offset=0&sort=-name",
    "sort-change must set sort and reset the offset to the first page."
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
