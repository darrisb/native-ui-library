export type ComponentPropertyType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "color";

export interface ComponentPropertyDefinition {
  /** Machine-readable property name. */
  readonly name: string;

  /** Property data type. */
  readonly type: ComponentPropertyType;

  /** Human-readable label shown in the builder. */
  readonly label: string;

  /** Default value used when the property is not explicitly set. */
  readonly defaultValue?: string | number | boolean;

  /** Whether the property must have a value. */
  readonly required?: boolean;

  /** Whether a `string` property should be edited as multiline text. */
  readonly multiline?: boolean;

  /** Fixed choices for `select` properties. */
  readonly choices?: readonly string[];
}
