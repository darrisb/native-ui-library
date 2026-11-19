/**
 * Shared URL-scheme safety policy for declarative navigate actions.
 *
 * Both the instance validator and the runtime action executor consume this
 * module, so a document can never validate as safe and then be silently
 * dropped at dispatch time. The policy is an explicit allowlist: relative URLs
 * (no scheme) are permitted, while absolute URLs must use one of the listed
 * schemes. Known-dangerous schemes are rejected first as defense in depth.
 */

/** URL schemes permitted for declarative navigation. */
export const ALLOWED_URL_SCHEMES: readonly string[] = [
  "http",
  "https",
  "mailto",
  "tel",
];

/**
 * URL schemes that must never appear in a declarative navigate URL. These
 * schemes can execute scripts, render arbitrary content, or exfiltrate data
 * when injected into navigation, so they are unconditionally rejected.
 */
export const BLOCKED_URL_SCHEMES: readonly string[] = [
  "javascript",
  "data",
  "vbscript",
  "file",
];

/**
 * Extracts the URL scheme (the part before the first `:`), lower-cased, or
 * `null` when no absolute scheme is present (e.g. relative URLs).
 *
 * Leading whitespace and control characters are stripped first because browsers
 * ignore them when parsing schemes; without this step an obfuscated payload
 * such as `java\nscript:` would bypass the policy.
 */
export function extractUrlScheme(url: string): string | null {
  // Strip leading whitespace/control chars to defeat scheme obfuscation.
  const trimmed = url.replace(/^[\s\u0000-\u001f]+/, "");
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  return match ? match[1].toLowerCase() : null;
}

/** Reports whether the URL uses a permitted (safe) scheme or is relative. */
export function isAllowedUrl(url: string): boolean {
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
