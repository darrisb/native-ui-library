import {
  ComponentRegistry,
  validateActions,
  validateDataSourceContracts,
  type ComponentInstance,
  type ComponentPropertyType,
} from "@visual-ui/core";

export interface ValidationError {
  /** Path to the value in the instance tree, e.g. "root.children[0].properties.title". */
  readonly path: string;

  /** Human-readable description of the problem. */
  readonly message: string;
}

function isValueOfType(
  value: unknown,
  propertyType: ComponentPropertyType
): boolean {
  switch (propertyType) {
    case "string":
    case "color":
    case "select":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

import type { ComponentDefinition } from "@visual-ui/core";

function validateProperties(
  instance: ComponentInstance,
  definition: ComponentDefinition,
  path: string,
  errors: ValidationError[]
): void {
  const propertyPath = (name: string) => `${path}.properties.${name}`;

  for (const [name, value] of Object.entries(instance.properties)) {
    const propertyDefinition = definition.properties.find(
      (property) => property.name === name
    );

    if (!propertyDefinition) {
      errors.push({
        path: propertyPath(name),
        message: `Property "${name}" is not supported by component "${instance.type}".`,
      });
      continue;
    }

    if (!isValueOfType(value, propertyDefinition.type)) {
      errors.push({
        path: propertyPath(name),
        message: `Property "${name}" must be of type "${propertyDefinition.type}", got ${typeof value}.`,
      });
      continue;
    }

    if (
      propertyDefinition.type === "select" &&
      propertyDefinition.choices !== undefined &&
      typeof value === "string" &&
      !propertyDefinition.choices.includes(value)
    ) {
      errors.push({
        path: propertyPath(name),
        message: `Value "${value}" for property "${name}" is not one of the allowed choices: ${propertyDefinition.choices.join(", ")}.`,
      });
    }
  }

  for (const propertyDefinition of definition.properties) {
    if (
      propertyDefinition.required &&
      instance.properties[propertyDefinition.name] === undefined
    ) {
      errors.push({
        path: propertyPath(propertyDefinition.name),
        message: `Property "${propertyDefinition.name}" is required for component "${instance.type}".`,
      });
    }
  }
}

/**
 * Validates a component instance against registered component metadata.
 *
 * Checks that the component type exists, that every property is supported and
 * has a valid value, that required properties are present, that children are
 * only supplied when allowed, and that the instance tree contains no cyclic
 * references. Nested children are validated recursively.
 */
export function validateComponentInstance(
  instance: ComponentInstance,
  registry: ComponentRegistry,
  path: string = instance.id,
  seen: Set<ComponentInstance> = new Set()
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (seen.has(instance)) {
    errors.push({
      path,
      message: `cyclic reference detected for component "${instance.type}" (id: ${instance.id}).`,
    });
    return errors;
  }

  seen.add(instance);

  const definition = registry.lookup(instance.type);

  if (!definition) {
    errors.push({
      path,
      message: `Unknown component type "${instance.type}".`,
    });
    return errors;
  }

  validateProperties(instance, definition, path, errors);

  // ActionValidationIssue is structurally identical to ValidationError, so
  // merging keeps a single flat ValidationError[] for downstream consumers.
  errors.push(...validateActions(instance.actions, path, []));

  // DataSourceValidationIssue is structurally identical to ValidationError,
  // so merging keeps a single flat list for downstream consumers.
  validateDataSourceContracts(
    instance.dataSource,
    instance.bindings,
    path,
    errors
  );

  const children = instance.children ?? [];
  if (children.length > 0) {
    if (!definition.allowChildren) {
      errors.push({
        path: `${path}.children`,
        message: `Component "${instance.type}" does not allow children.`,
      });
    } else {
      for (let index = 0; index < children.length; index++) {
        errors.push(
          ...validateComponentInstance(
            children[index],
            registry,
            `${path}.children[${index}]`,
            seen
          )
        );
      }
    }
  }

  return errors;
}
