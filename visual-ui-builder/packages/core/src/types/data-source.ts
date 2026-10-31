/**
 * Declarative data source contracts for component instances.
 *
 * A data source describes *where* a component's data comes from declaratively,
 * without specifying *how* the fetch is performed. Components never fetch
 * themselves; a runtime orchestrator resolves data sources and applies the
 * resulting data to component bindings.
 *
 * This module establishes the contract and starts with REST GET. It also
 * defines the runtime lifecycle states (loading / empty / empty / error) that
 * a resolved data source moves through.
 *
 * All data is plain serializable data so instances survive JSON round-tripping
 * for import/export.
 */

/** HTTP methods supported by declarative data sources. REST GET only initially. */
export type DataSourceMethod = "GET";

/**
 * When a data source should be resolved relative to the component lifecycle.
 *
 * Only `"mount"` is supported initially; the data source resolves when the
 * component is mounted into the document.
 */
export type DataSourceLoadOn = "mount";

/**
 * Normalized lifecycle states of a resolved data source at runtime.
 *
 * These are runtime concepts only — they are never serialized into project
 * JSON. The orchestrator advances a data source through these states as it
 * resolves and binds data.
 */

export interface DataSourceIdleState {
  readonly status: "idle";
}

export interface DataSourceLoadingState {
  readonly status: "loading";
}

export interface DataSourceReadyState {
  readonly status: "ready";
  readonly data: unknown;
}

export interface DataSourceEmptyState {
  readonly status: "empty";
}

export interface DataSourceErrorState {
  readonly status: "error";
  readonly message: string;
}

/** Discriminated union of all data source runtime states. */
export type DataSourceRuntimeState =
  | DataSourceIdleState
  | DataSourceLoadingState
  | DataSourceReadyState
  | DataSourceEmptyState
  | DataSourceErrorState;

/**
 * A field mapping applied to each record extracted from the response.
 *
 * Keys are the normalized output field names (e.g. `"label"`, `"value"`,
 * `"id"`). Values are safe dot/array-index paths (see {@link isValidDataPath})
 * into each response record. The mapping lets a component declare the shape it
 * needs without the endpoint matching that shape exactly.
 *
 * Example: `{ "label": "name", "value": "id" }` maps each record's `name` to
 * the output `label` and `id` to the output `value`.
 */
export type DataMapping = Readonly<Record<string, string>>;

/**
 * REST GET data source definition.
 *
 * The `type` field is the union discriminator and is always `"rest"` for this
 * member. Only `method: "GET"` and `loadOn: "mount"` are accepted initially.
 *
 * Headers are intentionally absent from this contract — there is no place to
 * embed secrets such as auth tokens, which keeps project JSON free of
 * credentials. URL query parameters that resemble secrets are also rejected
 * during validation.
 */
export interface RestDataSource {
  /** Union discriminator. Always `"rest"` for this member. */
  readonly type: "rest";

  /** HTTP method. Only `"GET"` is supported initially. */
  readonly method: "GET";

  /** Endpoint URL. Must be a non-empty string with a permitted scheme. */
  readonly url: string;

  /**
   * Optional safe path into the response payload to extract the collection or
   * object of records. When omitted the entire response body is used.
   *
   * Must conform to the safe path grammar validated by {@link isValidDataPath}.
   */
  readonly responsePath?: string;

  /** Optional field mapping applied to each extracted record. */
  readonly mapping?: DataMapping;

  /**
   * When to resolve the data source. Only `"mount"` is supported initially.
   */
  readonly loadOn: "mount";
}

/**
 * Static (inline) data source definition.
 *
 * Used when a component renders from its static properties rather than from a
 * fetched endpoint. No fetch is ever performed; the `type` field is the only
 * meaningful member. This is the default when a component declares a
 * `dataBinding` capability but has no external data source configured.
 */
export interface StaticDataSource {
  /** Union discriminator. Always `"static"` for this member. */
  readonly type: "static";
}

/**
 * Discriminated union of all supported data source types.
 *
 * Add new members here as further data source types are introduced. The `type`
 * field is the discriminant consumed by both type narrowing and runtime
 * validation.
 */
export type DataSource = StaticDataSource | RestDataSource;

/**
 * Matches a safe declarative data path.
 *
 * A safe path is composed of dot-separated segments where each segment is a
 * JavaScript-style identifier (`[a-zA-Z_][a-zA-Z0-9_]*`) optionally followed
 * by one or more numeric array-index accessors (`[0]`, `[12]`). This grammar
 * intentionally excludes:
 *
 * - bracket access with string keys (`["x"]`)
 * - leading / trailing / double dots (`.a`, `a.`, `a..b`)
 * - negative or non-numeric indices (`[-1]`, `[x]`)
 * - any operator or expression evaluation (no eval / JSONPath execution)
 *
 * Examples of valid paths: `data`, `data.items`, `data[0]`,
 * `data.items[0].name`, `items[0][1]`.
 */
const SAFE_DATA_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\[\d+\])*(\.[a-zA-Z_][a-zA-Z0-9_]*(\[\d+\])*)*$/;

/**
 * Reports whether `path` conforms to the safe declarative path grammar.
 *
 * Returns `false` for empty strings and any path that uses unsafe constructs.
 * This is the single gate for `responsePath` and mapping values, ensuring no
 * arbitrary expression evaluation ever runs against response data.
 */
export function isValidDataPath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }
  return SAFE_DATA_PATH_PATTERN.test(path);
}
