/**
 * Shared REST GET fetch adapter.
 *
 * A runtime primitive for resolving declarative `RestDataSource` contracts.
 * The fetch implementation is injectable so tests can substitute a fake; the
 * browser/global runtime uses `globalThis.fetch` by default.
 *
 * Safety contract:
 *   - Only `http:` / `https:` URLs are accepted; everything else is rejected.
 *   - URLs containing embedded credentials (userinfo) are rejected so secrets
 *     never transit the fetch path.
 *   - No auth headers, cookies, or credentials are sent by default — only an
 *     `Accept: application/json` header is added.
 *   - A bounded timeout via `AbortController`; in-flight requests are cancelled
 *     on teardown through `abortAll()`.
 *   - A reasonable response-size cap is enforced while streaming the body.
 *   - The response body must be valid JSON; malformed bodies yield a `json`
 *     error rather than throwing.
 *   - All error results carry a stable `code` and a safe `message` that never
 *     echoes the URL, response body, or backend headers.
 */

/** Stable error codes surfaced in every {@link RestFetchFailure}. */
export type RestFetchErrorCode =
  | "invalid-url"
  | "unsafe-protocol"
  | "credentials-in-url"
  | "network"
  | "http"
  | "json"
  | "timeout"
  | "abort"
  | "size-exceeded";

/** A safe, non-throwing error description. No secrets. */
export interface RestFetchError {
  readonly code: RestFetchErrorCode;
  readonly message: string;
}

/** Successful resolution carrying the parsed JSON payload. */
export interface RestFetchSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

/** Failed resolution carrying a safe error. */
export interface RestFetchFailure {
  readonly ok: false;
  readonly error: RestFetchError;
}

/** Discriminated union of every fetch outcome. */
export type RestFetchResult<T> = RestFetchSuccess<T> | RestFetchFailure;

/**
 * Minimal `fetch` signature surface used by this adapter. Matches the DOM
 * `fetch` declaration closely enough to accept both the global implementation
 * and test fakes.
 */
export type FetchImpl = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Options for configuring a {@link RestFetchAdapter}. */
export interface RestFetchAdapterOptions {
  /**
   * Fetch implementation. Defaults to `globalThis.fetch`. Inject a fake in
   * tests.
   */
  readonly fetchImpl?: FetchImpl;

  /**
   * Bounded timeout in milliseconds. Defaults to 10s. The request is aborted
   * when the deadline elapses.
   */
  readonly timeoutMs?: number;

  /**
   * Maximum permitted response body size in bytes. Defaults to 5 MiB. The
   * stream is terminated the moment the cap is exceeded.
   */
  readonly maxResponseBytes?: number;
}

/** Default timeout: 10 seconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Default response size cap: 5 MiB. */
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Only http and https are permitted for declarative REST fetches. */
const ALLOWED_PROTOCOLS: readonly string[] = ["http:", "https:"];

/** Public adapter shape. */
export interface RestFetchAdapter {
  /** Fetch `url`, parse JSON, and return a discriminated result. */
  fetchJson<T = unknown>(url: string): Promise<RestFetchResult<T>>;

  /** Cancel every in-flight request (teardown). */
  abortAll(): void;
}

/** Validates the URL against the http/https + no-credentials contract. */
function validateUrl(
  url: string,
): { valid: true; parsed: URL } | { valid: false; reason: RestFetchErrorCode } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "invalid-url" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, reason: "unsafe-protocol" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: "credentials-in-url" };
  }

  return { valid: true, parsed };
}

/** Human-readable messages per error code. Centralized so none leak input. */
const ERROR_MESSAGES: Record<RestFetchErrorCode, string> = {
  "invalid-url": "Data source URL is not a valid URL.",
  "unsafe-protocol": "Data source URL must use http or https.",
  "credentials-in-url": "Data source URL must not contain embedded credentials.",
  network: "Network error: request failed.",
  http: "HTTP error: request failed.",
  json: "Response body is not valid JSON.",
  timeout: "Request timed out.",
  abort: "Request was cancelled.",
  "size-exceeded": "Response body exceeds the maximum allowed size.",
};

function failure(code: RestFetchErrorCode): RestFetchFailure {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

/**
 * Creates a {@link RestFetchAdapter}.
 *
 * @param options  Configuration (fetch impl, timeout, size cap).
 * @returns        An adapter with `fetchJson` and `abortAll`.
 */
export function createRestFetchAdapter(
  options: RestFetchAdapterOptions = {},
): RestFetchAdapter {
  const fetchImpl: FetchImpl =
    options.fetchImpl ?? (globalThis.fetch as FetchImpl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  /** Tracks every controller whose request has not yet settled. */
  const activeControllers = new Set<AbortController>();

  async function fetchJson<T = unknown>(
    url: string,
  ): Promise<RestFetchResult<T>> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      return failure(validation.reason);
    }

    const controller = new AbortController();
    activeControllers.add(controller);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(validation.parsed.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return failure("http");
      }

      // Early size rejection when Content-Length is available.
      const contentLength = response.headers.get("content-length");
      if (contentLength !== null) {
        const declared = Number.parseInt(contentLength, 10);
        if (!Number.isNaN(declared) && declared > maxBytes) {
          return failure("size-exceeded");
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return failure("json");
      }

      // Stream the body with a running byte cap.
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            reader.cancel();
            return failure("size-exceeded");
          }
          chunks.push(value);
        }
      }

      // Decode then parse JSON — catch malformed bodies explicitly.
      const decoder = new TextDecoder();
      let text = "";
      for (const chunk of chunks) {
        text += decoder.decode(chunk, { stream: true });
      }
      text += decoder.decode();

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return failure("json");
      }

      return { ok: true, data: data as T };
    } catch {
      if (controller.signal.aborted) {
        return failure(timedOut ? "timeout" : "abort");
      }
      return failure("network");
    } finally {
      clearTimeout(timeoutId);
      activeControllers.delete(controller);
    }
  }

  function abortAll(): void {
    for (const controller of activeControllers) {
      controller.abort();
    }
    activeControllers.clear();
  }

  return { fetchJson, abortAll };
}
