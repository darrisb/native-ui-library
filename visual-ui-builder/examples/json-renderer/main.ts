import { ComponentRegistry } from "@visual-ui/core";
import {
  NativeComponentRegistry,
  registerCard,
  registerText,
  registerButton,
} from "@visual-ui/components";
import { ActionExecutor } from "@visual-ui/renderer";
import { renderDocument } from "./renderer.js";

function showError(container: HTMLElement, message: string): void {
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

async function loadDocument(): Promise<unknown> {
  const documentModule = (await import("./document.json")) as {
    default: unknown;
  };
  return documentModule.default;
}

async function renderApp(): Promise<void> {
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

    // The standalone runtime renders in interactive mode so that configured
    // declarative actions (e.g. navigate) are wired to the rendered elements.
    // The default ActionExecutor uses the browser's navigation adapter.
    const result = renderDocument(jsonDocument, {
      metadataRegistry,
      nativeRegistry,
      mode: "interactive",
      actionExecutor: new ActionExecutor(),
    });

    if (result.errors.length > 0) {
      const messages = result.errors
        .map((error) => {
          const context =
            error.id && error.type
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

    attachWelcomeButtonListener(container);
  } catch (error) {
    showError(container, error instanceof Error ? error.message : String(error));
  }
}

function attachWelcomeButtonListener(container: HTMLElement): void {
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
