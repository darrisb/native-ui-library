const dropdownStyles = `
:host {
  display: block;
  --ui-dropdown-font-size: 1rem;
  --ui-dropdown-font-family: inherit;
  --ui-dropdown-padding: 0.375rem 0.75rem;
  --ui-dropdown-border-color: #d1d5db;
  --ui-dropdown-border-radius: 0.375rem;
  --ui-dropdown-background: #ffffff;
  --ui-dropdown-color: #111827;
  --ui-dropdown-label-color: #374151;
  --ui-dropdown-label-font-size: 0.875rem;
  --ui-dropdown-label-font-weight: 500;
  --ui-dropdown-disabled-opacity: 0.5;
  --ui-dropdown-focus-color: #2563eb;
  --ui-dropdown-error-color: #dc2626;
  --ui-dropdown-error-background: #fef2f2;
  --ui-dropdown-placeholder-color: #9ca3af;
}

[part="label"] {
  display: block;
  margin-bottom: 0.25rem;
  font-family: var(--ui-dropdown-font-family);
  font-size: var(--ui-dropdown-label-font-size);
  font-weight: var(--ui-dropdown-label-font-weight);
  color: var(--ui-dropdown-label-color);
}

[part="select"] {
  display: block;
  width: 100%;
  padding: var(--ui-dropdown-padding);
  border: 1px solid var(--ui-dropdown-border-color);
  border-radius: var(--ui-dropdown-border-radius);
  background: var(--ui-dropdown-background);
  color: var(--ui-dropdown-color);
  font-family: var(--ui-dropdown-font-family);
  font-size: var(--ui-dropdown-font-size);
  line-height: 1.5;
  appearance: auto;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

[part="select"]:disabled {
  opacity: var(--ui-dropdown-disabled-opacity);
  cursor: not-allowed;
}

[part="select"]:focus-visible {
  outline: 2px solid var(--ui-dropdown-focus-color);
  outline-offset: 1px;
  border-color: var(--ui-dropdown-focus-color);
}

[part="select"][aria-invalid="true"] {
  border-color: var(--ui-dropdown-error-color);
  background: var(--ui-dropdown-error-background);
}

[part="error"] {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--ui-dropdown-error-color);
}

option[disabled] {
  color: var(--ui-dropdown-placeholder-color);
}
`;

type DropdownOption = {
  value: string;
  label: string;
};

type DataSourceStatus = "idle" | "loading" | "empty" | "error";

function parseBooleanAttribute(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  return value.toLowerCase() !== "false";
}

function parseOptionsJSON(value: string | null): DropdownOption[] | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as DropdownOption[];
    }
    return null;
  } catch {
    return null;
  }
}

function getStatus(el: UIDropdown): DataSourceStatus {
  const status = el.getAttribute("data-ds-status");
  if (status === "loading" || status === "empty" || status === "error") {
    return status;
  }
  return "idle";
}

/**
 * Native Web Component that renders an accessible dropdown (select) control.
 *
 * Supported attributes:
 * - label:              visible label text above the select
 * - placeholder:        text for the placeholder option (disabled, first option)
 * - name:               name attribute on the native <select>
 * - required:           whether the select is required
 * - disabled:           whether the select is disabled
 * - options:            JSON array of {value, label} for static options
 * - data-bound-options: JSON array written by the binding adapter (takes priority)
 * - data-ds-status:     one of idle, loading, empty, error
 * - data-ds-error:      error message text shown when data-ds-status is "error"
 */
export class UIDropdown extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      "label",
      "placeholder",
      "name",
      "required",
      "disabled",
      "options",
      "data-bound-options",
      "data-ds-status",
      "data-ds-error",
    ];
  }

  private labelEl: HTMLLabelElement;
  private selectEl: HTMLSelectElement;
  private errorEl: HTMLDivElement;
  private idCounter: number;
  private selectId: string;

  constructor() {
    super();

    this.idCounter = Date.now() + Math.floor(Math.random() * 10000);
    this.selectId = `ui-dropdown-select-${this.idCounter}`;

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = dropdownStyles;
    shadow.appendChild(style);

    this.labelEl = document.createElement("label");
    this.labelEl.setAttribute("part", "label");
    this.labelEl.setAttribute("for", this.selectId);
    shadow.appendChild(this.labelEl);

    this.selectEl = document.createElement("select");
    this.selectEl.setAttribute("part", "select");
    this.selectEl.setAttribute("id", this.selectId);
    shadow.appendChild(this.selectEl);

    this.errorEl = document.createElement("div");
    this.errorEl.setAttribute("part", "error");
    shadow.appendChild(this.errorEl);

    this.selectEl.addEventListener("change", (e: Event) => {
      e.stopPropagation();
      const newValue = this.selectEl.value;
      this._value = newValue;
      const event = new CustomEvent("change", {
        bubbles: true,
        composed: true,
        detail: { value: newValue },
      });
      this.dispatchEvent(event);
    });
  }

  private _value: string = "";

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = val;
    if (this.selectEl) {
      this.selectEl.value = val;
    }
  }

  attributeChangedCallback(
    _name: string,
    _oldValue: string | null,
    _newValue: string | null,
  ): void {
    this.update();
  }

  connectedCallback(): void {
    this.update();
  }

  private update(): void {
    const label = this.getAttribute("label");
    const placeholder = this.getAttribute("placeholder");
    const name = this.getAttribute("name");
    const required = parseBooleanAttribute(
      this.getAttribute("required"),
    );
    const disabled = parseBooleanAttribute(
      this.getAttribute("disabled"),
    );
    const status = getStatus(this);
    const errorText = this.getAttribute("data-ds-error");

    // Update label
    this.labelEl.textContent = label ?? "";

    // Update name
    if (name !== null) {
      this.selectEl.setAttribute("name", name);
    } else {
      this.selectEl.removeAttribute("name");
    }

    // Update required
    this.selectEl.required = required;
    if (required) {
      this.selectEl.setAttribute("required", "");
    } else {
      this.selectEl.removeAttribute("required");
    }

    // Determine effective disabled state
    const isDisabled = disabled || status === "loading";
    this.selectEl.disabled = isDisabled;
    if (isDisabled) {
      this.selectEl.setAttribute("disabled", "");
    } else {
      this.selectEl.removeAttribute("disabled");
    }

    // Handle data source status
    if (status === "loading") {
      this.selectEl.setAttribute("aria-busy", "true");
      this.selectEl.removeAttribute("aria-invalid");
      this.errorEl.textContent = "";
      this.renderLoadingOptions();
      return;
    }

    if (status === "error") {
      this.selectEl.removeAttribute("aria-busy");
      this.selectEl.setAttribute("aria-invalid", "true");
      this.errorEl.textContent = errorText ?? "";
    } else if (status === "empty") {
      this.selectEl.removeAttribute("aria-busy");
      this.selectEl.removeAttribute("aria-invalid");
      this.errorEl.textContent = "";
    } else {
      // idle
      this.selectEl.removeAttribute("aria-busy");
      this.selectEl.removeAttribute("aria-invalid");
      this.errorEl.textContent = "";
    }

    // Get options
    const dataBoundRaw = this.getAttribute("data-bound-options");
    let options: DropdownOption[] | null = null;

    if (dataBoundRaw !== null) {
      options = parseOptionsJSON(dataBoundRaw);
    }

    if (options === null) {
      const rawOptions = this.getAttribute("options");
      options = parseOptionsJSON(rawOptions);
    }

    if (options === null) {
      // No valid options at all
      this.selectEl.replaceChildren();
      return;
    }

    // Render options
    this.renderOptions(options, placeholder, required);
  }

  private renderLoadingOptions(): void {
    const option = document.createElement("option");
    option.disabled = true;
    option.value = "";
    option.textContent = "Loading\u2026";
    this.selectEl.replaceChildren(option);
  }

  private renderOptions(
    options: DropdownOption[],
    placeholder: string | null,
    required: boolean,
  ): void {
    if (options.length === 0) {
      const option = document.createElement("option");
      option.disabled = true;
      option.value = "";
      option.textContent = "No options";
      this.selectEl.replaceChildren(option);
      return;
    }

    const children: Node[] = [];

    // Placeholder option: show when not (required AND has a current value)
    if (placeholder !== null && placeholder !== "") {
      const showPlaceholder = !(required && this._value !== "");
      if (showPlaceholder) {
        const opt = document.createElement("option");
        opt.disabled = true;
        opt.value = "";
        opt.textContent = placeholder;
        children.push(opt);
      }
    }

    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      children.push(option);
    }

    this.selectEl.replaceChildren(...children);

    // Restore selected value
    if (this._value !== "") {
      this.selectEl.value = this._value;
    }
  }
}

export function registerUIDropdown(): void {
  if (typeof customElements === "undefined") {
    return;
  }

  if (!customElements.get("ui-dropdown")) {
    customElements.define("ui-dropdown", UIDropdown);
  }
}
