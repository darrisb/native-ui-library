import { generateListPage, parseSchemaGraph } from "../index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Shaped exactly like Schema to Entity's GET /api/graph response (the Java
 * SchemaGraph record serialised by Jackson): sources are objects, labels and
 * descriptions are null when nothing was set in the overlay, and extra fields
 * (generatedAt, catalog, confidence, evidence, baseTables, orphans) are present.
 */
const liveDocument = {
  specVersion: "1.0",
  generatedAt: "2026-11-27T22:10:00Z",
  sources: [
    { id: "billing", databaseType: "postgresql", catalog: "dynamic_meta_db", schema: "billing", status: "ok", error: null },
    { id: "demo", databaseType: "postgresql", catalog: "dynamic_meta_db", schema: "public", status: "ok", error: null },
  ],
  entities: [
    {
      id: "billing:invoices", source: "billing", name: "invoices", kind: "table",
      label: null, description: null, keyColumns: ["id"], baseTables: [],
      columns: [
        { id: "billing:invoices.id", name: "id", type: "int8", category: "NUMBER", nullable: false, label: null, description: null },
        { id: "billing:invoices.customer_id", name: "customer_id", type: "int8", category: "NUMBER", nullable: true, label: null, description: null },
        { id: "billing:invoices.status", name: "status", type: "varchar(20)", category: "TEXT", nullable: true, label: "Status", description: null },
      ],
    },
    {
      id: "demo:customers", source: "demo", name: "customers", kind: "table",
      label: "Customers", description: "People who place orders", keyColumns: ["id"], baseTables: [],
      columns: [
        { id: "demo:customers.id", name: "id", type: "int8", category: "NUMBER", nullable: false, label: null, description: null },
        { id: "demo:customers.name", name: "name", type: "text", category: "TEXT", nullable: true, label: null, description: null },
      ],
    },
  ],
  relationships: [
    {
      id: "billing:invoices.customer_id->demo:customers.id",
      from: "billing:invoices.customer_id", to: "demo:customers.id",
      origin: "inferred", scope: "cross-source", status: "confirmed",
      confidence: 0.8, evidence: ["name-match", "type-match", "key-name-match"],
    },
  ],
  orphans: [],
};

const graph = parseSchemaGraph(liveDocument);
assert(graph.sources.join(",") === "billing,demo", "Source objects should become source ids");
assert(graph.sourceDetails[0]?.databaseType === "postgresql", "Source details should keep the database type");
assert(graph.entities[0]?.label === "", "A null entity label should become an empty string");
assert(graph.entities[1]?.description === "People who place orders", "Descriptions should be kept");
assert(graph.entities[0]?.columns[2]?.label === "Status", "Column labels should be kept");

const page = generateListPage(graph, "billing:invoices", { apiBaseUrl: "http://localhost:8081" });
const card = page[0];
assert(card !== undefined && card.properties.title === "invoices", "An unlabelled entity should use its name as the title");
const dropdown = (card.children ?? []).find(({ type }) => type === "dropdown");
assert(dropdown !== undefined, "The confirmed cross-source relationship should become a filter");
const source = dropdown.dataSource as { url?: string };
assert(source.url === "http://localhost:8081/api/data/demo/customers", "The filter should read the other source");

console.log("[PASS] parses a live Schema to Entity graph document and generates a page from it");
