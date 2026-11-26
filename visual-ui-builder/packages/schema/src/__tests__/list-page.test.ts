import {
  validateDataSourceContracts,
  validateFilterLinks,
  type ComponentInstance,
} from "@visual-ui/core";

import { generateListPage, parseSchemaGraph } from "../index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const graphDocument = {
  specVersion: "1.0",
  sources: ["commerce", "crm"],
  entities: [
    {
      id: "commerce.orders", source: "commerce", name: "orders", kind: "table",
      label: "Orders", keyColumns: ["id"],
      columns: [
        { id: "order.id", name: "id", type: "integer", category: "NUMBER", nullable: false, label: "Order ID" },
        { id: "order.customer_id", name: "customer_id", type: "uuid", category: "OTHER", nullable: false, label: "Customer" },
        { id: "order.description", name: "description", type: "varchar", category: "TEXT", nullable: true, label: "Description" },
      ],
    },
    {
      id: "crm.customers", source: "crm", name: "customers", kind: "table",
      label: "Customers", keyColumns: ["id"],
      columns: [
        { id: "customer.id", name: "id", type: "uuid", category: "OTHER", nullable: false, label: "Customer ID" },
        { id: "customer.email", name: "email", type: "varchar", category: "TEXT", nullable: false, label: "Email" },
      ],
    },
  ],
  relationships: [
    { id: "customer", from: "order.customer_id", to: "customer.id", origin: "profile", scope: "cross-source", status: "confirmed" },
  ],
};

function flatten(instances: readonly ComponentInstance[]): ComponentInstance[] {
  return instances.flatMap((instance) => [instance, ...flatten(instance.children ?? [])]);
}

function validateDocument(instances: readonly ComponentInstance[]): void {
  const filterIssues = validateFilterLinks(instances);
  assert(filterIssues.length === 0, `Filter validation failed: ${JSON.stringify(filterIssues)}`);
  for (const instance of flatten(instances)) {
    const issues = validateDataSourceContracts(
      instance.dataSource,
      instance.bindings,
      instance.id,
      [],
    );
    assert(issues.length === 0, `Data validation failed: ${JSON.stringify(issues)}`);
  }
}

const graph = parseSchemaGraph(graphDocument);
const first = generateListPage(graph, "commerce.orders", { apiBaseUrl: "/backend" });
const children = first[0]?.children ?? [];
const dropdown = children.find(({ type }) => type === "dropdown");
const table = children.find(({ type }) => type === "table");

assert(dropdown !== undefined, "A confirmed customer relationship should generate a dropdown");
assert(table !== undefined, "The page should contain a table");
assert(dropdown.properties.filterTarget === table.id, "Dropdown should target the generated table");
assert(dropdown.properties.filterField === "customer_id", "Dropdown should filter the from-column");
assert(dropdown.properties.filterMode === "eq", "Dropdown should use equality filtering");
assert(dropdown.dataSource?.type === "rest", "Dropdown should have a REST source");
assert(dropdown.dataSource.url === "/backend/api/data/crm/customers", "Cross-source URL should use the target source");
assert(dropdown.dataSource.query?.fields === "id,email", "Options query should request key and label columns");
assert(dropdown.dataSource.mapping?.value === "id", "Option value should map to the key");
assert(dropdown.dataSource.mapping?.label === "email", "Option label should map to the chosen text column");

validateDocument(first);
const second = generateListPage(graph, "commerce.orders", { apiBaseUrl: "/backend" });
assert(JSON.stringify(first) === JSON.stringify(second), "Generation should be stable across runs");

const proposedGraph = parseSchemaGraph({
  ...graphDocument,
  relationships: [{ ...graphDocument.relationships[0], status: "proposed" }],
});
const proposed = flatten(generateListPage(proposedGraph, "commerce.orders", { apiBaseUrl: "/backend" }));
assert(!proposed.some(({ type }) => type === "dropdown"), "A proposed relationship should not generate a dropdown");

const unsafeNamesGraph = parseSchemaGraph({
  ...graphDocument,
  entities: [
    {
      ...graphDocument.entities[0],
      columns: [
        ...graphDocument.entities[0].columns,
        { id: "order.unsafe_customer", name: "customer-id", type: "uuid", category: "OTHER", nullable: true, label: "Unsafe Customer" },
        { id: "order.unsafe_date", name: "Order Date", type: "varchar", category: "TEXT", nullable: true, label: "Order Date" },
      ],
    },
    {
      ...graphDocument.entities[1],
      keyColumns: ["customer-id"],
      columns: [
        { id: "customer.unsafe_id", name: "customer-id", type: "uuid", category: "OTHER", nullable: false, label: "Customer ID" },
        { id: "customer.unsafe_label", name: "display-name", type: "varchar", category: "TEXT", nullable: false, label: "Display Name" },
      ],
    },
  ],
  relationships: [
    { id: "unsafe-customer", from: "order.customer_id", to: "customer.unsafe_id", origin: "profile", scope: "cross-source", status: "confirmed" },
  ],
});
const unsafeNames = generateListPage(unsafeNamesGraph, "commerce.orders", { apiBaseUrl: "/backend" });
const unsafeFilters = flatten(unsafeNames).filter(({ type }) => type === "dropdown" || type === "input");
assert(
  !unsafeFilters.some(({ type, properties }) => type === "dropdown" || properties.filterField === "Order Date"),
  "Columns with unsafe filter fields or mapping paths should not generate filters",
);
validateDocument(unsafeNames);

console.log("[PASS] list-page generation, relationship filters, unsafe names, stability, and validation");
