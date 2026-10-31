import type {
  ActionEvent,
  ComponentAction,
  NavigateAction,
  NavigateTarget
} from "../types/action.js";

/**
 * Result of validating a single action.
 *
 * Structurally compatible with the {@link ValidationError} used by the broader
 * instance validator so callers can merge action issues into one flat list.
 */
export interface ActionValidationIssue {
  /** Path to the value, e.g. "root.actions[0].config.url". */
  readonly path: string;

  /** Human-readable description of the problem. */
  readonly message: string;
}

/** DOM events that are permitted to trigger an action. */
const ALLOWED_EVENTS: readonly ActionEvent[] = ["click", "hover", "focus"];

/** Navigate targets that are permitted. */
const ALLOWED_TARGETS: readonly NavigateTarget[] = ["_self", "_blank"];

/**
 * URL schemes that must never appear in a declarative navigate URL. These
 * schemes can execute scripts, render arbitrary content, or exfiltrate data
 * when injected into navigation, so they are unconditionally rejected.
 */
const BLOCKED_URL_SCHEMES: readonly string[] = [
  "javascript",
  "data",
  "vbscript",
  "file"
];

/**
 * Extracts the URL scheme (the part before the first `:`), lower-cased, or
 * `null` when no absolute scheme is present (e.g. relative URLs).
 *
 * Leading whitespace and control characters are stripped first because browsers
 * ignore them when parsing schemes; without this step an obfuscated payload
 * such as `java\nscript:` would bypass the blocklist.
 */
function extractUrlScheme(url: string): string | null {
  // Strip leading whitespace/control chars to defeat scheme obfuscation.
  const trimmed = url.replace(/^[\s\u0000-\u001f]+/, "");
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  return match ? match[1].toLowerCase() : null;
}

/** Reports whether the URL uses a blocked (potentially dangerous) scheme. */
function isBlockedUrl(url: string): boolean {
  const scheme = extractUrlScheme(url);
  return scheme !== null && BLOCKED_URL_SCHEMES.includes(scheme);
}

/**
 * Validates the configuration of a `navigate` action and pushes any issues
 * onto `errors`.
 */
function validateNavigateConfig(
  config: NavigateAction["config"],
  path: string,
  errors: ActionValidationIssue[]
): void {
  if (!config || typeof config !== "object") {
    errors.push({
      path,
      message: `Action config must be an object.`
    });
    return;
  }

  const url = config.url;
  if (typeof url !== "string" || url.length === 0) {
    errors.push({
      path: `${path}.url`,
      message: `Navigate action "url" must be a non-empty string.`
    });
  } else if (isBlockedUrl(url)) {
    errors.push({
      path: `${path}.url`,
      message: `Navigate action "url" uses a disallowed URL scheme.`
    });
  }

  if (config.target !== undefined && !ALLOWED_TARGETS.includes(config.target)) {
    errors.push({
      path: `${path}.target`,
      message: `Navigate action "target" must be one of: ${ALLOWED_TARGETS.join(", ")}.`
    });
  }
}

/**
 * Validates a single action record and pushes any issues onto `errors`.
 *
 * Rejects unknown `type` values (no arbitrary/unknown actions) and malformed
 * `target` values. Per-action config is validated according to its `type`.
 */
function validateAction(
  action: ComponentAction,
  path: string,
  errors: ActionValidationIssue[]
): void {
  if (!action || typeof action !== "object") {
    errors.push({
      path,
      message: `Action must be an object.`
    });
    return;
  }

  if (typeof action.id !== "string" || action.id.length === 0) {
    errors.push({
      path: `${path}.id`,
      message: `Action "id" must be a non-empty string.`
    });
  }

  if (!ALLOWED_EVENTS.includes(action.event)) {
    errors.push({
      path: `${path}.event`,
      message: `Action "event" must be one of: ${ALLOWED_EVENTS.join(", ")}.`
    });
  }

  switch (action.type) {
    case "navigate":
      validateNavigateConfig(action.config, `${path}.config`, errors);
      break;
    default:
      errors.push({
        path: `${path}.type`,
        message: `Unknown action type "${String(action.type)}".`
      });
  }
}

/**
 * Validates the optional `actions` array of a component instance.
 *
 * Pushes issues onto `errors`. When `actions` is omitted or empty no issues are
 * produced, so legacy JSON without actions remains valid. Per-action issues are
 * addressed by index path (e.g. `root.actions[0].config.url`).
 */
export function validateActions(
  actions: readonly ComponentAction[] | undefined,
  path: string,
  errors: ActionValidationIssue[]
): ActionValidationIssue[] {
  if (!actions || actions.length === 0) {
    return errors;
  }

  for (let index = 0; index < actions.length; index++) {
    validateAction(actions[index], `${path}.actions[${index}]`, errors);
  }

  return errors;
}
