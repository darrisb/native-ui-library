import {
  isValidDataPath,
  isValidFilterField,
  type ComponentInstance,
  type RestDataSource,
} from "@visual-ui/core";

import { entityById, usableRelationships } from "./parse.js";
import type { GraphColumn, GraphEntity, SchemaGraph } from "./types.js";

export interface GenerateListPageOptions {
  readonly apiBaseUrl: string;
  readonly pageSize?: number;
  readonly maxColumns?: number;
  readonly maxTextFilters?: number;
}

const LABEL_COLUMN_NAMES = new Set(["name", "title", "label", "email"]);

function stablePart(value: string): string {
  const part = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return part || "entity";
}

function optionLimit(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : Math.max(0, Math.floor(value));
}

/** Build an endpoint with URL rather than concatenating unescaped URL text. */
function dataUrl(apiBaseUrl: string, source: string, entity: string): string {
  const absolute = /^[A-Za-z][A-Za-z\d+.-]*:/.test(apiBaseUrl);
  const base = absolute
    ? new URL(apiBaseUrl)
    : new URL(apiBaseUrl || ".", "https://list-page.invalid/");

  const basePath = base.pathname.replace(/\/$/, "");
  base.pathname = `${basePath}/api/data/${encodeURIComponent(source)}/${encodeURIComponent(entity)}`;
  base.search = new URLSearchParams().toString();
  base.hash = "";

  if (absolute) return base.toString();
  return `${base.pathname}${base.search}${base.hash}`;
}

function restSource(
  url: string,
  query: Readonly<Record<string, string>>,
  mapping?: Readonly<Record<string, string>>,
): RestDataSource {
  return {
    type: "rest",
    method: "GET",
    url,
    responsePath: "items",
    ...(mapping === undefined ? {} : { mapping }),
    query,
    loadOn: "mount",
  };
}

function labelColumn(entity: GraphEntity, key: string): GraphColumn | undefined {
  const textColumns = entity.columns.filter(({ category }) => category === "TEXT");
  return textColumns.find(({ name }) => LABEL_COLUMN_NAMES.has(name.toLowerCase()))
    ?? textColumns[0]
    ?? entity.columns.find(({ name }) => name === key);
}

function tableColumns(entity: GraphEntity, maximum: number): readonly GraphColumn[] {
  const keys = new Set(entity.keyColumns);
  const nonKeys = entity.columns.filter(({ name }) => !keys.has(name)).slice(0, maximum);
  const remaining = maximum - nonKeys.length;
  if (remaining <= 0) return nonKeys;
  return nonKeys.concat(
    entity.keyColumns
      .map((key) => entity.columns.find(({ name }) => name === key))
      .filter((column): column is GraphColumn => column !== undefined)
      .slice(0, remaining),
  );
}

/** Generate a read-only, renderer-compatible list page for one schema entity. */
export function generateListPage(
  graph: SchemaGraph,
  entityId: string,
  options: GenerateListPageOptions,
): ComponentInstance[] {
  const entity = entityById(graph, entityId);
  if (entity === undefined) throw new Error(`Unknown entity: ${entityId}`);

  const pageSize = optionLimit(options.pageSize, 25);
  const maxColumns = optionLimit(options.maxColumns, 8);
  const maxTextFilters = optionLimit(options.maxTextFilters, 2);
  const prefix = `list-${stablePart(entity.name)}`;
  const tableId = `${prefix}-table`;
  const filters: ComponentInstance[] = [];

  for (const relationship of usableRelationships(graph)) {
    const fromColumn = entity.columns.find(({ id }) => id === relationship.from);
    if (fromColumn === undefined) continue;

    const target = graph.entities.find((candidate) =>
      candidate.columns.some(({ id }) => id === relationship.to)
    );
    const key = target?.keyColumns[0];
    if (target === undefined || key === undefined) continue;
    const label = labelColumn(target, key);
    if (label === undefined) continue;
    if (
      !isValidFilterField(fromColumn.name)
      || !isValidDataPath(key)
      || !isValidDataPath(label.name)
    ) continue;

    filters.push({
      id: `${prefix}-filter-${stablePart(fromColumn.name)}-${stablePart(relationship.id)}`,
      type: "dropdown",
      properties: {
        label: target.label || target.name,
        placeholder: `All ${target.label || target.name}`,
        name: fromColumn.name,
        required: false,
        disabled: false,
        filterTarget: tableId,
        filterField: fromColumn.name,
        filterMode: "eq",
      },
      dataSource: restSource(
        dataUrl(options.apiBaseUrl, target.source, target.name),
        { fields: `${key},${label.name}`, limit: "200" },
        { value: key, label: label.name },
      ),
      bindings: [{ target: "options" }],
    });
  }

  for (const column of entity.columns
    .filter(({ category, name }) => category === "TEXT" && isValidFilterField(name))
    .slice(0, maxTextFilters)) {
    filters.push({
      id: `${prefix}-text-filter-${stablePart(column.name)}`,
      type: "input",
      properties: {
        label: column.label || column.name,
        placeholder: `Filter by ${column.label || column.name}`,
        name: column.name,
        inputType: "search",
        required: false,
        disabled: false,
        readonly: false,
        defaultValue: "",
        filterTarget: tableId,
        filterField: column.name,
        filterMode: "contains",
      },
    });
  }

  const columns = tableColumns(entity, maxColumns);
  const table: ComponentInstance = {
    id: tableId,
    type: "table",
    properties: {
      columns: columns.map(({ name, label }) => `${name}|${label || name}`).join("\n"),
      pageSize,
      sort: "",
    },
    dataSource: restSource(
      dataUrl(options.apiBaseUrl, entity.source, entity.name),
      { limit: String(pageSize) },
    ),
    bindings: [{ target: "rows" }],
  };

  return [{
    id: `${prefix}-card`,
    type: "card",
    properties: {
      title: entity.label || entity.name,
      description: "",
      padding: 16,
      backgroundColor: "#ffffff",
    },
    children: [...filters, table],
  }];
}
