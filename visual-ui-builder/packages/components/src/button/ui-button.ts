const buttonStyles = `
:host {
  display: inline-block;
  --ui-button-radius: 0.375rem;
  --ui-button-padding: 0.5rem 1rem;
  --ui-button-font-size: 1rem;
  --ui-button-font-weight: 500;
  --ui-button-line-height: 1.5;
  --ui-button-primary-background: #2563eb;
  --ui-button-primary-color: #ffffff;
  --ui-button-primary-border: transparent;
  --ui-button-secondary-background: #ffffff;
  --ui-button-secondary-color: #111827;
  --ui-button-secondary-border: #d1d5db;
  --ui-button-ghost-background: transparent;
  --ui-button-ghost-color: #2563eb;
  --ui-button-ghost-border: transparent;
  --ui-button-disabled-opacity: 0.5;
  --ui-button-focus-color: #2563eb;
}

[part="button"] {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 2.25rem;
  padding: var(--ui-button-padding);
  border: 1px solid transparent;
  border-radius: var(--ui-button-radius);
  font-family: inherit;
  font-size: var(--ui-button-font-size);
  font-weight: var(--ui-button-font-weight);
  line-height: var(--ui-button-line-height);
  text-align: center;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

[part="button"][data-variant="primary"] {
  background: var(--ui-button-primary-background);
  color: var(--ui-button-primary-color);
  border-color: var(--ui-button-primary-border);
}

[part="button"][data-variant="secondary"] {
  background: var(--ui-button-secondary-background);
  color: var(--ui-button-secondary-color);
  border-color: var(--ui-button-secondary-border);
}

[part="button"][data-variant="ghost"] {
  background: var(--ui-button-ghost-background);
  color: var(--ui-button-ghost-color);
  border-color: var(--ui-button-ghost-border);
}

[part="button"]:disabled {
  opacity: var(--ui-button-disabled-opacity);
  cursor: not-allowed;
}

[part="button"]:focus-visible {
  outline: 2px solid var(--ui-button-focus-color);
  outline-offset: 2px;
}
`;

const VALID_VARIANTS = new Set(["primary", "secondary", "ghost"]);

const DEFAULT_LABEL = "Button";
const DEFAULT_VARIANT = "primary";

function isValidVariant(value: string): boolean {
  return VALID_VARIANTS.has(value);
}

function parseBooleanAttribute(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  return value.toLowerCase() !== "false";
}

/**
 * Native Web Component that renders an accessible button control.
 *
 * Supported attributes:
 * - label:    visible button text (rendered with textContent, default "Button")
 * - variant:  visual style, one of primary, secondary, or ghost (default primary)
 * - disabled: whether the button is disabled (default false)
 */
export class UIButton extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["label", "variant", "disabled"];
  }

  private button: HTMLButtonElement;

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = buttonStyles;
    shadow.appendChild(style);

    this.button = document.createElement("button");
    this.button.setAttribute("part", "button");
    this.button.setAttribute("type", "button");
    shadow.appendChild(this.button);
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    _newValue: string | null,
  ): void {
    if (name === "label" || name === "variant" || name === "disabled") {
      this.updateButton();
    }
  }

  connectedCallback(): void {
    this.updateButton();
  }

  private updateButton(): void {
    const label = this.getAttribute("label") ?? DEFAULT_LABEL;
    this.button.textContent = label;

    const variant = this.getAttribute("variant") ?? DEFAULT_VARIANT;
    this.button.setAttribute(
      "data-variant",
      isValidVariant(variant) ? variant : DEFAULT_VARIANT,
    );

    const disabled = parseBooleanAttribute(this.getAttribute("disabled"));
    this.button.disabled = disabled;
    if (disabled) {
      this.button.setAttribute("disabled", "");
    } else {
      this.button.removeAttribute("disabled");
    }
  }
}

export function registerUIButton(): void {
  if (typeof customElements === "undefined") {
    return;
  }

  if (!customElements.get("ui-button")) {
    customElements.define("ui-button", UIButton);
  }
}
