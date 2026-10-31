/**
 * Standalone data-bound example entry point.
 *
 * Demonstrates API-backed options resolved at runtime through the generic
 * fetch -> map -> bind pipeline — without the builder application. A mock fetch
 * adapter injects a canned REST response; a mock option-consumer adapter
 * renders the resolved records into the DOM so the data flow is visible.
 *
 * In production the mock fetch would be replaced by the browser's native fetch
 * (the default when no `dataSourceRuntime` override is supplied), and the
 * external API endpoint must permit CORS. Private APIs that do not send
 * `Access-Control-Allow-Origin` headers require a customer-owned proxy or
 * backend to relay the request — see README.
 */

import { ComponentRegistry } from "@visual-ui/core";
import {
  NativeComponentRegistry,
  registerCard,
} from "@visual-ui/components";
import {
  DataSourceRuntime,
  createBindingAdapterRegistry,
  createRestFetchAdapter,
  renderComponent,
} from "@visual-ui/renderer";
import { optionsBindingAdapter } from "./option-consumer-adapter.js";
import dataBoundDocument from "./data-bound-document.json";

const MOCK_RESPONSE = {
  data: {
    items: [
      { name: "Widget A", sku: 1001 },
      { name: "Widget B", sku: 1002 },
      { name: "Widget C", sku: 1003 },
    ],
  },
};

function createMockFetch(): typeof fetch {
  return (async (): Promise<Response> =>
    new Response(JSON.stringify(MOCK_RESPONSE), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

function showError(container: HTMLElement, message: string): void {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className = "error-message";
  div.setAttribute("role", "alert");
  const heading = document.createElement("h2");
  heading.textContent = "Data-bound render failed";
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  div.appendChild(heading);
  div.appendChild(paragraph);
  container.appendChild(div);
}

async function renderDataBound(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) {
    return;
  }

  const metadataRegistry = new ComponentRegistry();
  const nativeRegistry = new NativeComponentRegistry();
  registerCard(metadataRegistry, nativeRegistry);

  // Custom binding adapter registry: the "options" target renders resolved
  // records into the DOM via the mock consumer adapter.
  const bindingAdapters = createBindingAdapterRegistry({
    options: optionsBindingAdapter,
  });

  // Mock-backed fetch adapter so this page runs with no live network.
  const fetchAdapter = createRestFetchAdapter({
    fetchImpl: createMockFetch(),
  });

  const runtime = new DataSourceRuntime({
    fetchAdapter,
    bindingAdapters,
    mode: "interactive",
  });

  for (const instance of dataBoundDocument) {
    const element = renderComponent(instance as never, {
      metadataRegistry,
      nativeRegistry,
      mode: "interactive",
      dataSourceRuntime: runtime,
    });
    container.appendChild(element);
  }
}

renderDataBound().catch((error) => {
  const container = document.getElementById("app");
  if (container) {
    showError(
      container,
      error instanceof Error ? error.message : String(error)
    );
  }
});
