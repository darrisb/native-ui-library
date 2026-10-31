import type { DataMapping } from "../types/data-source.js";
import { isValidDataPath } from "../types/data-source.js";
import { resolveResponsePath } from "./resolve-response-path.js";

/**
 * Mapping utilities that turn arrays of API records into component-ready
 * data shapes.
 *
 * These are pure functions: no I/O, no dynamic evaluation, no prototype
 * traversal. Every outcome is returned as a discriminated union so callers
 * can branch on `ok` without catching exceptions.
 *
 * The generic {@link mapRecords} function is the foundation; dropdown and
 * table-row helpers build on it. Keeping the mapper generic means later
 * components (Table, etc.) can reuse the same traversal and error contracts.
 */

/** Stable error codes surfaced during record mapping. */
export type MapRecordsErrorCode =
  /** A mapped field is missing or null on a record. */
  | "missing-field"
  /** A mapped field has a value type that cannot be represented. */
  | "unsupported-type"
  /** An element of the source array is not a plain object record. */
  | "invalid-record"
  /** A mapping value (source path) is not a safe declarative path. */
  | "invalid-mapping";

/** A safe, non-throwing error description. */
export interface MapRecordsError {
  readonly code: MapRecordsErrorCode;
  readonly message: string;
  /** The output field whose mapping failed. */
  readonly field?: string;
  /** The index of the source record that triggered the error. */
  readonly index?: number;
}

/** Successful mapping carrying the component-ready records. */
export interface MapRecordsSuccess<T> {
  readonly ok: true;
  readonly records: T;
}

/** Failed mapping carrying a safe error. */
export interface MapRecordsFailure {
  readonly ok: false;
  readonly error: MapRecordsError;
}

/** Discriminated union of every mapping outcome. */
export type MapRecordsResult<T> =
  | MapRecordsSuccess<T>
  | MapRecordsFailure;

/**
 * A dropdown option rendered by a future Dropdown component.
 *
 * `label` is the human-readable text; `value` is the stable identifier
 * preserved as the original JSON type (string or number).
 */
export interface DropdownOption {
  readonly label: string;
  readonly value: string | number;
}

/**
 * A generic key-value record suitable for rendering a future Table row or
 * any other data-driven slot. Only plain primitive values are carried so
 * the record survives JSON round-tripping for export/import.
 */
export type MappedRecord = {
  readonly [field: string]: string | number | boolean | null;
};



/**
 * Reads a single field value from a record by its safe source path.
 *
 * Returns the resolved value, or `undefined` when the path cannot be
 * resolved (missing segment, wrong kind, etc.). Never throws.
 */
function readRecordField(
  record: Record<string, unknown>,
  sourcePath: string,
): unknown {
  const result = resolveResponsePath(record, sourcePath);
  return result.ok ? result.value : undefined;
}

/**
 * Coerces a raw JSON value into a primitive suitable for component output.
 *
 * - `string` → `string`
 * - `number` → `number` (finite only; NaN/Infinity become `null`)
 * - `boolean` → `boolean`
 * - `null` → `null`
 * - everything else → `undefined` (unsupported)
 */
function coercePrimitive(
  value: unknown,
): string | number | boolean | null | undefined {
  const type = typeof value;
  if (type === "string") return value as string;
  if (type === "number") {
    return Number.isFinite(value as number) ? (value as number) : null;
  }
  if (type === "boolean") return value as boolean;
  if (value === null) return null;
  return undefined;
}

/**
 * Maps an array of source records to a component-ready shape using a
 * declarative field mapping.
 *
 * Each entry in `mapping` declares an output field name (key) and the safe
 * path to the source value within each record (value). The traversal reuses
 * {@link resolveResponsePath} so the same safety contract applies: no eval,
 * no prototype access.
 *
 * A missing, null, or unsupported-type value on any record fails the entire
 * mapping with a structured error pointing at the offending field and index.
 *
 * @param records  Source array of plain-object records.
 * @param mapping  Output field → safe source path.
 */
export function mapRecords(
  records: readonly Record<string, unknown>[],
  mapping: DataMapping,
): MapRecordsResult<readonly MappedRecord[]> {
  const entries = Object.entries(mapping);

  // Pre-validate mapping paths up front so we fail fast before touching data.
  for (const [outputField, sourcePath] of entries) {
    if (typeof sourcePath !== "string" || !isValidDataPath(sourcePath)) {
      return {
        ok: false,
        error: {
          code: "invalid-mapping",
          field: outputField,
          message: `Mapping source path for "${outputField}" is not a safe path.`,
        },
      };
    }
  }

  const output: MappedRecord[] = [];

  for (let index = 0; index < records.length; index++) {
    const sourceRecord = records[index]!;
    if (
      sourceRecord === null ||
      typeof sourceRecord !== "object" ||
      Array.isArray(sourceRecord)
    ) {
      return {
        ok: false,
        error: {
          code: "invalid-record",
          index,
          message: `Source record at index ${index} is not a plain object.`,
        },
      };
    }

    const mapped: Record<string, string | number | boolean | null> = {};

    for (const [outputField, sourcePath] of entries) {
      const rawValue = readRecordField(sourceRecord, sourcePath);
      if (rawValue === undefined || rawValue === null) {
        return {
          ok: false,
          error: {
            code: "missing-field",
            field: outputField,
            index,
            message: `Field "${outputField}" is missing or null on record at index ${index}.`,
          },
        };
      }
      const coerced = coercePrimitive(rawValue);
      if (coerced === undefined) {
        return {
          ok: false,
          error: {
            code: "unsupported-type",
            field: outputField,
            index,
            message: `Field "${outputField}" has unsupported type "${typeof rawValue}" on record at index ${index}.`,
          },
        };
      }
      mapped[outputField] = coerced;
    }

    output.push(mapped);
  }

  return { ok: true, records: output };
}

/**
 * Maps an array of source records to dropdown options.
 *
 * The mapping's keys are conventionally `"label"` and `"value"`, pointing at
 * the source paths that produce each. The label is always stringified (it is
 * display text); the value preserves its original JSON type — strings stay
 * strings, numbers stay numbers — so callers can use it as a stable key
 * without surprising coercions.
 *
 * The output fields read from each mapped record are `"label"` and `"value"`.
 * If the mapping uses different output keys, the caller should use
 * {@link mapRecords} directly and project the fields needed.
 */
export function mapDropdownOptions(
  records: readonly Record<string, unknown>[],
  mapping: DataMapping,
): MapRecordsResult<readonly DropdownOption[]> {
  const mapped = mapRecords(records, mapping);
  if (!mapped.ok) {
    return mapped;
  }

  const options: DropdownOption[] = [];
  for (const record of mapped.records) {
    const label = record["label"];
    const value = record["value"];

    if (label === undefined || label === null) {
      return {
        ok: false,
        error: {
          code: "missing-field",
          field: "label",
          message: 'Dropdown options require a "label" field in the mapping output.',
        },
      };
    }
    if (value === undefined || value === null) {
      return {
        ok: false,
        error: {
          code: "missing-field",
          field: "value",
          message: 'Dropdown options require a "value" field in the mapping output.',
        },
      };
    }

    options.push({
      label: String(label),
      value: typeof value === "number" ? value : String(value),
    });
  }

  return { ok: true, records: options };
}

/**
 * Resolves a response path against a payload and, if the result is an array
 * of plain-object records, maps them using the provided mapping.
 *
 * Convenience helper that combines the two phases most callers need:
 *   1. Extract the collection from the response payload via `responsePath`.
 *   2. Map each extracted record via `mapping`.
 *
 * If `responsePath` points at a non-array value, a structured failure is
 * returned.
 */
export function extractAndMapRecords(
  payload: unknown,
  responsePath: string | undefined,
  mapping: DataMapping,
): MapRecordsResult<readonly MappedRecord[]> {
  const resolved = resolveResponsePath(payload, responsePath);
  if (!resolved.ok) {
    return {
      ok: false,
      error: {
        code: "invalid-record",
        message: `Cannot extract records: ${resolved.error.message}`,
      },
    };
  }
  if (!Array.isArray(resolved.value)) {
    return {
      ok: false,
      error: {
        code: "invalid-record",
        message: `Expected an array at response path, but got ${typeof resolved.value}.`,
      },
    };
  }
  return mapRecords(
    resolved.value as readonly Record<string, unknown>[],
    mapping,
  );
}


