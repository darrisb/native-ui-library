import type { ComponentInstance } from "@visual-ui/core";

type PropertyAdapter = (
  element: HTMLElement,
  properties: ComponentInstance["properties"]
) => void;

const cardAdapter: PropertyAdapter = (element, properties) => {
  if (properties.title !== undefined) {
    element.setAttribute("title", String(properties.title));
  }

  if (properties.description !== undefined) {
    element.setAttribute("description", String(properties.description));
  }

  if (properties.padding !== undefined) {
    element.style.setProperty(
      "--ui-card-padding",
      `${String(properties.padding)}px`
    );
  }

  if (properties.backgroundColor !== undefined) {
    element.style.setProperty(
      "--ui-card-background",
      String(properties.backgroundColor)
    );
  }
};

const textAdapter: PropertyAdapter = (element, properties) => {
  if (properties.content !== undefined) {
    element.setAttribute("content", String(properties.content));
  }

  if (properties.color !== undefined) {
    element.setAttribute("color", String(properties.color));
  }

  if (properties.align !== undefined) {
    element.setAttribute("align", String(properties.align));
  }
};

const buttonAdapter: PropertyAdapter = (element, properties) => {
  if (properties.label !== undefined) {
    element.setAttribute("label", String(properties.label));
  }

  if (properties.variant !== undefined) {
    element.setAttribute("variant", String(properties.variant));
  }

  if (properties.disabled === true) {
    element.setAttribute("disabled", "");
  } else if (properties.disabled === false) {
    element.removeAttribute("disabled");
  }
};

const adapters = new Map<string, PropertyAdapter>([
  ["card", cardAdapter],
  ["text", textAdapter],
  ["button", buttonAdapter],
]);

export function applyComponentProperties(
  element: HTMLElement,
  instance: ComponentInstance
): void {
  const adapter = adapters.get(instance.type);
  if (!adapter) {
    throw new Error(
      `No property adapter registered for component type "${instance.type}".`
    );
  }
  adapter(element, instance.properties);
}
