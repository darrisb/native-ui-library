/**
 * Shared action executor for the renderer runtime.
 *
 * Accepts already-validated declarative actions plus event context, enforces a
 * last-line-of-defense safety boundary (unsafe URL schemes, unsupported action
 * types, invalid targets), and dispatches through an injected navigation
 * adapter. No actions execute while the builder is in edit mode.
 *
 * Safety contract:
 *   - Explicit URL-scheme allowlist (http, https, mailto, tel). Relative URLs
 *     (no scheme) are permitted.
 *   - `{value}` tokens are substituted from the triggering event's `detail`
 *     using `encodeURIComponent`, and the scheme check runs again on the final
 *     URL so a substituted value can never introduce a dangerous scheme.
 *   - No eval, Function constructor, dynamic code execution, or embedded
 *     credentials anywhere in the dispatch path.
 *   - Unknown action types and invalid targets are rejected silently (no-op).
 *   - Edit mode short-circuits before any side effect.
 */

import {
  isAllowedUrl,
  NAVIGATE_VALUE_TOKEN,
  type ComponentAction,
  type NavigateAction
} from "@visual-ui/core";
import { BrowserNavigationAdapter, type NavigationAdapter } from "./navigation-adapter.js";

/** Type narrowing helper for `navigate` actions. */
function isNavigateAction(
  action: ComponentAction
): action is NavigateAction {
  return action.type === "navigate";
}

/** Allowed navigate targets. */
const ALLOWED_TARGETS: readonly string[] = ["_self", "_blank"];

/** Reports whether the target is a supported navigate target. */
function isAllowedTarget(
  target: string | undefined
): target is "_self" | "_blank" | undefined {
  return target === undefined || ALLOWED_TARGETS.includes(target);
}

/**
 * Reads the `value` carried by a triggering event's `detail`.
 *
 * Returns an empty string when the event is missing or carries no value so a
 * `{value}` token always resolves to a string.
 */
function readEventValue(event: Event | undefined): string {
  if (!event) {
    return "";
  }

  const detail = (event as CustomEvent<{ value?: unknown }>).detail;
  if (detail !== null && typeof detail === "object" && "value" in detail) {
    const value = detail.value;
    return value === null || value === undefined ? "" : String(value);
  }

  return "";
}

/**
 * Resolves the `{value}` token in a navigate URL using the triggering event.
 *
 * URLs without the token are returned unchanged, preserving the exact
 * pre-existing navigation behavior. When the token is present it is replaced
 * with the event's value detail; `encode` controls whether the value is
 * URL-encoded (the navigated form) or left raw (the safety-check form).
 */
function resolveNavigateUrl(
  url: string,
  event: Event | undefined,
  encode: boolean
): string {
  if (!url.includes(NAVIGATE_VALUE_TOKEN)) {
    return url;
  }

  const value = readEventValue(event);
  const replacement = encode ? encodeURIComponent(value) : value;
  return url.replaceAll(NAVIGATE_VALUE_TOKEN, replacement);
}

/**
 * Runtime configuration for the action executor. The navigation adapter is
 * injectable so tests can substitute a fake; `isEditMode` gates all side
 * effects.
 */
export interface ActionExecutorOptions {
  /**
   * Adapter that performs the actual navigation. Defaults to a browser-backed
   * adapter that uses `location.assign` / `window.open`.
   */
  readonly navigationAdapter?: NavigationAdapter;

  /**
   * When `true` the builder is in edit/preview-authoring mode and no actions
   * should be executed. Defaults to `false`.
   */
  readonly isEditMode?: boolean;
}

/**
 * Shared action executor. Safe, reusable, and free of dynamic code execution.
 *
 * Typical usage:
 * ```ts
 * const executor = new ActionExecutor();
 * executor.execute(action, event, element);
 * ```
 */
export class ActionExecutor {
  private readonly navigationAdapter: NavigationAdapter;
  private readonly isEditMode: boolean;

  constructor(options: ActionExecutorOptions = {}) {
    this.navigationAdapter =
      options.navigationAdapter ?? new BrowserNavigationAdapter();
    this.isEditMode = options.isEditMode ?? false;
  }

  /**
   * Executes a single validated declarative action.
   *
   * This method is a no-op (returns without side effects) when:
   *   - The builder is in edit mode
   *   - The action type is not supported
   *   - The navigate URL uses a disallowed scheme
   *   - The navigate target is invalid
   *
   * No errors are thrown for rejected actions; they are silently ignored to
   * match the runtime's fail-safe contract — a broken action must never break
   * the surrounding render.
   *
   * @param action  The validated action to execute.
   * @param event   The DOM event that triggered the action. Its `detail.value`
   *                feeds `{value}` substitution for navigate actions.
   * @param element The rendered element the action is bound to.
   */
  execute(
    action: ComponentAction,
    event: Event | undefined,
    _element: HTMLElement
  ): void {
    // Never execute actions in builder edit mode.
    if (this.isEditMode) {
      return;
    }

    if (!action || typeof action !== "object") {
      return;
    }

    if (!isNavigateAction(action)) {
      // Unsupported action type — fail safe, do nothing.
      return;
    }

    this.executeNavigate(action, event);
  }

  private executeNavigate(
    action: NavigateAction,
    event: Event | undefined
  ): void {
    const { config } = action;

    if (!config || typeof config !== "object") {
      return;
    }

    if (!isAllowedTarget(config.target)) {
      return;
    }

    const rawUrl = config.url;
    if (typeof rawUrl !== "string" || rawUrl.length === 0) {
      return;
    }

    // Substitute the event value, then re-run the scheme check on the final
    // URL. This ensures a `{value}` token cannot smuggle a dangerous scheme
    // past the static validation performed on the template URL.
    const url = resolveNavigateUrl(rawUrl, event, true);
    if (!isAllowedUrl(url)) {
      return;
    }

    // Defense in depth: also check the unencoded interpolation. A template
    // such as `{value}` carrying a `javascript:` value would encode to a
    // harmless relative URL, but the raw form is still refused so a dangerous
    // value can never be disguised as a safe relative one.
    if (rawUrl.includes(NAVIGATE_VALUE_TOKEN)) {
      const rawInterpolated = resolveNavigateUrl(rawUrl, event, false);
      if (!isAllowedUrl(rawInterpolated)) {
        return;
      }
    }

    if (config.target === "_blank") {
      this.navigationAdapter.openInNewWindow(url);
    } else {
      this.navigationAdapter.navigateTo(url);
    }
  }
}
