/**
 * Focused tests for the shared REST GET fetch adapter.
 *
 * Uses a fake `fetch` implementation injected through adapter options. No
 * real network requests are issued. Covers: success, HTTP failure, invalid
 * JSON, abort, timeout, unsafe URL, and a few supporting edge cases
 * (credentials in URL, response size cap).
 */

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${String(expected)}, but got ${String(actual)}.`,
    );
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `Expected ${expectedJson}, but got ${actualJson}.`,
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

function assertIncludes(actual: string, expected: string, message?: string): void {
  if (!actual.includes(expected)) {
    throw new Error(
      message ?? `Expected "${actual}" to include "${expected}".`,
    );
  }
}

import type { FetchImpl } from "../data-source/rest-fetch-adapter.js";
import { createRestFetchAdapter } from "../data-source/rest-fetch-adapter.js";

/** Shared resolver so tests can await fetch settling. */
let resolveFetch: (() => void) | null = null;
function makeResponse(
  body: string | null,
  init: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    contentLength?: string | null;
  } = {},
): Response {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    contentLength = null,
  } = init;

  const headers = new Headers();
  if (contentLength !== null) {
    headers.set("content-length", contentLength);
  }

  const initObj: ResponseInit = { status, statusText, headers };

  if (body === null) {
    return new Response(null, initObj);
  }

  // `ok` is not part of ResponseInit in the TS lib; set it after construction.
  const response = new Response(body, initObj);
  Object.defineProperty(response, "ok", { value: ok });
  return response;
}

function jsonFetch(
  body: string,
  init?: Parameters<typeof makeResponse>[1],
): FetchImpl {
  const response = makeResponse(body, init);
  return (async (): Promise<Response> => {
    return response;
  }) as FetchImpl;
}

function delayedFetch(body: string, delayMs: number): FetchImpl {
  const response = makeResponse(body);
  return (async (_input: string | URL, init2?: RequestInit): Promise<Response> => {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    if (init2?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return response;
  }) as FetchImpl;
}

function pendingFetch(body: string): FetchImpl {
  const response = makeResponse(body);
  return (async (_input: string | URL, init2?: RequestInit): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
      resolveFetch = () => {
        resolve(response);
      };
      init2?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
  }) as FetchImpl;
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

test("success: parses JSON body and returns data", async () => {
  const payload = { items: [1, 2, 3] };
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch(JSON.stringify(payload)),
  });
  const result = await adapter.fetchJson("https://api.example.com/data");
  assertTrue(result.ok, "Result should be ok.");
  if (result.ok) {
    assertDeepEqual(result.data, payload);
  }
});

test("success: parses JSON array body", async () => {
  const payload = [{ id: 1 }, { id: 2 }];
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch(JSON.stringify(payload)),
  });
  const result = await adapter.fetchJson("https://api.example.com/list");
  assertTrue(result.ok);
  if (result.ok) {
    assertDeepEqual(result.data, payload);
  }
});

// ---------------------------------------------------------------------------
// HTTP failure
// ---------------------------------------------------------------------------

test("HTTP failure: non-200 status surfaces http error", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}", { ok: false, status: 500, statusText: "Internal Server Error" }),
  });
  const result = await adapter.fetchJson("https://api.example.com/fail");
  assertTrue(!result.ok, "Result should not be ok.");
  if (!result.ok) {
    assertEqual(result.error.code, "http");
    assertIncludes(result.error.message, "HTTP");
  }
});

test("HTTP failure: 404 is an http error", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("Not Found", { ok: false, status: 404 }),
  });
  const result = await adapter.fetchJson("https://api.example.com/missing");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "http");
  }
});

// ---------------------------------------------------------------------------
// Invalid JSON
// ---------------------------------------------------------------------------

test("invalid JSON: malformed body surfaces json error", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{ not valid json"),
  });
  const result = await adapter.fetchJson("https://api.example.com/bad");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "json");
  }
});

test("invalid JSON: HTML body surfaces json error", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("<!DOCTYPE html><html><body>Hi</body></html>"),
  });
  const result = await adapter.fetchJson("https://api.example.com/html");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "json");
  }
});

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

test("abort: abortAll before resolution yields abort error", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: pendingFetch('{"ok":true}'),
  });
  const promise = adapter.fetchJson("https://api.example.com/slow");
  // Give the fetch a chance to register its signal.
  await new Promise<void>((r) => setTimeout(r, 10));
  adapter.abortAll();
  resolveFetch?.();
  const result = await promise;
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "abort");
  }
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

test("timeout: slow fetch yields timeout error", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: delayedFetch('{"ok":true}', 500),
    timeoutMs: 30,
  });
  const result = await adapter.fetchJson("https://api.example.com/slow");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "timeout");
  }
});

// ---------------------------------------------------------------------------
// Unsafe URL
// ---------------------------------------------------------------------------

test("unsafe URL: ftp:// is rejected with unsafe-protocol", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}"),
  });
  const result = await adapter.fetchJson("ftp://example.com/data.json");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "unsafe-protocol");
  }
});

test("unsafe URL: file:// is rejected with unsafe-protocol", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}"),
  });
  const result = await adapter.fetchJson("file:///etc/passwd");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "unsafe-protocol");
  }
});

test("unsafe URL: javascript: is rejected with unsafe-protocol", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}"),
  });
  const result = await adapter.fetchJson("javascript:alert(1)");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "unsafe-protocol");
  }
});

test("invalid URL: not a URL at all yields invalid-url", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}"),
  });
  const result = await adapter.fetchJson(":::not a url:::");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "invalid-url");
  }
});

test("credentials in URL: userinfo is rejected", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}"),
  });
  const result = await adapter.fetchJson("https://user:pass@api.example.com/data");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "credentials-in-url");
  }
});

// ---------------------------------------------------------------------------
// Size limit
// ---------------------------------------------------------------------------

test("size cap: oversized Content-Length is rejected early", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}", { contentLength: "100000000" }),
    maxResponseBytes: 1000,
  });
  const result = await adapter.fetchJson("https://api.example.com/big");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertEqual(result.error.code, "size-exceeded");
  }
});

// ---------------------------------------------------------------------------
// No secrets leaked in error messages
// ---------------------------------------------------------------------------

test("error message does not contain the URL", async () => {
  const adapter = createRestFetchAdapter({
    fetchImpl: jsonFetch("{}", { ok: false, status: 500 }),
  });
  const result = await adapter.fetchJson("https://api.example.com/secret-endpoint?token=abc");
  assertTrue(!result.ok);
  if (!result.ok) {
    assertTrue(
      !result.error.message.includes("secret-endpoint"),
      "Error message must not include the URL.",
    );
    assertTrue(
      !result.error.message.includes("token"),
      "Error message must not include query parameters.",
    );
  }
});

// ---------------------------------------------------------------------------
// No auth headers / credentials sent by default
// ---------------------------------------------------------------------------

test("request sends Accept header but no Authorization or Cookie", async () => {
  let capturedHeaders: HeadersInit | undefined;
  const capturingFetch: FetchImpl = (async (
    _input: string | URL,
    init2?: RequestInit,
  ): Promise<Response> => {
    capturedHeaders = init2?.headers;
    return makeResponse("{}");
  }) as FetchImpl;

  const adapter = createRestFetchAdapter({ fetchImpl: capturingFetch });
  await adapter.fetchJson("https://api.example.com/data");

  const headers = new Headers(capturedHeaders);
  assertEqual(headers.get("Accept"), "application/json");
  assertTrue(!headers.has("Authorization"), "No Authorization header by default.");
  assertTrue(!headers.has("Cookie"), "No Cookie header by default.");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = results.filter((result) => result.passed).length;
const failed = results.filter((result) => !result.passed).length;

for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name}`);
  if (result.error) {
    console.log(`  ${result.error}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed.`);
}

export {};
