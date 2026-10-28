const textStyles = `
:host {
  display: block;
  width: 100%;
  --ui-text-color: #000000;
  --ui-text-align: left;
}

[part="text"] {
  display: block;
  width: 100%;
  color: var(--ui-text-color);
  text-align: var(--ui-text-align, left);
  line-height: 1.5;
}
`;

const VALID_ALIGNMENTS = new Set(["left", "center", "right"]);

function isValidAlignment(value: string): boolean {
  return VALID_ALIGNMENTS.has(value);
}

/**
 * Native Web Component that renders static text content safely.
 *
 * Supported attributes:
 * - content: visible text (rendered with textContent, never as HTML)
 * - color:   text color, defaulting to #000000
 * - align:   text alignment, one of left, center, or right
 */
export class UIText extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["content", "color", "align"];
  }

  private textElement: HTMLSpanElement;

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = textStyles;
    shadow.appendChild(style);

    this.textElement = document.createElement("span");
    this.textElement.setAttribute("part", "text");
    shadow.appendChild(this.textElement);
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    _newValue: string | null,
  ): void {
    if (name === "content" || name === "color" || name === "align") {
      this.updateContent();
    }
  }

  connectedCallback(): void {
    this.updateContent();
  }

  private updateContent(): void {
    const content = this.getAttribute("content") ?? "";
    this.textElement.textContent = content;

    const color = this.getAttribute("color") ?? "#000000";
    this.style.setProperty("--ui-text-color", color);

    const align = this.getAttribute("align") ?? "left";
    this.style.setProperty(
      "--ui-text-align",
      isValidAlignment(align) ? align : "left",
    );
  }
}

export function registerUIText(): void {
  if (typeof customElements === "undefined") {
    return;
  }

  if (!customElements.get("ui-text")) {
    customElements.define("ui-text", UIText);
  }
}
