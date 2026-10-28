import type { ComponentPropertyDefinition } from "./component-property.js";

export interface ComponentDefinition {
  /** Unique component type identifier. */
  readonly type: string;

  /** Human-readable display name. */
  readonly name: string;

  /** Brief description of the component's purpose. */
  readonly description: string;

  /** Builder category used for grouping and filtering. */
  readonly category: string;

  /** Supported editable properties. */
  readonly properties: readonly ComponentPropertyDefinition[];

  /** Whether the component may contain child component instances. */
  readonly allowChildren: boolean;
}
