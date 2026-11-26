import type { ComponentInstance } from "../types/component-instance.js";
import type { DataSourceValidationIssue } from "./validate-data-source.js";

/**
 * Grammar for filter field names used by linked filter controls: a JS-style
 * identifier (letters, digits, underscores; must not start with a digit),
 * bounded to 128 characters.
 */
export const FILTER_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** Filter modes a linked filter control may apply to a table column. */
export const FILTER_MODES = ["eq", "contains"] as const;

/** A single filter mode. */
export type FilterMode = (typeof FILTER_MODES)[number];

/** Component types that may act as a table filter. */
const FILTER_COMPONENT_TYPES: readonly string[] = ["dropdown", "input"];

/**
 * Reports whether the value is a valid filter field name.
 *
 * Accepts `unknown` so callers can pass raw property values straight through;
 * anything that is not a string matching {@link FILTER_FIELD_PATTERN} is
 * rejected.
 */
export function isValidFilterField(field: unknown): boolean {
  return typeof field === "string" && FILTER_FIELD_PATTERN.test(field);
}

/**
 * Collects every instance id -> type pair in the tree (single recursive pass).
 *
 * When an id appears more than once (a malformed document), the first
 * occurrence wins.
 */
function collectInstanceTypes(
  roots: readonly ComponentInstance[],
  types: Map<string, string>
): void {
  const visit = (instance: ComponentInstance): void => {
    if (!types.has(instance.id)) {
      types.set(instance.id, instance.type);
    }
    for (const child of instance.children ?? []) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
}

/**
 * Checks the filter link properties of one dropdown or input instance and
 * pushes issues onto `issues`.
 *
 * Only instances that declare a non-empty `filterTarget` are checked; a
 * control without a filter link is inert and produces no issues.
 */
function checkFilterInstance(
  instance: ComponentInstance,
  instanceTypes: ReadonlyMap<string, string>,
  issues: DataSourceValidationIssue[]
): void {
  const properties = instance.properties;
  const filterTarget = properties.filterTarget;
  if (typeof filterTarget !== "string" || filterTarget.length === 0) {
    return;
  }

  if (!isValidFilterField(properties.filterField)) {
    issues.push({
      path: `${instance.id}.properties.filterField`,
      message: `Filter field must match [A-Za-z_][A-Za-z0-9_]{0,127}.`
    });
  }

  const filterMode = properties.filterMode;
  if (filterMode !== undefined) {
    const isKnownMode =
      typeof filterMode === "string" &&
      (FILTER_MODES as readonly string[]).includes(filterMode);
    if (!isKnownMode) {
      issues.push({
        path: `${instance.id}.properties.filterMode`,
        message: `Filter mode must be one of: ${FILTER_MODES.join(", ")}.`
      });
    } else if (instance.type === "dropdown" && filterMode === "contains") {
      issues.push({
        path: `${instance.id}.properties.filterMode`,
        message: `Filter mode "contains" is only supported on input components.`
      });
    }
  }

  const targetType = instanceTypes.get(filterTarget);
  if (targetType !== "table") {
    issues.push({
      path: `${instance.id}.properties.filterTarget`,
      message: `Filter target "${filterTarget}" does not reference an existing table instance.`
    });
  }
}

/**
 * Document-level validation for linked filter controls.
 *
 * A dropdown or input may declare `filterTarget` (the instance id of a table
 * on the same page), `filterField` (the column the control filters) and
 * `filterMode` (`eq` or `contains`). The target reference crosses instance
 * boundaries, so it cannot be checked by the per-instance validator — this
 * function walks the complete document tree and reports:
 *
 *   - a missing or malformed `filterField`,
 *   - a `filterMode` that is not one of eq/contains,
 *   - `contains` on a dropdown (only inputs support it),
 *   - a `filterTarget` that does not name an existing table instance.
 *
 * Issue paths are rooted at the offending instance's id
 * (e.g. `filter1.properties.filterTarget`), matching the convention of the
 * per-instance validator's default path. Returns a (possibly empty) list;
 * documents without filter properties produce no issues.
 */
export function validateFilterLinks(
  roots: readonly ComponentInstance[]
): DataSourceValidationIssue[] {
  const issues: DataSourceValidationIssue[] = [];

  const instanceTypes = new Map<string, string>();
  collectInstanceTypes(roots, instanceTypes);

  const visit = (instance: ComponentInstance): void => {
    if (FILTER_COMPONENT_TYPES.includes(instance.type)) {
      checkFilterInstance(instance, instanceTypes, issues);
    }
    for (const child of instance.children ?? []) {
      visit(child);
    }
  };

  for (const root of roots) {
    visit(root);
  }

  return issues;
}
