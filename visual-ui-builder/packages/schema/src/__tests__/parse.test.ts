import {
  columnsOf,
  entityById,
  parseSchemaGraph,
  usableRelationships,
} from "../index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectError(value: unknown, field: string): void {
  try {
    parseSchemaGraph(value);
  } catch (error) {
    assert(error instanceof Error, "Expected an Error");
    assert(error.message.includes(field), `Expected error to name ${field}, got ${error.message}`);
    return;
  }
  throw new Error(`Expected invalid field ${field} to be rejected`);
}

const document = {
  specVersion: "1.0",
  sources: ["commerce", "crm"],
  ignored: "extra graph field",
  entities: [
    {
      id: "commerce.orders", source: "commerce", name: "orders", kind: "table",
      label: "Orders", keyColumns: ["id"], ignored: true,
      columns: [
        { id: "order.id", name: "id", type: "integer", category: "NUMBER", nullable: false, label: "Order ID" },
        { id: "order.customer_id", name: "customer_id", type: "uuid", category: "OTHER", nullable: false, label: "Customer ID" },
      ],
    },
    {
      id: "crm.customers", source: "crm", name: "customers", kind: "view",
      label: "Customers", keyColumns: ["id"],
      columns: [
        { id: "customer.id", name: "id", type: "uuid", category: "OTHER", nullable: false, label: "Customer ID" },
        { id: "customer.name", name: "name", type: "varchar", category: "TEXT", nullable: true, label: "Name" },
      ],
    },
  ],
  relationships: [
    { id: "declared", from: "order.customer_id", to: "customer.id", origin: "database", scope: "cross-source", status: "declared" },
    { id: "confirmed", from: "order.customer_id", to: "customer.id", origin: "profile", scope: "cross-source", status: "confirmed" },
    { id: "proposed", from: "order.customer_id", to: "customer.id", origin: "inference", scope: "cross-source", status: "proposed" },
    { id: "rejected", from: "order.customer_id", to: "customer.id", origin: "review", scope: "cross-source", status: "rejected" },
  ],
};

const graph = parseSchemaGraph(document);
assert(graph.sources.length === 2, "Expected two sources");
assert(graph.entities.length === 2, "Expected two entities");
assert(!("ignored" in graph), "Unknown graph fields should be ignored");
assert(!("ignored" in graph.entities[0]!), "Unknown entity fields should be ignored");
assert(entityById(graph, "crm.customers")?.label === "Customers", "Expected entity lookup");
assert(columnsOf(graph, "commerce.orders").length === 2, "Expected entity columns");
assert(columnsOf(graph, "missing").length === 0, "Missing entities should have no columns");

expectError({ ...document, specVersion: undefined }, "specVersion");
expectError({ ...document, sources: "commerce" }, "sources");
expectError({ ...document, entities: [{ ...document.entities[0], columns: [{ ...document.entities[0]!.columns[0], nullable: "no" }] }] }, "entities[0].columns[0].nullable");
expectError({ ...document, relationships: [{ ...document.relationships[0], status: "unknown" }] }, "relationships[0].status");

const usable = usableRelationships(graph);
assert(usable.map(({ id }) => id).join(",") === "declared,confirmed", "Only declared and confirmed relationships should be usable");

console.log("[PASS] schema graph parsing, validation, and relationship filtering");
