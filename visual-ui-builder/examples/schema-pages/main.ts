import { ComponentRegistry, type ComponentInstance } from "@visual-ui/core";
import {
  NativeComponentRegistry,
  registerCard,
  registerDropdown,
  registerInput,
  registerTable,
} from "@visual-ui/components";
import { generateListPage, parseSchemaGraph, type SchemaVersions } from "@visual-ui/schema";
import {
  DataSourceRuntime,
  createRestFetchAdapter,
  renderComponent,
} from "@visual-ui/renderer";
import graphJson from "./graph.json" with { type: "json" };

export const MOCK_SCHEMA_VERSIONS: SchemaVersions = {
  commerce: "commerce-v1",
  crm: "crm-v1",
};

const MOCK_CUSTOMERS = [
  { id: 101, name: "Acme Corp" },
  { id: 102, name: "Globex Inc" },
];

const MOCK_ORDERS = [
  { id: 1001, customer_id: 101, status: "ready", total: 125.5 },
  { id: 1002, customer_id: 102, status: "shipped", total: 89 },
  { id: 1003, customer_id: 101, status: "pending", total: 42.25 },
  { id: 1004, customer_id: 102, status: "ready", total: 240 },
];

/** A deterministic, read-only Schema to Entity data API used by the example. */
export function createMockFetch(): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input), "https://schema-pages.local");
    const parts = url.pathname.split("/").filter(Boolean);
    const source = parts[2] ?? "";
    const entity = parts[3];

    if (parts[0] !== "api" || parts[1] !== "data") {
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    }

    if (entity === undefined) {
      return new Response(JSON.stringify({ schemaVersion: MOCK_SCHEMA_VERSIONS[source] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let items: Array<Record<string, string | number>> = entity === "customers"
      ? [...MOCK_CUSTOMERS]
      : [...MOCK_ORDERS];
    const customer = url.searchParams.get("eq.customer_id");
    if (customer !== null) {
      items = items.filter((item) => String(item.customer_id) === customer);
    }
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "25");
    items = items.slice(offset, offset + limit);

    return new Response(JSON.stringify({ items, total: items.length }), {
      headers: {
        "Content-Type": "application/json",
        "X-Schema-Version": MOCK_SCHEMA_VERSIONS[source] ?? "unknown",
      },
    });
  }) as typeof fetch;
}

async function loadSchemaVersions(
  apiBaseUrl: string,
  sources: readonly string[],
  fetchImpl: typeof fetch,
): Promise<SchemaVersions> {
  const entries = await Promise.all(sources.map(async (source) => {
    const url = new URL(`/api/data/${encodeURIComponent(source)}`, apiBaseUrl);
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Could not read schema version for ${source}`);
    const body = await response.json() as { schemaVersion?: unknown };
    if (typeof body.schemaVersion !== "string") {
      throw new Error(`Missing schemaVersion for ${source}`);
    }
    return [source, body.schemaVersion] as const;
  }));
  return Object.fromEntries(entries);
}

export interface RenderSchemaPageOptions {
  readonly container: HTMLElement;
  readonly apiBaseUrl: string;
  readonly fetchImpl: typeof fetch;
  readonly pageSize?: number;
}

/** Parse the graph, generate its read-only list document, and render it. */
export async function renderSchemaPage(options: RenderSchemaPageOptions): Promise<ComponentInstance[]> {
  const graph = parseSchemaGraph(graphJson);
  const schemaVersions = await loadSchemaVersions(options.apiBaseUrl, graph.sources, options.fetchImpl);
  const document = generateListPage(graph, "commerce.orders", {
    apiBaseUrl: options.apiBaseUrl,
    pageSize: options.pageSize ?? 2,
    schemaVersions,
  });

  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);
  registerDropdown(metadataRegistry, nativeRegistry);
  registerInput(metadataRegistry, nativeRegistry);
  registerTable(metadataRegistry, nativeRegistry);

  const runtime = new DataSourceRuntime({
    fetchAdapter: createRestFetchAdapter({ fetchImpl: options.fetchImpl }),
    mode: "interactive",
  });
  options.container.replaceChildren();
  for (const instance of document) {
    options.container.appendChild(renderComponent(instance, {
      metadataRegistry,
      nativeRegistry,
      mode: "interactive",
      dataSourceRuntime: runtime,
    }));
  }
  return document;
}

async function start(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) return;
  const api = new URLSearchParams(location.search).get("api");
  const apiBaseUrl = api ?? location.origin;
  const fetchImpl = api === null ? createMockFetch() : globalThis.fetch.bind(globalThis);
  try {
    await renderSchemaPage({ container, apiBaseUrl, fetchImpl });
  } catch (error) {
    container.textContent = error instanceof Error ? error.message : String(error);
    container.setAttribute("role", "alert");
  }
}

if (typeof document !== "undefined") void start();
