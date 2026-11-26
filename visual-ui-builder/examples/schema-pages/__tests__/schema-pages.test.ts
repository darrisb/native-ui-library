import graphJson from "../graph.json" with { type: "json" };

interface Result { readonly name: string; readonly error?: string }
const results: Result[] = [];
const tests: Promise<void>[] = [];

function test(name: string, run: () => void | Promise<void>): void {
  tests.push(Promise.resolve().then(run).then(
    () => { results.push({ name }); },
    (error: unknown) => { results.push({ name, error: error instanceof Error ? error.message : String(error) }); },
  ));
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

type Listener = (event: TestEvent) => void;
class TestEvent {
  constructor(readonly type: string, readonly detail: Record<string, unknown> = {}) {}
}

class EventElement {
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();
  constructor(readonly nodeName: string) {}
  setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  removeEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== listener));
  }
  dispatchEvent(event: TestEvent): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

// Component modules define native elements at module evaluation time.
(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = class {};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = TestEvent;

const { parseSchemaGraph, generateListPage } = await import("@visual-ui/schema");
const { DataSourceRuntime, createRestFetchAdapter } = await import("@visual-ui/renderer");
const { createMockFetch, MOCK_SCHEMA_VERSIONS } = await import("../main.js");

test("generated list document round-trips unchanged", () => {
  const graph = parseSchemaGraph(graphJson);
  const document = generateListPage(graph, "commerce.orders", {
    apiBaseUrl: "https://example.test",
    pageSize: 2,
    schemaVersions: MOCK_SCHEMA_VERSIONS,
  });
  const imported = JSON.parse(JSON.stringify(document)) as unknown;
  assert(JSON.stringify(imported) === JSON.stringify(document), "export/import changed the document");
});

test("mock API renders rows, filters, pages, and marks a changed schema stale", async () => {
  const graph = parseSchemaGraph(graphJson);
  const document = generateListPage(graph, "commerce.orders", {
    apiBaseUrl: "https://example.test",
    pageSize: 2,
    schemaVersions: MOCK_SCHEMA_VERSIONS,
  });
  const children = document[0]?.children ?? [];
  const dropdown = children.find((item) => item.type === "dropdown");
  const table = children.find((item) => item.type === "table");
  assert(dropdown && table, "generated page must contain a relationship dropdown and table");

  const urls: string[] = [];
  const mock = createMockFetch();
  const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    return mock(input, init);
  }) as typeof fetch;
  const runtime = new DataSourceRuntime({
    fetchAdapter: createRestFetchAdapter({ fetchImpl: recordingFetch }),
    mode: "interactive",
  });
  const dropdownElement = new EventElement("ui-dropdown");
  const tableElement = new EventElement("ui-table");
  runtime.mount(dropdown, dropdownElement as unknown as HTMLElement);
  runtime.mount(table, tableElement as unknown as HTMLElement);
  await flush();

  const firstRows = JSON.parse(tableElement.getAttribute("data-bound-rows") ?? "[]") as unknown[];
  assert(firstRows.length === 2, "the table should render the first two mock rows");

  dropdownElement.dispatchEvent(new TestEvent("change", { value: "101" }));
  await flush();
  assert(urls.some((url) => url.includes("eq.customer_id=101") && url.includes("offset=0")),
    "customer selection should fetch eq.customer_id and reset offset");

  tableElement.dispatchEvent(new TestEvent("page-change", { offset: 2, limit: 2 }));
  await flush();
  assert(urls.some((url) => url.includes("offset=2") && url.includes("limit=2")),
    "Next should fetch the next offset");

  const staleFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await mock(input, init);
    const headers = new Headers(response.headers);
    headers.set("X-Schema-Version", "commerce-v2");
    return new Response(await response.text(), { status: response.status, headers });
  }) as typeof fetch;
  const staleRuntime = new DataSourceRuntime({
    fetchAdapter: createRestFetchAdapter({ fetchImpl: staleFetch }),
    mode: "interactive",
  });
  const staleTable = new EventElement("ui-table");
  staleRuntime.mount(table, staleTable as unknown as HTMLElement);
  await flush();
  assert(staleTable.getAttribute("data-ds-schema") === "stale",
    "a different X-Schema-Version should mark the table stale");
});

await Promise.all(tests);
for (const result of results) {
  if (result.error) console.error(`FAIL ${result.name}: ${result.error}`);
  else console.log(`PASS ${result.name}`);
}
if (results.some((result) => result.error)) process.exitCode = 1;
