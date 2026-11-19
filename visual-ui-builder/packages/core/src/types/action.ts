/**
 * Declarative action contracts for component instances.
 *
 * An action describes a behavior that fires when a DOM event is raised on the
 * rendered element of a component instance. Every action is a member of a
 * discriminated union identified by its `type`. This module establishes the
 * shared contract and starts with click-based navigation; further action types
 * (submit, emit, etc.) are added here in later tasks.
 *
 * All action data is plain serializable data so instances survive JSON
 * round-tripping for import/export.
 */

/** DOM events that can trigger a declarative action. */
export type ActionEvent = "click" | "hover" | "focus" | "submit";

/** Allowed values for a navigate action's link target. */
export type NavigateTarget = "_self" | "_blank";

/**
 * Token that a navigate URL may contain at most once, and only within the
 * query part (after the first `?`). The action executor replaces it with the
 * URL-encoded `value` from the triggering event's `detail` before navigating.
 */
export const NAVIGATE_VALUE_TOKEN = "{value}";

/** Configuration specific to a `navigate` action. */
export interface NavigateConfig {
  /**
   * Destination URL.
   *
   * Must be a non-empty string and must not use a dangerous scheme such as
   * `javascript:` or `data:`. Relative URLs and standard `http(s)` / `mailto` /
   * `tel` schemes are permitted.
   *
   * May contain at most one `{value}` token, and only after the first `?`
   * (in the query part). The executor substitutes the URL-encoded value from
   * the triggering event's `detail` before navigating.
   */
  readonly url: string;

  /**
   * Where to open the link.
   *
   * Must be one of the allowed {@link NavigateTarget} values. When omitted the
   * runtime defaults to `"_self"`.
   */
  readonly target?: NavigateTarget;
}

/**
 * Navigate action: opens a URL when the triggering event fires.
 *
 * The `type` field is the union discriminator and is always `"navigate"` for
 * this member.
 */
export interface NavigateAction {
  /**
   * Stable, unique identifier for this action within the owning instance's
   * action list.
   */
  readonly id: string;

  /** DOM event that triggers this action. */
  readonly event: ActionEvent;

  /** Union discriminator. Always `"navigate"` for this member. */
  readonly type: "navigate";

  /** Action-specific configuration. */
  readonly config: NavigateConfig;
}

/**
 * Discriminated union of all supported action types.
 *
 * Add new members here as further action types are introduced. The `type`
 * field is the discriminant consumed by both type narrowing and runtime
 * validation.
 */
export type ComponentAction = NavigateAction;
