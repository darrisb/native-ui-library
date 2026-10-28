import "./styles.css";
import { renderAppShell } from "./shell/app-shell";
import { createNestedBuilderDocument } from "./fixtures/nested-document";

function initialize(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    return;
  }

  // Development-only: load the nested fixture via ?fixture=nested.
  // Normal sessions start with an empty document.
  const params = new URLSearchParams(window.location.search);
  const initialDocument =
    params.get("fixture") === "nested" ? createNestedBuilderDocument() : undefined;

  renderAppShell(app, { initialDocument });
}

initialize();
