import type { ComponentDefinition } from "../types/component-definition.js";
import type { ComponentRegistry } from "../registry/component-registry.js";

export const cardDefinition: ComponentDefinition = {
  type: "card",
  name: "Card",
  category: "content",
  description: "Container for related content.",
  allowChildren: true,
  properties: [
    {
      name: "title",
      type: "string",
      label: "Title",
      defaultValue: ""
    },
    {
      name: "description",
      type: "string",
      label: "Description",
      defaultValue: "",
      required: false,
      multiline: true
    },
    {
      name: "padding",
      type: "number",
      label: "Padding",
      defaultValue: 16
    },
    {
      name: "backgroundColor",
      type: "color",
      label: "Background Color",
      defaultValue: "#ffffff"
    }
  ]
};

export const buttonDefinition: ComponentDefinition = {
  type: "button",
  name: "Button",
  category: "actions",
  description: "Interactive button control.",
  allowChildren: false,
  properties: [
    {
      name: "label",
      type: "string",
      label: "Label",
      defaultValue: "Button"
    },
    {
      name: "variant",
      type: "select",
      label: "Variant",
      defaultValue: "primary",
      choices: ["primary", "secondary", "ghost"] as const
    },
    {
      name: "disabled",
      type: "boolean",
      label: "Disabled",
      defaultValue: false
    }
  ]
};

export const textDefinition: ComponentDefinition = {
  type: "text",
  name: "Text",
  category: "content",
  description: "Static text content.",
  allowChildren: false,
  properties: [
    {
      name: "content",
      type: "string",
      label: "Content",
      defaultValue: ""
    },
    {
      name: "color",
      type: "color",
      label: "Color",
      defaultValue: "#000000"
    },
    {
      name: "align",
      type: "select",
      label: "Alignment",
      defaultValue: "left",
      choices: ["left", "center", "right"] as const
    }
  ]
};

/** All sample component definitions. */
export const sampleDefinitions: readonly ComponentDefinition[] = [
  cardDefinition,
  buttonDefinition,
  textDefinition
];

/** Registers all sample definitions on the supplied registry. */
export function registerSampleDefinitions(registry: ComponentRegistry): void {
  for (const definition of sampleDefinitions) {
    registry.register(definition);
  }
}
