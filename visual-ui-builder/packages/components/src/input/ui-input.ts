const inputStyles = `
:host {
  display: block;
  --ui-input-font-size: 1rem;
  --ui-input-font-family: inherit;
  --ui-input-padding: 0.375rem 0.75rem;
  --ui-input-border-color: #d1d5db;
  --ui-input-border-radius: 0.375rem;
  --ui-input-background: #ffffff;
  --ui-input-color: #111827;
  --ui-input-label-color: #374151;
  --ui-input-label-font-size: 0.875rem;
  --ui-input-label-font-weight: 500;
  --ui-input-disabled-opacity: 0.5;
  --ui-input-focus-color: #2563eb;
  --ui-input-placeholder-color: #9ca3af;
}

[part="label"] {
  display: block;
  margin-bottom: 0.25rem;
  font-family: var(--ui-input-font-family);
  font-size: var(--ui-input-label-font-size);
  font-weight: var(--ui-input-label-font-weight);
  color: var(--ui-input-label-color);
}

[part="input"] {
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: var(--ui-input-padding);
  border: 1px solid var(--ui-input-border-color);
  border-radius: var(--ui-input-border-radius);
  background: var(--ui-input-background);
  color: var(--ui-input-color);
  font-family: var(--ui-input-font-family);
  font-size: var(--ui-input-font-size);
  line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

[part="input"]:disabled {
  opacity: var(--ui-input-disabled-opacity);
  cursor: not-allowed;
}

[part="input"]:focus-visible {
  outline: 2px solid var(--ui-input-focus-color);
  outline-offset: 1px;
  border-color: var(--ui-input-focus-color);
}

[part="input"]::placeholder {
  color: var(--ui-input-placeholder-color);
}
`;

const VALID_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "number",
  "date",
  "tel",
  "url",
]);

const DEFAULT_INPUT_TYPE = "text";

function parseBooleanAttribute(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  return value.toLowerCase() !== "false";
}

function normalizeInputType(value: string | null): string {
  if (value === null) {
    return DEFAULT_INPUT_TYPE;
  }
  return VALID_INPUT_TYPES.has(value) ? value : DEFAULT_INPUT_TYPE;
}

function parseMaxLength(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

type InputOption = {
  value: string;
  label: string;
};

type DataSourceStatus = "idle" | "loading" | "empty" | "error";

function parseOptionsJSON(value: string | null): InputOption[] | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as InputOption[];
    }
    return null;
  } catch {
    return null;
  }
}

function getStatus(el: UIInput): DataSourceStatus {
  const status = el.getAttribute("data-ds-status");
  if (status === "loading" || status === "empty" || status === "error") {
    return status;
  }
  return "idle";
}

/**
 * Native Web Component that renders an accessible text input control.
 *
 * Supported attributes:
 * - label:              visible label text above the input
 * - placeholder:        placeholder text shown inside the input
 * - name:               name attribute on the native <input>
 * - input-type:         one of text, search, email, number, date, tel, url (default text)
 * - required:           whether the input is required
 * - disabled:           whether the input is disabled
 * - readonly:           whether the input is read only
 * - max-length:         maximum number of characters (optional)
 * - default-value:      initial value of the input
 * - data-bound-options: JSON array of {value, label} written by the binding
 *                       adapter; rendered as <datalist> suggestions
 * - data-ds-status:     one of idle, loading, empty, error
 * - data-ds-error:      error message text for the current suggestion state
 *
 * Events:
 * - input/change: bubbling, composed CustomEvents with detail {value}
 * - focus:        bubbling, composed CustomEvent fired when the inner input
 *                 receives focus, with detail {value}
 * - submit:       bubbling, composed CustomEvent fired when Enter is pressed,
 *                 with detail {value}
 */
export class UIInput extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      "label",
      "placeholder",
      "name",
      "input-type",
      "required",
      "disabled",
      "readonly",
      "max-length",
      "default-value",
      "data-bound-options",
      "data-ds-status",
      "data-ds-error",
    ];
  }

  private labelEl: HTMLLabelElement;
  private inputEl: HTMLInputElement;
  private datalistEl: HTMLDataListElement;
  private idCounter: number;
  private inputId: string;
  private datalistId: string;
  private _value: string | null = null;

  constructor() {
    super();

    this.idCounter = Date.now() + Math.floor(Math.random() * 10000);
    this.inputId = `ui-input-field-${this.idCounter}`;
    this.datalistId = `ui-input-suggestions-${this.idCounter}`;

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = inputStyles;
    shadow.appendChild(style);

    this.labelEl = document.createElement("label");
    this.labelEl.setAttribute("part", "label");
    this.labelEl.setAttribute("for", this.inputId);
    shadow.appendChild(this.labelEl);

    this.inputEl = document.createElement("input");
    this.inputEl.setAttribute("part", "input");
    this.inputEl.setAttribute("id", this.inputId);
    this.inputEl.setAttribute("list", this.datalistId);
    shadow.appendChild(this.inputEl);

    this.datalistEl = document.createElement("datalist");
    this.datalistEl.setAttribute("part", "suggestions");
    this.datalistEl.setAttribute("id", this.datalistId);
    shadow.appendChild(this.datalistEl);

    this.inputEl.addEventListener("input", (e: Event) => {
      e.stopPropagation();
      const newValue = this.inputEl.value;
      this._value = newValue;
      this.dispatchEvent(
        new CustomEvent("input", {
          bubbles: true,
          composed: true,
          detail: { value: newValue },
        })
      );
    });

    this.inputEl.addEventListener("change", (e: Event) => {
      e.stopPropagation();
      const newValue = this.inputEl.value;
      this._value = newValue;
      this.dispatchEvent(
        new CustomEvent("change", {
          bubbles: true,
          composed: true,
          detail: { value: newValue },
        })
      );
    });

    // Native focus does not bubble and cannot cross the shadow boundary, so
    // re-dispatch a composed CustomEvent from the host (mirroring the change
    // and submit events) to make the declared "focus" capability reachable.
    this.inputEl.addEventListener("focus", (e: Event) => {
      e.stopPropagation();
      this.dispatchEvent(
        new CustomEvent("focus", {
          bubbles: true,
          composed: true,
          detail: { value: this.inputEl.value },
        })
      );
    });

    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Enter") {
        return;
      }
      e.stopPropagation();
      const newValue = this.inputEl.value;
      this._value = newValue;
      this.dispatchEvent(
        new CustomEvent("submit", {
          bubbles: true,
          composed: true,
          detail: { value: newValue },
        })
      );
    });
  }

  get value(): string {
    if (this.inputEl) {
      return this.inputEl.value;
    }
    return this._value ?? "";
  }

  set value(val: string) {
    this._value = val;
    if (this.inputEl) {
      this.inputEl.value = val;
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
    // Update label
    const label = this.getAttribute("label");
    this.labelEl.textContent = label ?? "";

    // Update placeholder
    const placeholder = this.getAttribute("placeholder");
    if (placeholder !== null) {
      this.inputEl.setAttribute("placeholder", placeholder);
      this.inputEl.placeholder = placeholder;
    } else {
      this.inputEl.removeAttribute("placeholder");
      this.inputEl.placeholder = "";
    }

    // Update name
    const name = this.getAttribute("name");
    if (name !== null) {
      this.inputEl.setAttribute("name", name);
    } else {
      this.inputEl.removeAttribute("name");
    }

    // Update type, falling back to text for unsupported values
    const inputType = normalizeInputType(this.getAttribute("input-type"));
    this.inputEl.setAttribute("type", inputType);
    this.inputEl.type = inputType;

    // Update required
    const required = parseBooleanAttribute(this.getAttribute("required"));
    this.inputEl.required = required;
    if (required) {
      this.inputEl.setAttribute("required", "");
    } else {
      this.inputEl.removeAttribute("required");
    }

    // Update disabled
    const disabled = parseBooleanAttribute(this.getAttribute("disabled"));
    this.inputEl.disabled = disabled;
    if (disabled) {
      this.inputEl.setAttribute("disabled", "");
    } else {
      this.inputEl.removeAttribute("disabled");
    }

    // Update readonly
    const readonly = parseBooleanAttribute(this.getAttribute("readonly"));
    this.inputEl.readOnly = readonly;
    if (readonly) {
      this.inputEl.setAttribute("readonly", "");
    } else {
      this.inputEl.removeAttribute("readonly");
    }

    // Update maxlength
    const maxLength = parseMaxLength(this.getAttribute("max-length"));
    if (maxLength !== null) {
      this.inputEl.setAttribute("maxlength", String(maxLength));
      this.inputEl.maxLength = maxLength;
    } else {
      this.inputEl.removeAttribute("maxlength");
      this.inputEl.maxLength = -1;
    }

    // Link the suggestion datalist
    this.inputEl.setAttribute("list", this.datalistId);

    // Reflect the suggestion data-source status. Loading and error states
    // never disable the input, so typing always remains available.
    const status = getStatus(this);
    if (status === "loading") {
      this.inputEl.setAttribute("aria-busy", "true");
      this.inputEl.removeAttribute("aria-invalid");
    } else {
      this.inputEl.removeAttribute("aria-busy");
      if (status === "error") {
        this.inputEl.setAttribute("aria-invalid", "true");
      } else {
        this.inputEl.removeAttribute("aria-invalid");
      }
    }

    // Apply the default value only while no explicit value has been set
    if (this._value === null) {
      this.inputEl.value = this.getAttribute("default-value") ?? "";
    } else {
      this.inputEl.value = this._value;
    }

    this.renderSuggestions();
  }

  private renderSuggestions(): void {
    const options = parseOptionsJSON(this.getAttribute("data-bound-options"));

    if (options === null) {
      this.datalistEl.replaceChildren();
      return;
    }

    const children: Node[] = [];
    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      children.push(el);
    }

    this.datalistEl.replaceChildren(...children);
  }
}

export function registerUIInput(): void {
  if (typeof customElements === "undefined") {
    return;
  }

  if (!customElements.get("ui-input")) {
    customElements.define("ui-input", UIInput);
  }
}
