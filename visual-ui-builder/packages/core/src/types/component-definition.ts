import type { ActionEvent } from "./action.js";
import type { ComponentPropertyDefinition } from "./component-property.js";

/**
 * Declares a DOM event that can trigger a declarative action on a component.
 *
 * The editor reads this metadata to offer event bindings generically, without
 * hardcoding per-type UI.
 */
export interface ComponentEventCapability {
  /** DOM event name that can trigger an action. */
  readonly event: ActionEvent;

  /** Human-readable label shown in the editor. */
  readonly label: string;

  /**
   * When true, this event is only meaningful when at least one action is
   * configured on the instance. The editor uses this to surface the event
   * binding only after an action exists.
   */
  readonly requiresAction?: boolean;
}

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

  /**
   * Events that can trigger declarative actions on this component.
   *
   * When omitted, the component exposes no event bindings in the editor.
   * The list is intentionally flat and generic so the editor can render event
   * options without per-type branching.
   */
  readonly events?: readonly ComponentEventCapability[];

  /**
   * Binding targets that accept data-source responses.
   * When present, a component can be bound to a data source whose
   * response records will be mapped to the named targets.
   */
  readonly dataBinding?: readonly string[];
}
