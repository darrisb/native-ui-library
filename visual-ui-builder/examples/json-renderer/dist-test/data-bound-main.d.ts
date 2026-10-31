/**
 * Standalone data-bound example entry point.
 *
 * Demonstrates API-backed options resolved at runtime through the generic
 * fetch -> map -> bind pipeline — without the builder application. A mock fetch
 * adapter injects a canned REST response; a mock option-consumer adapter
 * renders the resolved records into the DOM so the data flow is visible.
 *
 * In production the mock fetch would be replaced by the browser's native fetch
 * (the default when no `dataSourceRuntime` override is supplied), and the
 * external API endpoint must permit CORS. Private APIs that do not send
 * `Access-Control-Allow-Origin` headers require a customer-owned proxy or
 * backend to relay the request — see README.
 */
export {};
//# sourceMappingURL=data-bound-main.d.ts.map