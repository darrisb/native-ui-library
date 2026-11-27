import type {
  GraphColumn,
  GraphColumnCategory,
  GraphEntity,
  GraphRelationship,
  GraphRelationshipStatus,
  GraphSource,
  SchemaGraph,
} from "./types.js";

const COLUMN_CATEGORIES: readonly GraphColumnCategory[] = [
  "NUMBER", "BOOLEAN", "DATE", "TIMESTAMP", "TEXT", "OTHER",
];
const RELATIONSHIP_STATUSES: readonly GraphRelationshipStatus[] = [
  "declared", "confirmed", "proposed", "rejected",
];

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid field ${field}`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Invalid field ${field}`);
  return value;
}

/**
 * Optional text: Schema to Entity sends null (or omits the field) when nothing
 * was set, for example a label nobody added in the overlay. Normalised to "".
 */
function optionalString(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  return string(value, field);
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid field ${field}`);
  return value;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid field ${field}`);
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  const parsed = string(value, field);
  if (!allowed.includes(parsed as T)) throw new Error(`Invalid field ${field}`);
  return parsed as T;
}

function parseStringArray(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => string(item, `${field}[${index}]`));
}

function parseColumn(value: unknown, field: string): GraphColumn {
  const input = record(value, field);
  return {
    id: string(input.id, `${field}.id`),
    name: string(input.name, `${field}.name`),
    type: string(input.type, `${field}.type`),
    category: oneOf(input.category, COLUMN_CATEGORIES, `${field}.category`),
    nullable: boolean(input.nullable, `${field}.nullable`),
    label: optionalString(input.label, `${field}.label`),
    description: optionalString(input.description, `${field}.description`),
  };
}

function parseEntity(value: unknown, field: string): GraphEntity {
  const input = record(value, field);
  return {
    id: string(input.id, `${field}.id`),
    source: string(input.source, `${field}.source`),
    name: string(input.name, `${field}.name`),
    kind: string(input.kind, `${field}.kind`),
    label: optionalString(input.label, `${field}.label`),
    description: optionalString(input.description, `${field}.description`),
    keyColumns: parseStringArray(input.keyColumns, `${field}.keyColumns`),
    columns: array(input.columns, `${field}.columns`).map((column, index) =>
      parseColumn(column, `${field}.columns[${index}]`)
    ),
  };
}

function parseRelationship(value: unknown, field: string): GraphRelationship {
  const input = record(value, field);
  return {
    id: string(input.id, `${field}.id`),
    from: string(input.from, `${field}.from`),
    to: string(input.to, `${field}.to`),
    origin: string(input.origin, `${field}.origin`),
    scope: string(input.scope, `${field}.scope`),
    status: oneOf(input.status, RELATIONSHIP_STATUSES, `${field}.status`),
  };
}

/**
 * Sources arrive as objects from Schema to Entity's GET /api/graph
 * ({id, databaseType, status, ...}); plain source-name strings are accepted too.
 */
function parseSource(value: unknown, field: string): GraphSource {
  if (typeof value === "string") {
    return { id: value, databaseType: "", status: "ok" };
  }
  const input = record(value, field);
  return {
    id: string(input.id, `${field}.id`),
    databaseType: optionalString(input.databaseType, `${field}.databaseType`),
    status: optionalString(input.status, `${field}.status`) || "ok",
  };
}

/** Parse and validate a Schema to Entity graph document. */
export function parseSchemaGraph(json: unknown): SchemaGraph {
  const input = record(json, "graph");
  const sourceDetails = array(input.sources, "sources").map((source, index) =>
    parseSource(source, `sources[${index}]`)
  );
  return {
    specVersion: string(input.specVersion, "specVersion"),
    sourceDetails,
    sources: sourceDetails.map(({ id }) => id),
    entities: array(input.entities, "entities").map((entity, index) =>
      parseEntity(entity, `entities[${index}]`)
    ),
    relationships: array(input.relationships, "relationships").map(
      (relationship, index) => parseRelationship(relationship, `relationships[${index}]`),
    ),
  };
}

export function entityById(graph: SchemaGraph, id: string): GraphEntity | undefined {
  return graph.entities.find((entity) => entity.id === id);
}

export function columnsOf(graph: SchemaGraph, entityId: string): readonly GraphColumn[] {
  return entityById(graph, entityId)?.columns ?? [];
}

export function usableRelationships(graph: SchemaGraph): readonly GraphRelationship[] {
  return graph.relationships.filter(
    ({ status }) => status === "declared" || status === "confirmed",
  );
}
