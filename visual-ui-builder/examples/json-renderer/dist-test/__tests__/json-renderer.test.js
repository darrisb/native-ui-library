import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, passed: true });
    }
    catch (error) {
        results.push({
            name,
            passed: false,
            error: error instanceof Error ? error.message : String(error),
        });
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
    listeners = new Map();
    constructor(nodeName) {
        this.nodeName = nodeName.toLowerCase();
    }
    setAttribute(name, value) {
        this.attributes.set(name.toLowerCase(), String(value));
    }
    getAttribute(name) {
        return this.attributes.get(name.toLowerCase()) ?? null;
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
    addEventListener(type, listener) {
        const entries = this.listeners.get(type) ?? [];
        entries.push(listener);
        this.listeners.set(type, entries);
    }
    removeEventListener(type, listener) {
        const entries = this.listeners.get(type) ?? [];
        const index = entries.indexOf(listener);
        if (index !== -1) {
            entries.splice(index, 1);
        }
        this.listeners.set(type, entries);
    }
    listenerCount(type) {
        return (this.listeners.get(type) ?? []).length;
    }
    fire(type, event) {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}
class MockEvent {
    type;
    defaultPrevented = false;
    propagationStopped = false;
    constructor(type) {
        this.type = type;
    }
    preventDefault() {
        this.defaultPrevented = true;
    }
    stopPropagation() {
        this.propagationStopped = true;
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
}
installMockDom();
const { ComponentRegistry } = await import("@visual-ui/core");
const { NativeComponentRegistry, registerCard, registerText, registerButton, } = await import("@visual-ui/components");
const { validateDocumentShape, renderDocument } = await import("../renderer.js");
const { ActionExecutor } = await import("@visual-ui/renderer");
function createRegistries() {
    const metadataRegistry = new ComponentRegistry();
    const nativeRegistry = new NativeComponentRegistry();
    registerCard(metadataRegistry, nativeRegistry);
    registerText(metadataRegistry, nativeRegistry);
    registerButton(metadataRegistry, nativeRegistry);
    return { metadataRegistry, nativeRegistry };
}
test("Valid JSON document shape is accepted", () => {
    const document = [
        {
            id: "card-1",
            type: "card",
            properties: { title: "Hello" },
            children: [],
        },
    ];
    const result = validateDocumentShape(document);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, "card-1");
});
test("Non-array document is rejected", () => {
    let threw = false;
    try {
        validateDocumentShape({ not: "array" });
    }
    catch (error) {
        threw = true;
        assertTrue(error instanceof Error && error.message.includes("array"), `Expected array error, got: ${error instanceof Error ? error.message : String(error)}`);
    }
    assertTrue(threw, "Expected non-array document to throw.");
});
test("Invalid root entry is rejected", () => {
    let threw = false;
    try {
        validateDocumentShape([null]);
    }
    catch (error) {
        threw = true;
    }
    assertTrue(threw, "Expected invalid root entry to throw.");
});
test("Multiple Cards render in the correct order", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        { id: "card-1", type: "card", properties: { title: "First" } },
        { id: "card-2", type: "card", properties: { title: "Second" } },
        { id: "card-3", type: "card", properties: { title: "Third" } },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 3);
    assertEqual(result.elements[0].getAttribute("title"), "First");
    assertEqual(result.elements[1].getAttribute("title"), "Second");
    assertEqual(result.elements[2].getAttribute("title"), "Third");
});
test("Each Card has its own properties", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-a",
            type: "card",
            properties: {
                title: "A",
                padding: 24,
                backgroundColor: "#ffffff",
            },
        },
        {
            id: "card-b",
            type: "card",
            properties: {
                title: "B",
                padding: 16,
                backgroundColor: "#f0f4ff",
            },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements[0].style.getPropertyValue("--ui-card-padding"), "24px");
    assertEqual(result.elements[0].style.getPropertyValue("--ui-card-background"), "#ffffff");
    assertEqual(result.elements[1].style.getPropertyValue("--ui-card-padding"), "16px");
    assertEqual(result.elements[1].style.getPropertyValue("--ui-card-background"), "#f0f4ff");
});
test("Invalid Card properties are rejected", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        { id: "card-valid", type: "card", properties: { title: "Valid" } },
        {
            id: "card-invalid",
            type: "card",
            properties: { padding: "not-a-number" },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.elements.length, 0);
    assertEqual(result.errors.length, 1);
    assertEqual(result.errors[0].id, "card-invalid");
    assertEqual(result.errors[0].type, "card");
});
test("Unknown component types are rejected", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        { id: "unknown-1", type: "unknown", properties: {} },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.elements.length, 0);
    assertEqual(result.errors.length, 1);
    assertEqual(result.errors[0].id, "unknown-1");
    assertEqual(result.errors[0].type, "unknown");
});
test("No partial document is appended after rendering failure", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        { id: "card-ok", type: "card", properties: { title: "OK" } },
        {
            id: "card-bad",
            type: "card",
            properties: { unknownProp: "x" },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.elements.length, 0);
    assertTrue(result.errors.length > 0);
});
test("Renderer does not mutate the input JSON", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        { id: "card-1", type: "card", properties: { title: "Hello" } },
    ];
    const before = JSON.stringify(document);
    renderDocument(document, { metadataRegistry, nativeRegistry });
    assertEqual(JSON.stringify(document), before);
});
test("The standalone integration does not import builder modules", () => {
    const exampleDir = dirname(fileURLToPath(import.meta.url));
    const rendererSource = readFileSync(join(exampleDir, "../renderer.js"), "utf-8");
    const mainSource = readFileSync(join(exampleDir, "../main.js"), "utf-8");
    assertTrue(!rendererSource.includes("@visual-ui/builder"), "renderer.ts must not import builder modules.");
    assertTrue(!mainSource.includes("@visual-ui/builder"), "main.ts must not import builder modules.");
});
test("Card renders the description attribute from JSON", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-described",
            type: "card",
            properties: {
                title: "Described",
                description: "This Card has a description.",
            },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    assertEqual(result.elements[0].getAttribute("description"), "This Card has a description.");
});
test("Each Card retains its own independent description", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-first",
            type: "card",
            properties: {
                title: "First",
                description: "First description.",
            },
        },
        {
            id: "card-second",
            type: "card",
            properties: {
                title: "Second",
                description: "Second description.",
            },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 2);
    assertEqual(result.elements[0].getAttribute("description"), "First description.");
    assertEqual(result.elements[1].getAttribute("description"), "Second description.");
});
test("Card without description renders successfully", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-plain",
            type: "card",
            properties: { title: "Plain" },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    assertEqual(result.elements[0].getAttribute("description"), null);
    assertEqual(result.elements[0].getAttribute("title"), "Plain");
});
test("Empty description is accepted", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-empty",
            type: "card",
            properties: {
                title: "Empty",
                description: "",
            },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    assertEqual(result.elements[0].getAttribute("description"), "");
});
test("Card without description keeps existing properties unchanged", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-contact",
            type: "card",
            properties: {
                title: "Contact Us",
                padding: 20,
                backgroundColor: "#f0fdf4",
            },
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements[0].getAttribute("title"), "Contact Us");
    assertEqual(result.elements[0].style.getPropertyValue("--ui-card-padding"), "20px");
    assertEqual(result.elements[0].style.getPropertyValue("--ui-card-background"), "#f0fdf4");
    assertEqual(result.elements[0].getAttribute("description"), null);
});
test("Standalone example uses renderComponent from shared renderer", () => {
    const exampleDir = dirname(fileURLToPath(import.meta.url));
    const rendererSource = readFileSync(join(exampleDir, "../renderer.js"), "utf-8");
    assertTrue(rendererSource.includes('import { renderComponent } from "@visual-ui/renderer"'), "renderer.ts must import renderComponent from @visual-ui/renderer.");
    assertTrue(rendererSource.includes("renderComponent(instance, options)"), "renderer.ts must call renderComponent for each instance.");
});
test("Standalone example attaches a click listener to the nested Button", () => {
    const exampleDir = dirname(fileURLToPath(import.meta.url));
    const mainSource = readFileSync(join(exampleDir, "../main.js"), "utf-8");
    assertTrue(mainSource.includes('querySelector("ui-button")'), "main.ts must query for the nested ui-button.");
    assertTrue(mainSource.includes('addEventListener("click"'), "main.ts must attach a click listener to the nested Button.");
});
test("Card with Text and Button children renders recursively", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-parent",
            type: "card",
            properties: { title: "Parent" },
            children: [
                {
                    id: "text-1",
                    type: "text",
                    properties: {
                        content: "Hello",
                        color: "#333333",
                        align: "left",
                    },
                },
                {
                    id: "button-1",
                    type: "button",
                    properties: {
                        label: "Click",
                        variant: "primary",
                        disabled: false,
                    },
                },
            ],
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    const card = result.elements[0];
    assertEqual(card.nodeName, "ui-card");
    assertEqual(card.children.length, 2);
    assertEqual(card.children[0].nodeName, "ui-text");
    assertEqual(card.children[0].getAttribute("content"), "Hello");
    assertEqual(card.children[1].nodeName, "ui-button");
    assertEqual(card.children[1].getAttribute("label"), "Click");
    assertEqual(card.children[1].getAttribute("disabled"), null);
});
test("Nested Card with Text child renders", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-outer",
            type: "card",
            properties: { title: "Outer" },
            children: [
                {
                    id: "card-inner",
                    type: "card",
                    properties: { title: "Inner" },
                    children: [
                        {
                            id: "text-inner",
                            type: "text",
                            properties: { content: "Inner text" },
                        },
                    ],
                },
            ],
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    const outer = result.elements[0];
    assertEqual(outer.nodeName, "ui-card");
    assertEqual(outer.children.length, 1);
    assertEqual(outer.children[0].nodeName, "ui-card");
    assertEqual(outer.children[0].children.length, 1);
    assertEqual(outer.children[0].children[0].nodeName, "ui-text");
    assertEqual(outer.children[0].children[0].getAttribute("content"), "Inner text");
});
test("Backward-compatible root Card without children renders", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-legacy",
            type: "card",
            properties: {
                title: "Legacy",
                padding: 20,
                backgroundColor: "#f0fdf4",
            },
            children: [],
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    assertEqual(result.elements[0].nodeName, "ui-card");
    assertEqual(result.elements[0].children.length, 0);
});
test("No partial document is rendered when a nested child is invalid", () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const document = [
        {
            id: "card-parent",
            type: "card",
            properties: { title: "Parent" },
            children: [
                {
                    id: "text-invalid",
                    type: "text",
                    properties: { unknownProp: "x" },
                },
            ],
        },
    ];
    const result = renderDocument(document, {
        metadataRegistry,
        nativeRegistry,
    });
    assertEqual(result.elements.length, 0);
    assertEqual(result.errors.length, 1);
    assertEqual(result.errors[0].id, "card-parent");
});
// -----------------------------------------------------------------------
// Focused integration tests: action persistence and independent runtime.
// -----------------------------------------------------------------------
class FakeNavigationAdapter {
    calls = [];
    navigateTo(url) {
        this.calls.push({ method: "navigateTo", url });
    }
    openInNewWindow(url) {
        this.calls.push({ method: "openInNewWindow", url });
    }
    reset() {
        this.calls.length = 0;
    }
}
function navigateAction(id, overrides = {}) {
    return {
        id,
        event: "click",
        type: "navigate",
        config: { url: "https://example.com", target: "_self" },
        ...overrides,
    };
}
/**
 * Renders a document through validateDocumentShape + renderDocument, using a
 * fake navigation adapter to observe action dispatch without a real browser.
 */
function renderWithFakeAdapter(document, mode, adapter = new FakeNavigationAdapter()) {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    return {
        result: renderDocument(document, {
            metadataRegistry,
            nativeRegistry,
            mode,
            actionExecutor: new ActionExecutor({ navigationAdapter: adapter }),
        }),
        adapter,
    };
}
test("Action JSON survives serialize/import/re-render (round-trip)", () => {
    const document = [
        {
            id: "button-1",
            type: "button",
            properties: { label: "Go", variant: "primary" },
            actions: [navigateAction("a1")],
        },
    ];
    // Serialize and re-parse, exactly as a standalone export/import would.
    const roundTripped = JSON.parse(JSON.stringify(document));
    // The round-tripped element must still carry the action wiring: clicking
    // it dispatches navigation through the fake adapter.
    const adapter = new FakeNavigationAdapter();
    const { result } = renderWithFakeAdapter(roundTripped, "interactive", adapter);
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    const element = result.elements[0];
    assertEqual(element.listenerCount("click"), 1, "action listener survives round-trip");
    element.fire("click", new MockEvent("click"));
    assertEqual(adapter.calls.length, 1, "round-tripped action still dispatches");
    assertEqual(adapter.calls[0].url, "https://example.com");
});
test("Standalone runtime: interactive mode wires navigate action and dispatches", () => {
    const adapter = new FakeNavigationAdapter();
    const document = [
        {
            id: "button-1",
            type: "button",
            properties: { label: "Go", variant: "primary" },
            actions: [navigateAction("a1")],
        },
    ];
    const { result } = renderWithFakeAdapter(document, "interactive", adapter);
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    const element = result.elements[0];
    assertEqual(element.listenerCount("click"), 1, "interactive mode binds the click listener");
    element.fire("click", new MockEvent("click"));
    assertEqual(adapter.calls.length, 1);
    assertEqual(adapter.calls[0].method, "navigateTo");
    assertEqual(adapter.calls[0].url, "https://example.com");
});
test("Standalone runtime: edit mode does NOT wire action listeners", () => {
    const adapter = new FakeNavigationAdapter();
    const document = [
        {
            id: "button-1",
            type: "button",
            properties: { label: "Go", variant: "primary" },
            actions: [navigateAction("a1")],
        },
    ];
    const { result } = renderWithFakeAdapter(document, "edit", adapter);
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    const element = result.elements[0];
    assertEqual(element.listenerCount("click"), 0, "edit mode binds no action listeners");
    element.fire("click", new MockEvent("click"));
    assertEqual(adapter.calls.length, 0, "no navigation fires in edit mode");
});
test("Action JSON round-trip preserves multiple nested actions", () => {
    const document = [
        {
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
        },
    ];
    const roundTripped = JSON.parse(JSON.stringify(document));
    const adapter = new FakeNavigationAdapter();
    const { result } = renderWithFakeAdapter(roundTripped, "interactive", adapter);
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 1);
    const card = result.elements[0];
    const button = card.firstElementChild;
    // Both elements have their listeners.
    assertEqual(card.listenerCount("click"), 1);
    assertEqual(button.listenerCount("click"), 1);
    // Click the nested button — only its action fires (event isolation).
    button.fire("click", new MockEvent("click"));
    assertEqual(adapter.calls.length, 1);
    assertEqual(adapter.calls[0].url, "https://child.com");
});
test("Standalone runtime: _blank target opens in new window", () => {
    const adapter = new FakeNavigationAdapter();
    const document = [
        {
            id: "button-1",
            type: "button",
            properties: { label: "Open", variant: "primary" },
            actions: [navigateAction("a1", { config: { url: "https://example.com", target: "_blank" } })],
        },
    ];
    const { result } = renderWithFakeAdapter(document, "interactive", adapter);
    const element = result.elements[0];
    element.fire("click", new MockEvent("click"));
    assertEqual(adapter.calls.length, 1);
    assertEqual(adapter.calls[0].method, "openInNewWindow");
    assertEqual(adapter.calls[0].url, "https://example.com");
});
test("Standalone runtime does not import builder modules (independence)", () => {
    const exampleDir = dirname(fileURLToPath(import.meta.url));
    const rendererSource = readFileSync(join(exampleDir, "../renderer.js"), "utf-8");
    const mainSource = readFileSync(join(exampleDir, "../main.js"), "utf-8");
    assertTrue(!rendererSource.includes("@visual-ui/builder"), "renderer.ts must not import builder modules.");
    assertTrue(!mainSource.includes("@visual-ui/builder"), "main.ts must not import builder modules.");
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
//# sourceMappingURL=json-renderer.test.js.map