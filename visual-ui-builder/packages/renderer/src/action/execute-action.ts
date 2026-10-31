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
 *   - No eval, Function constructor, dynamic code execution, or embedded
 *     credentials anywhere in the dispatch path.
 *   - Unknown action types and invalid targets are rejected silently (no-op).
 *   - Edit mode short-circuits before any side effect.
 */

import type { ComponentAction, NavigateAction } from "@visual-ui/core";
import { BrowserNavigationAdapter, type NavigationAdapter } from "./navigation-adapter.js";

/**
 * URL schemes permitted for declarative navigation at the execution boundary.
 *
 * This is an explicit allowlist; any scheme not listed here (and any absolute
 * URL using it) is rejected. Relative URLs with no scheme are handled
 * separately and are always permitted.
 */
const ALLOWED_URL_SCHEMES: readonly string[] = [
  "http",
  "https",
  "mailto",
  "tel",
];

/** URL schemes that are unconditionally blocked even if they look exotic. */
const BLOCKED_URL_SCHEMES: readonly string[] = [
  "javascript",
  "data",
  "vbscript",
  "file",
];

/**
 * Extracts the URL scheme (the part before the first `:`), lower-cased, or
 * `null` when no absolute scheme is present (e.g. relative URLs).
 *
 * Leading whitespace and control characters are stripped first to defeat scheme
 * obfuscation (e.g. `java\nscript:`).
 */
function extractUrlScheme(url: string): string | null {
  const trimmed = url.replace(/^[\s\u0000-\u001f]+/, "");
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  return match ? match[1].toLowerCase() : null;
}

/** Reports whether the URL uses a permitted (safe) scheme or is relative. */
function isAllowedUrl(url: string): boolean {
  const scheme = extractUrlScheme(url);
  if (scheme === null) {
    // Relative URL (no absolute scheme) — permitted.
    return true;
  }
  // Defense in depth: reject known-dangerous schemes first.
  if (BLOCKED_URL_SCHEMES.includes(scheme)) {
    return false;
  }
  return ALLOWED_URL_SCHEMES.includes(scheme);
}

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
   * @param event   The DOM event that triggered the action (unused by current
   *                action types but part of the extensibility contract).
   * @param element The rendered element the action is bound to.
   */
  execute(
    action: ComponentAction,
    _event: Event | undefined,
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

    this.executeNavigate(action);
  }

  private executeNavigate(action: NavigateAction): void {
    const { config } = action;

    if (!config || typeof config !== "object") {
      return;
    }

    if (!isAllowedTarget(config.target)) {
      return;
    }

    const url = config.url;
    if (typeof url !== "string" || url.length === 0) {
      return;
    }

    if (!isAllowedUrl(url)) {
      return;
    }

    if (config.target === "_blank") {
      this.navigationAdapter.openInNewWindow(url);
    } else {
      this.navigationAdapter.navigateTo(url);
    }
  }
}
