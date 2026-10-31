import type {
  DataSource,
  DataSourceLoadOn,
  RestDataSource,
  StaticDataSource
} from "../types/data-source.js";
import type { Binding, BindingTarget } from "../types/binding.js";
import { isValidDataPath } from "../types/data-source.js";

/**
 * Result of validating a data source or binding record.
 *
 * Structurally compatible with {@link ActionValidationIssue} so callers can
 * merge data issues into one flat list alongside action issues.
 */
export interface DataSourceValidationIssue {
  /** Path to the value, e.g. "root.dataSource.url". */
  readonly path: string;

  /** Human-readable description of the problem. */
  readonly message: string;
}

/** HTTP methods that are permitted for a declarative data source. */
const ALLOWED_METHODS: readonly RestDataSource["method"][] = ["GET"];

/** Load triggers that are permitted initially. */
const ALLOWED_LOAD_ON: readonly DataSourceLoadOn[] = ["mount"];

/** Binding targets that are permitted. */
const ALLOWED_TARGETS: readonly BindingTarget[] = ["options", "rows"];

/**
 * URL schemes that must never appear in a declarative data source URL. These
 * schemes can execute scripts, render arbitrary content, or exfiltrate data,
 * so they are unconditionally rejected — the same blocklist used by the
 * navigation action validator.
 */
const BLOCKED_URL_SCHEMES: readonly string[] = [
  "javascript",
  "data",
  "vbscript",
  "file"
];

/**
 * Query-parameter names that indicate an embedded credential or secret.
 *
 * Project JSON must not carry tokens, API keys, or passwords. If a data source
 * URL contains a query parameter whose name matches one of these (case
 * insensitive), the URL is rejected so secrets never reach source control.
 */
const SECRET_QUERY_PARAM_NAMES: readonly string[] = [
  "token",
  "access_token",
  "auth_token",
  "api_key",
  "apikey",
  "secret",
  "password",
  "passwd"
];

/** Extracts the URL scheme (before the first `:`), lower-cased, or null. */
function extractUrlScheme(url: string): string | null {
  const trimmed = url.replace(/^[\s\u0000-\u001f]+/, "");
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  return match ? match[1].toLowerCase() : null;
}

/** Reports whether the URL uses a blocked (potentially dangerous) scheme. */
function isBlockedUrl(url: string): boolean {
  const scheme = extractUrlScheme(url);
  return scheme !== null && BLOCKED_URL_SCHEMES.includes(scheme);
}

/**
 * Reports whether the URL contains a query parameter whose name resembles a
 * credential or secret. Matches `?name=` or `&name=` boundaries so values that
 * merely contain a substring (e.g. `?description=tokenized`) are not flagged.
 */
function containsSecretQueryParam(url: string): boolean {
  const normalized = url.toLowerCase();
  for (const name of SECRET_QUERY_PARAM_NAMES) {
    const pattern = new RegExp(`[?&]${name}(?:=|$|[^a-z0-9_-])`);
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a {@link DataMapping} object: every value must be a safe data
 * path. Pushes issues onto `errors`.
 */
function validateMapping(
  mapping: RestDataSource["mapping"],
  path: string,
  errors: DataSourceValidationIssue[]
): void {
  if (mapping === undefined) {
    return;
  }
  if (typeof mapping !== "object" || mapping === null || Array.isArray(mapping)) {
    errors.push({
      path,
      message: `Data source "mapping" must be an object.`
    });
    return;
  }
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof key !== "string" || key.length === 0) {
      errors.push({
        path: `${path}.${key}`,
        message: `Data source mapping keys must be non-empty strings.`
      });
      continue;
    }
    if (!isValidDataPath(value)) {
      errors.push({
        path: `${path}.${key}`,
        message: `Data source mapping value for "${key}" is not a safe path.`
      });
    }
  }
}

/**
 * Validates a single {@link DataSource} record and pushes issues onto `errors`.
 *
 * Rejects unknown `type`, unsupported `method`, malformed or unsafe URLs,
 * malformed `responsePath`, malformed `mapping`, unsupported `loadOn`, and
 * URLs embedding secret-like query parameters. No arbitrary headers are
 * accepted (the contract simply has no header field).
 */
function validateDataSource(
  dataSource: DataSource,
  path: string,
  errors: DataSourceValidationIssue[]
): void {
  if (!dataSource || typeof dataSource !== "object") {
    errors.push({
      path,
      message: `Data source must be an object.`
    });
    return;
  }

  switch (dataSource.type) {
    case "static":
      validateStaticDataSource(dataSource, path, errors);
      break;
    case "rest":
      validateRestDataSource(dataSource, path, errors);
      break;
    default:
      errors.push({
        path: `${path}.type`,
        message: `Unknown data source type "${String(
          (dataSource as DataSource).type
        )}".`
      });
  }
}

function validateStaticDataSource(
  _dataSource: StaticDataSource,
  _path: string,
  _errors: DataSourceValidationIssue[]
): void {
  // Static data sources carry no URL, response path, or mapping — they
  // resolve to the component's inline properties, so there is nothing to
  // validate beyond the discriminator itself.
}

function validateRestDataSource(
  dataSource: RestDataSource,
  path: string,
  errors: DataSourceValidationIssue[]
): void {
  if (!ALLOWED_METHODS.includes(dataSource.method)) {
    errors.push({
      path: `${path}.method`,
      message: `Data source "method" must be one of: ${ALLOWED_METHODS.join(", ")}.`
    });
  }

  if (!ALLOWED_LOAD_ON.includes(dataSource.loadOn)) {
    errors.push({
      path: `${path}.loadOn`,
      message: `Data source "loadOn" must be one of: ${ALLOWED_LOAD_ON.join(", ")}.`
    });
  }

  const url = dataSource.url;
  if (typeof url !== "string" || url.length === 0) {
    errors.push({
      path: `${path}.url`,
      message: `Data source "url" must be a non-empty string.`
    });
  } else {
    if (isBlockedUrl(url)) {
      errors.push({
        path: `${path}.url`,
        message: `Data source "url" uses a disallowed URL scheme.`
      });
    }
    if (containsSecretQueryParam(url)) {
      errors.push({
        path: `${path}.url`,
        message: `Data source "url" must not contain secrets such as tokens, API keys, or passwords.`
      });
    }
  }

  if (dataSource.responsePath !== undefined && !isValidDataPath(dataSource.responsePath)) {
    errors.push({
      path: `${path}.responsePath`,
      message: `Data source "responsePath" is not a safe path.`
    });
  }

  validateMapping(dataSource.mapping, `${path}.mapping`, errors);
}

/**
 * Validates a single {@link Binding} record and pushes issues onto `errors`.
 *
 * Rejects unknown targets and malformed path grammar.
 */
function validateBinding(
  binding: Binding,
  path: string,
  errors: DataSourceValidationIssue[]
): void {
  if (!binding || typeof binding !== "object") {
    errors.push({
      path,
      message: `Binding must be an object.`
    });
    return;
  }

  if (!ALLOWED_TARGETS.includes(binding.target)) {
    errors.push({
      path: `${path}.target`,
      message: `Binding "target" must be one of: ${ALLOWED_TARGETS.join(", ")}.`
    });
  }

  if (binding.path !== undefined && !isValidDataPath(binding.path)) {
    errors.push({
      path: `${path}.path`,
      message: `Binding "path" is not a safe path.`
    });
  }
}

/**
 * Validates the optional `dataSource` and `bindings` of a component instance.
 *
 * Pushes issues onto `errors`. When `dataSource` is omitted no issues are
 * produced, so legacy JSON without a data source remains valid. Bindings are
 * only meaningful alongside a data source, but each is validated
 * independently so a malformed binding is still flagged even when the data
 * source is absent.
 *
 * The data source is addressed at `${path}.dataSource` and bindings by index
 * at `${path}.bindings[N]`.
 */
export function validateDataSourceContracts(
  dataSource: DataSource | undefined,
  bindings: readonly Binding[] | undefined,
  path: string,
  errors: DataSourceValidationIssue[]
): DataSourceValidationIssue[] {
  if (dataSource !== undefined) {
    validateDataSource(dataSource, `${path}.dataSource`, errors);
  }

  if (bindings !== undefined) {
    for (let index = 0; index < bindings.length; index++) {
      validateBinding(bindings[index]!, `${path}.bindings[${index}]`, errors);
    }
  }

  return errors;
}
