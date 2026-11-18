import type { ComponentInstance } from "@visual-ui/core";
import { parseStaticOptions } from "@visual-ui/core";

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

const dropdownAdapter: PropertyAdapter = (element, properties) => {
  if (properties.label !== undefined) {
    element.setAttribute("label", String(properties.label));
  }

  if (properties.placeholder !== undefined) {
    element.setAttribute("placeholder", String(properties.placeholder));
  }

  if (properties.name !== undefined) {
    element.setAttribute("name", String(properties.name));
  }

  if (properties.required === true) {
    element.setAttribute("required", "");
  } else if (properties.required === false) {
    element.removeAttribute("required");
  }

  if (properties.disabled === true) {
    element.setAttribute("disabled", "");
  } else if (properties.disabled === false) {
    element.removeAttribute("disabled");
  }

  if (properties.staticOptions !== undefined) {
    const raw = String(properties.staticOptions).trim();
    let options;
    // Try JSON array first: [{"value":"a","label":"Alpha"}, ...]
    if (raw.startsWith("[")) {
      try {
        options = JSON.parse(raw);
      } catch {
        options = parseStaticOptions(raw);
      }
    } else {
      // Multiline value|label format
      options = parseStaticOptions(raw);
    }
    element.setAttribute("options", JSON.stringify(options));
  }

  // Data-source properties: written as data attributes so a data-binding layer
  // can read them and perform a fetch to populate data-bound-options.
  if (properties.dataSourceUrl !== undefined) {
    element.setAttribute("data-source-url", String(properties.dataSourceUrl));
  }

  if (properties.dataSourceResponsePath !== undefined) {
    element.setAttribute(
      "data-source-response-path",
      String(properties.dataSourceResponsePath)
    );
  }

  if (properties.dataSourceLabelField !== undefined) {
    element.setAttribute(
      "data-source-label-field",
      String(properties.dataSourceLabelField)
    );
  }

  if (properties.dataSourceValueField !== undefined) {
    element.setAttribute(
      "data-source-value-field",
      String(properties.dataSourceValueField)
    );
  }
};

const adapters = new Map<string, PropertyAdapter>([
  ["card", cardAdapter],
  ["text", textAdapter],
  ["button", buttonAdapter],
  ["dropdown", dropdownAdapter],
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
