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
async function asyncTest(name, fn) {
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
class MockEvent {
    type;
    bubbles;
    composed;
    detail;
    key;
    defaultPrevented = false;
    propagationStopped = false;
    constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles ?? false;
        this.composed = options.composed ?? false;
        this.detail = options.detail ?? {};
        this.key = options.key ?? "";
    }
    stopPropagation() {
        this.propagationStopped = true;
    }
    preventDefault() {
        this.defaultPrevented = true;
    }
}
class MockNode {
    children = [];
    parentNode = null;
    text = "";
    listeners = new Map();
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    replaceChildren(...children) {
        for (const child of this.children) {
            child.parentNode = null;
        }
        this.children = [];
        for (const child of children) {
            this.appendChild(child);
        }
    }
    get textContent() {
        return this.text;
    }
    set textContent(value) {
        this.text = value;
        this.children = [];
    }
    addEventListener(type, listener) {
        const list = this.listeners.get(type) ?? [];
        list.push(listener);
        this.listeners.set(type, list);
    }
    removeEventListener(type, listener) {
        const list = this.listeners.get(type);
        if (!list) {
            return;
        }
        const index = list.indexOf(listener);
        if (index !== -1) {
            list.splice(index, 1);
        }
    }
    dispatchEvent(event) {
        const list = this.listeners.get(event.type) ?? [];
        for (const listener of list) {
            if (event.propagationStopped) {
                break;
            }
            listener(event);
        }
        if (event.bubbles && !event.propagationStopped && this.parentNode) {
            this.parentNode.dispatchEvent(event);
        }
        return !event.defaultPrevented;
    }
}
class MockShadowRoot extends MockNode {
}
class MockElement extends MockNode {
    nodeName;
    attributes = new Map();
    style = new MockStyle();
    shadowRoot = null;
    disabled = false;
    required = false;
    readOnly = false;
    maxLength = -1;
    type = "text";
    placeholder = "";
    id = "";
    _value = "";
    constructor(nodeName) {
        super();
        this.nodeName = nodeName?.toLowerCase() ?? "element";
    }
    setAttribute(name, value) {
        const lowerName = name.toLowerCase();
        const oldValue = this.attributes.get(lowerName) ?? null;
        this.attributes.set(lowerName, String(value));
        const customLike = this;
        if (typeof customLike.attributeChangedCallback === "function" &&
            oldValue !== String(value)) {
            customLike.attributeChangedCallback(lowerName, oldValue, String(value));
        }
    }
    getAttribute(name) {
        return this.attributes.get(name.toLowerCase()) ?? null;
    }
    removeAttribute(name) {
        this.attributes.delete(name.toLowerCase());
    }
    attachShadow(_init) {
        const root = new MockShadowRoot();
        root.parentNode = this;
        this.shadowRoot = root;
        return root;
    }
    get value() {
        return this._value;
    }
    set value(val) {
        this._value = val;
    }
    querySelectorAll(selector) {
        const matches = [];
        const search = (element) => {
            if (matchesSelector(element, selector)) {
                matches.push(element);
            }
            for (const child of element.children) {
                if (child instanceof MockElement) {
                    search(child);
                }
            }
        };
        for (const child of this.children) {
            if (child instanceof MockElement) {
                search(child);
            }
        }
        return matches;
    }
}
function matchesSelector(element, selector) {
    const tagMatch = selector.match(/^([a-zA-Z][\w-]*)/);
    if (tagMatch && element.nodeName !== tagMatch[1].toLowerCase()) {
        return false;
    }
    const attributePattern = /\[([^\]]+)\]/g;
    let match;
    while ((match = attributePattern.exec(selector)) !== null) {
        const content = match[1].trim();
        const equalsIndex = content.indexOf("=");
        if (equalsIndex === -1) {
            if (element.getAttribute(content) === null) {
                return false;
            }
        }
        else {
            const name = content.slice(0, equalsIndex).trim();
            const expected = content
                .slice(equalsIndex + 1)
                .trim()
                .replace(/^["']|["']$/g, "");
            if (element.getAttribute(name) !== expected) {
                return false;
            }
        }
    }
    return true;
}
class MockHTMLElement extends MockElement {
}
function installMockDom() {
    const globals = globalThis;
    globals.HTMLElement = MockHTMLElement;
    const definedElements = new Map();
    globals.customElements = {
        get: (name) => definedElements.get(name.toLowerCase()),
        define: (name, constructor) => {
            definedElements.set(name.toLowerCase(), constructor);
        },
    };
    globals.document = {
        createElement: (tagName) => {
            const lowerName = tagName.toLowerCase();
            const constructor = definedElements.get(lowerName);
            // Only the Input is instantiated as a real custom element so the Enter
            // keydown path can be exercised. Other components remain lightweight
            // attribute containers, matching the renderer-level tests.
            if (lowerName === "ui-input" && constructor) {
                const element = new constructor();
                // Real custom elements receive their tag name from the registry; the
                // mock constructor has no such context, so assign it explicitly.
                element.nodeName = lowerName;
                return element;
            }
            return new MockElement(tagName);
        },
        getElementById: () => null,
    };
    globals.CustomEvent = MockEvent;
}
installMockDom();
const { ComponentRegistry } = await import("@visual-ui/core");
const { NativeComponentRegistry, registerCard, registerText, registerButton, registerDropdown, registerInput, } = await import("@visual-ui/components");
const { ActionExecutor } = await import("@visual-ui/renderer");
const { renderDocument } = await import("../renderer.js");
const { resolveDataSourceElements } = await import("../main.js");
function createRegistries() {
    const metadataRegistry = new ComponentRegistry();
    const nativeRegistry = new NativeComponentRegistry();
    registerCard(metadataRegistry, nativeRegistry);
    registerText(metadataRegistry, nativeRegistry);
    registerButton(metadataRegistry, nativeRegistry);
    registerDropdown(metadataRegistry, nativeRegistry);
    registerInput(metadataRegistry, nativeRegistry);
    return { metadataRegistry, nativeRegistry };
}
class StubNavigationAdapter {
    navigations = [];
    newWindows = [];
    navigateTo(url) {
        this.navigations.push(url);
    }
    openInNewWindow(url) {
        this.newWindows.push(url);
    }
}
function searchInputInstance() {
    return {
        id: "input-search",
        type: "input",
        properties: {
            label: "Search",
            placeholder: "Search products…",
            name: "q",
            inputType: "search",
            required: false,
            disabled: false,
            readonly: false,
            maxLength: 80,
            defaultValue: "",
            dataSourceUrl: "/api/search/suggestions?fields=title,query",
            dataSourceResponsePath: "suggestions",
            dataSourceLabelField: "title",
            dataSourceValueField: "query",
        },
        actions: [
            {
                id: "action-search-submit",
                event: "submit",
                type: "navigate",
                config: {
                    url: "/search?q={value}",
                },
            },
        ],
    };
}
function findPart(element, part) {
    const shadow = element.shadowRoot;
    if (!shadow) {
        return undefined;
    }
    return shadow.children.find((child) => child instanceof MockElement && child.getAttribute("part") === part);
}
await asyncTest("Renderer builds the input from JSON with suggestions from the mock fetch", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const fetchCalls = [];
    const mockFetch = (async (url) => {
        fetchCalls.push(url);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                suggestions: [
                    { title: "Native Web Components", query: "native" },
                    { title: "JSON Renderer", query: "renderer" },
                ],
            }),
        };
    });
    const result = renderDocument([searchInputInstance()], {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        actionExecutor: new ActionExecutor({
            navigationAdapter: new StubNavigationAdapter(),
        }),
    });
    assertEqual(result.errors.length, 0);
    const input = result.elements[0];
    assertEqual(input.nodeName, "ui-input");
    assertEqual(input.getAttribute("label"), "Search");
    assertEqual(input.getAttribute("placeholder"), "Search products…");
    assertEqual(input.getAttribute("name"), "q");
    assertEqual(input.getAttribute("input-type"), "search");
    assertEqual(input.getAttribute("max-length"), "80");
    assertEqual(input.getAttribute("data-source-url"), "/api/search/suggestions?fields=title,query");
    assertEqual(input.getAttribute("data-source-response-path"), "suggestions");
    assertEqual(input.getAttribute("data-source-label-field"), "title");
    assertEqual(input.getAttribute("data-source-value-field"), "query");
    const container = new MockElement("div");
    container.appendChild(input);
    await resolveDataSourceElements(container, {
        fetch: mockFetch,
    });
    assertEqual(fetchCalls.length, 1, "Expected exactly one injected fetch.");
    assertEqual(fetchCalls[0], "/api/search/suggestions?fields=title,query");
    const boundRaw = input.getAttribute("data-bound-options");
    assertTrue(boundRaw !== null, "Expected data-bound-options to be set.");
    const boundOptions = JSON.parse(boundRaw);
    assertEqual(boundOptions.length, 2);
    assertEqual(boundOptions[0].value, "native");
    assertEqual(boundOptions[0].label, "Native Web Components");
    assertEqual(boundOptions[1].value, "renderer");
    assertEqual(boundOptions[1].label, "JSON Renderer");
    assertEqual(input.getAttribute("data-ds-status"), null);
    const datalist = findPart(input, "suggestions");
    assertTrue(datalist !== undefined, "Expected a datalist part.");
    const datalistOptions = datalist.children.filter((child) => child instanceof MockElement && child.nodeName === "option");
    assertEqual(datalistOptions.length, 2);
    assertEqual(datalistOptions[0].value, "native");
    assertEqual(datalistOptions[0].textContent, "Native Web Components");
    assertEqual(datalistOptions[1].value, "renderer");
    assertEqual(datalistOptions[1].textContent, "JSON Renderer");
});
await asyncTest("Enter triggers navigation to the encoded URL through the stub adapter", async () => {
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const adapter = new StubNavigationAdapter();
    const result = renderDocument([searchInputInstance()], {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        actionExecutor: new ActionExecutor({ navigationAdapter: adapter }),
    });
    assertEqual(result.errors.length, 0);
    const input = result.elements[0];
    const container = new MockElement("div");
    container.appendChild(input);
    const innerInput = findPart(input, "input");
    assertTrue(innerInput !== undefined, "Expected an inner input part.");
    innerInput.value = "red shoes & more";
    innerInput.dispatchEvent(new MockEvent("keydown", {
        key: "Enter",
        bubbles: true,
        composed: true,
    }));
    assertEqual(adapter.navigations.length, 1);
    assertEqual(adapter.navigations[0], "/search?q=red%20shoes%20%26%20more");
    assertEqual(adapter.newWindows.length, 0);
});
test("Example document JSON round-trips through export/import unchanged", () => {
    const exampleDir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(exampleDir, "..", "document.json"), "utf-8");
    const imported = JSON.parse(raw);
    const exported = JSON.parse(JSON.stringify(imported));
    assertEqual(JSON.stringify(exported), JSON.stringify(imported));
    const { metadataRegistry, nativeRegistry } = createRegistries();
    const result = renderDocument(exported, {
        metadataRegistry,
        nativeRegistry,
        mode: "interactive",
        actionExecutor: new ActionExecutor({
            navigationAdapter: new StubNavigationAdapter(),
        }),
    });
    assertEqual(result.errors.length, 0);
    assertEqual(result.elements.length, 6);
    assertEqual(result.elements[5].nodeName, "ui-input");
    assertEqual(result.elements[5].getAttribute("name"), "q");
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
//# sourceMappingURL=input-workflow.test.js.map