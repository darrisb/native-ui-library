/**
 * Focused integration tests: generic data-bound runtime with a mock
 * option-consumer adapter and mocked fetch.
 *
 * Verifies:
 *   - REST dataSource with responsePath + label/value mapping resolves at
 *     runtime through the generic fetch -> map -> bind pipeline.
 *   - A mock option-consumer adapter receives the mapped records and renders
 *     them into the DOM — no Dropdown component is assumed.
 *   - The standalone runtime is independent of the builder application: no
 *     builder modules are imported, no builder server is required.
 *   - Multiple instances sharing one runtime each resolve and bind their own
 *     data correctly.
 *   - Empty / error responses set the correct lifecycle state on the element.
 *   - The data-bound example JSON survives serialize/import round-tripping
 *     and re-renders identically (export/import contract).
 */
const results = [];
const pending = [];
function test(name, fn) {
    const run = async () => {
        try {
            await fn();
            results.push({ name, passed: true });
        }
        catch (error) {
            results.push({
                name,
                passed: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    };
    pending.push(run());
}
async function flush(times = 6) {
    for (let i = 0; i < times; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message ?? `Expected ${String(expected)}, but got ${String(actual)}.`);
    }
}
function assertTrue(value, message) {
    if (!value) {
        throw new Error(message ?? "Expected value to be true.");
    }
}
function assertDeepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
        throw new Error(message ?? `Expected ${expectedJson}, but got ${actualJson}.`);
    }
}
// ---------------------------------------------------------------------------
// Minimal DOM mock (must run before importing renderer modules)
// ---------------------------------------------------------------------------
class MockStyle {
    properties = new Map();
    setProperty(name, value) {
        this.properties.set(name, value);
    }
    getPropertyValue(name) {
        return this.properties.get(name) ?? "";
    }
}
class MockElement {
    nodeName;
    attributes = new Map();
    style = new MockStyle();
    parentNode = null;
    childNodes = [];
    constructor(nodeName) {
        this.nodeName = nodeName.toLowerCase();
    }
    setAttribute(name, value) {
        this.attributes.set(name.toLowerCase(), String(value));
        if (name.toLowerCase() === "class") {
            this._className = String(value);
        }
    }
    getAttribute(name) {
        return this.attributes.get(name.toLowerCase()) ?? null;
    }
    _className = "";
    get className() {
        return this._className;
    }
    set className(value) {
        this._className = value;
        this.attributes.set("class", value);
    }
    removeAttribute(name) {
        this.attributes.delete(name.toLowerCase());
    }
    appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    get children() {
        return this.childNodes;
    }
    get firstElementChild() {
        return this.childNodes[0] ?? null;
    }
    querySelector(selector) {
        const className = selector.startsWith(".") ? selector.slice(1) : selector;
        const stack = [...this.childNodes];
        while (stack.length > 0) {
            const current = stack.shift();
            const classAttr = current.attributes.get("class");
            if (classAttr) {
                const classes = classAttr.split(/\s+/);
                if (classes.includes(className)) {
                    return current;
                }
            }
            stack.push(...current.childNodes);
        }
        return null;
    }
    replaceWith(other) {
        if (this.parentNode) {
            const index = this.parentNode.childNodes.indexOf(this);
            if (index !== -1) {
                other.parentNode = this.parentNode;
                this.parentNode.childNodes[index] = other;
            }
        }
    }
}
function installMockDom() {
    const globals = globalThis;
    class MockHTMLElement extends MockElement {
    }
    globals.HTMLElement = MockHTMLElement;
    globals.document = {
        createElement: (tagName) => new MockElement(tagName),
    };
    globals.customElements = {
        get: (name) => {
            const defined = new Set(["ui-card", "ui-text", "ui-button"]);
            return defined.has(name) ? {} : undefined;
        },
        define: () => { },
    };
    // BrowserNavigationAdapter's default param references `window`.
    globals.window = globals;
}
installMockDom();
// ---------------------------------------------------------------------------
// Imports (after DOM mock)
// ---------------------------------------------------------------------------
const { ComponentRegistry } = await import("@visual-ui/core");
const { NativeComponentRegistry, registerCard } = await import("@visual-ui/components");
const { renderComponent } = await import("@visual-ui/renderer");
const { DataSourceRuntime, createBindingAdapterRegistry, createRestFetchAdapter } = await import("@visual-ui/renderer");
const { optionsBindingAdapter } = await import("../option-consumer-adapter.js");
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function createRegistries() {
    const metadataRegistry = new ComponentRegistry();
    const nativeRegistry = new NativeComponentRegistry();
    registerCard(metadataRegistry, nativeRegistry);
    return { metadataRegistry, nativeRegistry };
}
function mockFetch(body, ok = true, status = 200) {
    return (async () => {
        // Return a fresh Response per call — body streams are single-read.
        const response = new Response(JSON.stringify(body), {
            status,
            statusText: ok ? "OK" : "Error",
            headers: { "Content-Type": "application/json" },
        });
        Object.defineProperty(response, "ok", { value: ok });
        return response;
    });
}
/**
 * Builds a mock option-consumer adapter that captures the received records so
 * tests can assert on them, and writes the bound-options attribute so the
 * pipeline is fully exercised.
 */
function capturingAdapter() {
    const captures = [];
    const adapter = (element, records) => {
        const title = element.getAttribute("title") ?? "(no-title)";
        captures.push({ element: title, records: records.slice() });
        optionsBindingAdapter(element, records);
    };
    return { adapter, captures };
}
function restCardInstance(id, url, responsePath, mapping = { label: "label", value: "value" }) {
    return {
        id,
        type: "card",
        properties: { title: id },
        dataSource: {
            type: "rest",
            method: "GET",
            url,
            responsePath,
            mapping,
            loadOn: "mount",
        },
        bindings: [{ target: "options" }],
    };
}
// ---------------------------------------------------------------------------
// Focused integration tests
// ---------------------------------------------------------------------------
test("REST dataSource + responsePath + label/value mapping resolves via mock option-consumer", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const fetchImpl = mockFetch({
        data: {
            items: [
                { name: "Alpha", code: "A1" },
                { name: "Beta", code: "B2" },
            ],
        },
    });
    const fetchAdapter = createRestFetchAdapter({ fetchImpl });
    const { adapter, captures } = capturingAdapter();
    const bindingAdapters = createBindingAdapterRegistry({ options: adapter });
    const runtime = new DataSourceRuntime({
        fetchAdapter,
        bindingAdapters,
        mode: "interactive",
    });
    const instance = restCardInstance("card-1", "https://api.example.com/items", "data.items", { label: "name", value: "code" });
    const element = renderComponent(instance, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        dataSourceRuntime: runtime,
    });
    assertEqual(element.getAttribute("data-ds-status"), "loading");
    await flush();
    assertEqual(element.getAttribute("data-ds-status"), "ready");
    assertEqual(captures.length, 1);
    assertDeepEqual(captures[0].records, [
        { label: "Alpha", value: "A1" },
        { label: "Beta", value: "B2" },
    ]);
    // The mock consumer adapter should have rendered option items into the DOM.
    const items = element.childNodes.filter((c) => c.nodeName === "ul" &&
        c.attributes.get("class") === "option-consumer-list");
    assertEqual(items.length, 1, "adapter should render a <ul> list");
});
test("multiple instances sharing one runtime each bind their own data", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const fetchImpl = mockFetch({
        results: [
            { displayName: "Pending", code: "P" },
            { displayName: "Shipped", code: "S" },
        ],
    });
    const fetchAdapter = createRestFetchAdapter({ fetchImpl });
    const { adapter, captures } = capturingAdapter();
    const bindingAdapters = createBindingAdapterRegistry({ options: adapter });
    const runtime = new DataSourceRuntime({
        fetchAdapter,
        bindingAdapters,
        mode: "interactive",
    });
    const instances = [
        restCardInstance("card-first", "https://api.example.com/orders/statuses", "results", { label: "displayName", value: "code" }),
        restCardInstance("card-second", "https://api.example.com/orders/statuses", "results", { label: "displayName", value: "code" }),
    ];
    const elements = instances.map((inst) => renderComponent(inst, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        dataSourceRuntime: runtime,
    }));
    await flush();
    for (const el of elements) {
        assertEqual(el.getAttribute("data-ds-status"), "ready");
    }
    assertEqual(captures.length, 2, "each instance triggers its own bind call");
    assertEqual(captures[0].element, "card-first");
    assertEqual(captures[1].element, "card-second");
    // Each resolved record carries the projected label/value.
    assertDeepEqual(captures[0].records, [
        { label: "Pending", value: "P" },
        { label: "Shipped", value: "S" },
    ]);
    assertDeepEqual(captures[1].records, [
        { label: "Pending", value: "P" },
        { label: "Shipped", value: "S" },
    ]);
});
test("empty collection sets empty state without calling the consumer adapter", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const fetchImpl = mockFetch({ items: [] });
    const fetchAdapter = createRestFetchAdapter({ fetchImpl });
    const { adapter, captures } = capturingAdapter();
    const bindingAdapters = createBindingAdapterRegistry({ options: adapter });
    const runtime = new DataSourceRuntime({
        fetchAdapter,
        bindingAdapters,
        mode: "interactive",
    });
    const instance = restCardInstance("card-empty", "https://api.example.com/empty", "items");
    const element = renderComponent(instance, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        dataSourceRuntime: runtime,
    });
    await flush();
    assertEqual(element.getAttribute("data-ds-status"), "empty");
    assertEqual(captures.length, 0, "consumer adapter must not be called on empty");
});
test("HTTP error sets error state and does not call consumer adapter", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const fetchImpl = mockFetch({}, false, 500);
    const fetchAdapter = createRestFetchAdapter({ fetchImpl });
    const { adapter, captures } = capturingAdapter();
    const bindingAdapters = createBindingAdapterRegistry({ options: adapter });
    const runtime = new DataSourceRuntime({
        fetchAdapter,
        bindingAdapters,
        mode: "interactive",
    });
    const instance = restCardInstance("card-err", "https://api.example.com/fail", "items");
    const element = renderComponent(instance, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        dataSourceRuntime: runtime,
    });
    await flush();
    assertEqual(element.getAttribute("data-ds-status"), "error");
    const state = runtime.getState("card-err");
    assertEqual(state?.status, "error");
    // Error message must never echo the URL.
    if (state?.status === "error") {
        assertTrue(!state.message.includes("api.example.com"), "Error message must not leak the URL.");
    }
    assertEqual(captures.length, 0, "consumer adapter must not be called on error");
});
test("data-bound JSON survives serialize/import round-trip and re-renders", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const fetchImpl = mockFetch({
        items: [{ name: "One", id: 1 }],
    });
    const fetchAdapter = createRestFetchAdapter({ fetchImpl });
    const { adapter, captures } = capturingAdapter();
    const bindingAdapters = createBindingAdapterRegistry({ options: adapter });
    const runtime = new DataSourceRuntime({
        fetchAdapter,
        bindingAdapters,
        mode: "interactive",
    });
    const original = restCardInstance("card-roundtrip", "https://api.example.com/r", "items", { label: "name", value: "id" });
    // Round-trip: serialize -> parse, exactly as export/import would.
    const roundTripped = JSON.parse(JSON.stringify(original));
    const element = renderComponent(roundTripped, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        dataSourceRuntime: runtime,
    });
    await flush();
    assertEqual(element.getAttribute("data-ds-status"), "ready");
    assertEqual(captures.length, 1);
    assertDeepEqual(captures[0].records, [{ label: "One", value: 1 }]);
});
test("standalone runtime does not import builder modules (independence)", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // dist-test/__tests__/ -> examples/json-renderer/ (three levels up)
    const testDir = dirname(fileURLToPath(import.meta.url));
    const exampleDir = dirname(dirname(testDir));
    const mainSource = readFileSync(join(exampleDir, "data-bound-main.ts"), "utf-8");
    const consumerSource = readFileSync(join(exampleDir, "option-consumer-adapter.ts"), "utf-8");
    assertTrue(!mainSource.includes("@visual-ui/builder"), "data-bound-main.ts must not import builder modules.");
    assertTrue(!consumerSource.includes("@visual-ui/builder"), "option-consumer-adapter.ts must not import builder modules.");
});
test("mapping projects arbitrary API shapes to label/value", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    // Response uses nested fields — mapping must navigate them.
    const fetchImpl = mockFetch({
        payload: {
            entries: [
                { product: { title: "Gizmo" }, metadata: { ref: 42 } },
            ],
        },
    });
    const fetchAdapter = createRestFetchAdapter({ fetchImpl });
    const { adapter, captures } = capturingAdapter();
    const bindingAdapters = createBindingAdapterRegistry({ options: adapter });
    const runtime = new DataSourceRuntime({
        fetchAdapter,
        bindingAdapters,
        mode: "interactive",
    });
    const instance = restCardInstance("card-nested", "https://api.example.com/nested", "payload.entries", { label: "product.title", value: "metadata.ref" });
    const element = renderComponent(instance, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        dataSourceRuntime: runtime,
    });
    await flush();
    assertEqual(element.getAttribute("data-ds-status"), "ready");
    assertEqual(captures.length, 1);
    assertDeepEqual(captures[0].records, [{ label: "Gizmo", value: 42 }]);
});
// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
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
//# sourceMappingURL=data-bound-integration.test.js.map