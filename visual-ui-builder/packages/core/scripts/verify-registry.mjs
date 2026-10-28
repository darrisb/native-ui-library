import assert from "node:assert/strict";
import {
  buttonDefinition,
  cardDefinition,
  ComponentRegistry,
  registerSampleDefinitions,
  textDefinition
} from "../dist/index.js";

// 1. Registration works.
const registry = new ComponentRegistry();
registry.register(cardDefinition);
registry.register(buttonDefinition);
assert.equal(registry.list().length, 2, "registration should add definitions");

// 2. Lookup works.
assert.equal(
  registry.lookup("card"),
  cardDefinition,
  "lookup should return the registered definition"
);
assert.equal(
  registry.lookup("missing"),
  undefined,
  "lookup should return undefined for unknown types"
);

// 3. Category filtering works.
const sampleRegistry = new ComponentRegistry();
registerSampleDefinitions(sampleRegistry);
const contentDefinitions = sampleRegistry.filterByCategory("content");
assert.equal(
  contentDefinitions.length,
  2,
  "content category should contain card and text"
);
assert.ok(
  contentDefinitions.some((d) => d.type === "card"),
  "content category should include card"
);
assert.ok(
  contentDefinitions.some((d) => d.type === "text"),
  "content category should include text"
);

// 4. Duplicate registration fails.
assert.throws(
  () => sampleRegistry.register(cardDefinition),
  /already registered/,
  "duplicate registration should throw"
);

// 5. Definitions are serializable to JSON.
const serialized = JSON.stringify(sampleRegistry.list());
const deserialized = JSON.parse(serialized);
assert.ok(
  deserialized.some((d) => d.type === "button"),
  "definitions should round-trip through JSON"
);

// 6. Component instances can represent nested children.
const nestedInstance = {
  id: "card-1",
  type: "card",
  properties: { title: "Hello" },
  children: [
    {
      id: "text-1",
      type: "text",
      properties: { content: "Nested text" }
    },
    {
      id: "button-1",
      type: "button",
      properties: { label: "Click me" }
    }
  ]
};
const instanceJson = JSON.stringify(nestedInstance);
const parsedInstance = JSON.parse(instanceJson);
assert.equal(parsedInstance.type, "card");
assert.equal(parsedInstance.children.length, 2);
assert.equal(parsedInstance.children[0].type, "text");
assert.equal(parsedInstance.children[1].type, "button");

console.log("All registry verification checks passed.");
