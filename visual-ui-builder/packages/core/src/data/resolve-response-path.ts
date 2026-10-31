import { isValidDataPath } from "../types/data-source.js";

/**
 * Safe navigation into a parsed JSON payload using a declarative path.
 *
 * A "response path" is a dot-separated sequence of property names with
 * optional numeric array-index accessors (see {@link isValidDataPath}). This
 * module turns such a path into a pure, non-throwing traversal that never
 * uses dynamic evaluation, prototype lookups, or arbitrary expression
 * filters.
 *
 * The traversal intentionally skips `__proto__`, `constructor`, and
 * `prototype` property names so a malicious payload can never climb the
 * prototype chain even if the path grammar were bypassed upstream.
 */

/** Stable error codes surfaced when a path cannot be resolved. */
export type ResolveResponsePathErrorCode =
  /** A property in the path does not exist on the current object. */
  | "missing"
  /** A segment attempts property access on a non-object value. */
  | "not-an-object"
  /** A segment attempts array-index access on a non-array value. */
  | "not-an-array"
  /** A numeric index exceeds the bounds of the array. */
  | "index-out-of-range"
  /** The path string does not conform to the safe path grammar. */
  | "invalid-path";

/** A safe, non-throwing error description. */
export interface ResolveResponsePathError {
  readonly code: ResolveResponsePathErrorCode;
  readonly message: string;
  /** The full path string that was being resolved. */
  readonly path: string;
  /** The segment where resolution failed. */
  readonly failedAt: string;
}

/** Successful path resolution carrying the located value. */
export interface ResolveResponsePathSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed path resolution carrying a safe error. */
export interface ResolveResponsePathFailure {
  readonly ok: false;
  readonly error: ResolveResponsePathError;
}

/** Discriminated union of every resolution outcome. */
export type ResolveResponsePathResult<T> =
  | ResolveResponsePathSuccess<T>
  | ResolveResponsePathFailure;

/** Property names that must never be traversed, regardless of path grammar. */
const BLOCKED_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function failure(
  code: ResolveResponsePathErrorCode,
  path: string,
  failedAt: string,
): ResolveResponsePathFailure {
  return {
    ok: false,
    error: {
      code,
      path,
      failedAt,
      message: ERROR_MESSAGES[code],
    },
  };
}

const ERROR_MESSAGES: Record<ResolveResponsePathErrorCode, string> = {
  missing: "Path segment does not exist in the response payload.",
  "not-an-object": "Cannot read a property from a non-object value.",
  "not-an-array": "Cannot read an array index from a non-array value.",
  "index-out-of-range": "Array index exceeds the bounds of the array.",
  "invalid-path": "Response path is not a safe declarative path.",
};

/**
 * Parses a safe path string into an ordered list of traversal segments.
 *
 * Each segment is either a property name (`{ key: string }`) or an array
 * index (`{ index: number }`). The caller is responsible for ensuring the
 * path is safe (see {@link isValidDataPath}); this parser assumes the grammar
 * holds and splits on dots and bracket groups.
 */
export function parseResponsePath(
  path: string,
): ReadonlyArray<{ key: string } | { index: number }> {
  const segments: Array<{ key: string } | { index: number }> = [];
  let index = 0;

  const skipIdentifier = (): string => {
    const start = index;
    while (
      index < path.length &&
      /[A-Za-z0-9_]/.test(path[index]!)
    ) {
      index++;
    }
    return path.slice(start, index);
  };

  for (;;) {
    const key = skipIdentifier();
    segments.push({ key });

    // Consume zero or more `[n]` array-index accessors.
    while (index < path.length && path[index] === "[") {
      index++; // skip '['
      const indexStart = index;
      while (index < path.length && /[0-9]/.test(path[index]!)) {
        index++;
      }
      const rawIndex = path.slice(indexStart, index);
      // Skip the closing ']'.
      if (path[index] === "]") {
        index++;
      }
      segments.push({ index: Number.parseInt(rawIndex, 10) });
    }

    // If a dot follows, consume it and continue with the next identifier.
    if (index < path.length && path[index] === ".") {
      index++;
      continue;
    }
    break;
  }

  return segments;
}

/**
 * Resolves a safe declarative path against a parsed JSON payload.
 *
 * When `path` is `undefined` or an empty string, the entire payload is
 * returned unchanged. When the path points at a location that does not exist
 * or whose value has the wrong kind (object vs array), a structured failure
 * is returned instead of throwing.
 *
 * No dynamic evaluation (`eval`, `new Function`) is performed and no
 * prototype properties are ever accessed.
 */
export function resolveResponsePath(
  data: unknown,
  path: string | undefined,
): ResolveResponsePathResult<unknown> {
  if (path === undefined || path.length === 0) {
    return { ok: true, value: data };
  }

  if (!isValidDataPath(path)) {
    return failure("invalid-path", path, path);
  }

  const segments = parseResponsePath(path);
  let current: unknown = data;

  for (const segment of segments) {
    if ("key" in segment) {
      if (BLOCKED_PROPERTY_NAMES.has(segment.key)) {
        return failure("missing", path, segment.key);
      }
      if (current === null || typeof current !== "object" || Array.isArray(current)) {
        return failure("not-an-object", path, segment.key);
      }
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, segment.key)) {
        return failure("missing", path, segment.key);
      }
      current = record[segment.key];
    } else {
      if (!Array.isArray(current)) {
        return failure("not-an-array", path, `[${segment.index}]`);
      }
      if (segment.index < 0 || segment.index >= current.length) {
        return failure("index-out-of-range", path, `[${segment.index}]`);
      }
      current = current[segment.index];
    }
  }

  return { ok: true, value: current };
}
