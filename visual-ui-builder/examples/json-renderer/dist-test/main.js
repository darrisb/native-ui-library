import { ComponentRegistry } from "@visual-ui/core";
import { NativeComponentRegistry, registerCard, registerText, registerButton, registerDropdown, } from "@visual-ui/components";
import { renderDocument } from "./renderer.js";
/**
 * Walks the rendered DOM and resolves data-source dropdowns by fetching their
 * configured URL, extracting items via responsePath, and mapping label/value
 * fields into the `data-bound-options` attribute.
 */
export async function resolveDataSourceDropdowns(root) {
    const dropdowns = root.querySelectorAll("ui-dropdown[data-source-url]");
    const promises = [];
    for (const el of dropdowns) {
        const url = el.getAttribute("data-source-url");
        const responsePath = el.getAttribute("data-source-response-path") ?? "";
        const labelField = el.getAttribute("data-source-label-field") ?? "label";
        const valueField = el.getAttribute("data-source-value-field") ?? "value";
        if (!url)
            continue;
        el.setAttribute("data-ds-status", "loading");
        const promise = (async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} fetching ${url}`);
                }
                const json = await response.json();
                // Navigate the response path (e.g. "items" or "data.results")
                let data = json;
                for (const segment of responsePath.split(".")) {
                    if (data == null || typeof data !== "object")
                        break;
                    data = data[segment];
                }
                if (!Array.isArray(data)) {
                    el.setAttribute("data-ds-status", "empty");
                    return;
                }
                const options = data.map((item) => ({
                    value: String(item[valueField] ?? ""),
                    label: String(item[labelField] ?? ""),
                }));
                el.setAttribute("data-bound-options", JSON.stringify(options));
                if (options.length === 0) {
                    el.setAttribute("data-ds-status", "empty");
                }
                else {
                    el.removeAttribute("data-ds-status");
                }
            }
            catch (error) {
                el.setAttribute("data-ds-status", "error");
                el.setAttribute("data-ds-error", error instanceof Error ? error.message : String(error));
            }
        })();
        promises.push(promise);
    }
    await Promise.all(promises);
}
function showError(container, message) {
    container.innerHTML = "";
    const errorElement = document.createElement("div");
    errorElement.className = "error-message";
    errorElement.setAttribute("role", "alert");
    const heading = document.createElement("h2");
    heading.textContent = "Rendering failed";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    errorElement.appendChild(heading);
    errorElement.appendChild(paragraph);
    container.appendChild(errorElement);
}
async function loadDocument() {
    const documentModule = (await import("./document.json"));
    return documentModule.default;
}
async function renderApp() {
    const container = document.getElementById("app");
    if (!container) {
        console.error("Application container #app is missing.");
        return;
    }
    try {
        const jsonDocument = await loadDocument();
        const metadataRegistry = new ComponentRegistry();
        const nativeRegistry = new NativeComponentRegistry();
        registerCard(metadataRegistry, nativeRegistry);
        registerText(metadataRegistry, nativeRegistry);
        registerButton(metadataRegistry, nativeRegistry);
        registerDropdown(metadataRegistry, nativeRegistry);
        const result = renderDocument(jsonDocument, {
            metadataRegistry,
            nativeRegistry,
        });
        if (result.errors.length > 0) {
            const messages = result.errors
                .map((error) => {
                const context = error.id && error.type
                    ? `[${error.type} id: ${error.id}] `
                    : "";
                return `${context}${error.message}`;
            })
                .join("\n");
            showError(container, messages);
            return;
        }
        container.innerHTML = "";
        for (const element of result.elements) {
            container.appendChild(element);
        }
        await resolveDataSourceDropdowns(container);
        attachWelcomeButtonListener(container);
    }
    catch (error) {
        showError(container, error instanceof Error ? error.message : String(error));
    }
}
function attachWelcomeButtonListener(container) {
    const button = container.querySelector("ui-button");
    if (!button) {
        return;
    }
    const status = document.createElement("p");
    status.className = "button-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = "Button clicks: 0";
    container.appendChild(status);
    let clickCount = 0;
    button.addEventListener("click", () => {
        clickCount += 1;
        status.textContent = `Button clicks: ${clickCount}`;
    });
}
renderApp();
//# sourceMappingURL=main.js.map