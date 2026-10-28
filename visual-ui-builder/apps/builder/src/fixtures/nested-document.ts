import type { BuilderDocument } from "../state/builder-document.ts";

/**
 * Deterministic nested builder document for focused testing and manual
 * browser verification.
 *
 * Structure:
 * - root-card (Card)
 *   - text-1 (Text)
 *   - button-1 (Button)
 *   - nested-card (Card)
 *     - text-2 (Text)
 *
 * This fixture is not loaded automatically. Use the `?fixture=nested` query
 * parameter in development to load it into the builder, or import it directly
 * from tests.
 */
export function createNestedBuilderDocument(): BuilderDocument {
  return {
    rootInstances: [
      {
        id: "root-card",
        type: "card",
        properties: {
          title: "Root Card",
          description: "A root card with nested children.",
          padding: 16,
          backgroundColor: "#ffffff",
        },
        children: [
          {
            id: "text-1",
            type: "text",
            properties: {
              content: "Nested text content",
              color: "#000000",
              align: "left",
            },
          },
          {
            id: "button-1",
            type: "button",
            properties: {
              label: "Nested Button",
              variant: "primary",
              disabled: false,
            },
          },
          {
            id: "nested-card",
            type: "card",
            properties: {
              title: "Nested Card",
              description: "A card inside a card.",
              padding: 16,
              backgroundColor: "#f0f0f0",
            },
            children: [
              {
                id: "text-2",
                type: "text",
                properties: {
                  content: "Text inside nested card",
                  color: "#333333",
                  align: "center",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
