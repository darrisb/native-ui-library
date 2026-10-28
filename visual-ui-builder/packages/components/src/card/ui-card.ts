const cardStyles = `
:host {
  display: block;
  --ui-card-background: #ffffff;
  --ui-card-border-color: #e5e7eb;
  --ui-card-radius: 0.5rem;
  --ui-card-padding: 1rem;
  --ui-card-title-color: #111827;
  --ui-card-text-color: #4b5563;
}

[part="container"] {
  background: var(--ui-card-background);
  border: 1px solid var(--ui-card-border-color);
  border-radius: var(--ui-card-radius);
  padding: var(--ui-card-padding);
  color: var(--ui-card-text-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

[part="title"] {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ui-card-title-color);
  line-height: 1.4;
}

[part="description"] {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--ui-card-text-color);
  line-height: 1.5;
}

[part="content"] {
  font-size: 1rem;
  line-height: 1.5;
}

[part="content"] > *:first-child {
  margin-top: 0;
}

[part="content"] > *:last-child {
  margin-bottom: 0;
}
`;

export class UICard extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["title", "description"];
  }

  private container: HTMLElement;
  private titleElement: HTMLHeadingElement;
  private descriptionElement: HTMLParagraphElement;
  private contentElement: HTMLDivElement;

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = cardStyles;
    shadow.appendChild(style);

    this.container = document.createElement("article");
    this.container.setAttribute("part", "container");

    this.titleElement = document.createElement("h2");
    this.titleElement.setAttribute("part", "title");

    this.descriptionElement = document.createElement("p");
    this.descriptionElement.setAttribute("part", "description");

    this.contentElement = document.createElement("div");
    this.contentElement.setAttribute("part", "content");

    const slot = document.createElement("slot");
    this.contentElement.appendChild(slot);

    shadow.appendChild(this.container);
    this.updateContent();
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    _newValue: string | null,
  ): void {
    if (name === "title" || name === "description") {
      this.updateContent();
    }
  }

  connectedCallback(): void {
    this.updateContent();
  }

  private updateContent(): void {
    const title = this.getAttribute("title");
    const description = this.getAttribute("description");

    this.titleElement.textContent = title;
    this.descriptionElement.textContent = description;

    const hasTitle = title !== null && title.length > 0;
    const hasDescription = description !== null && description.length > 0;

    const children: Node[] = [];
    if (hasTitle) {
      children.push(this.titleElement);
    }
    if (hasDescription) {
      children.push(this.descriptionElement);
    }
    children.push(this.contentElement);

    this.container.replaceChildren(...children);
  }
}

export function registerUICard(): void {
  if (typeof customElements === "undefined") {
    return;
  }

  if (!customElements.get("ui-card")) {
    customElements.define("ui-card", UICard);
  }
}
