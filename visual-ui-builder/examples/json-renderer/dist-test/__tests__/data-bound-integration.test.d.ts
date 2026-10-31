/**
 * Focused integration tests: generic data-bound runtime with a mock
 * option-consumer adapter and mocked fetch.
 *
 * Verifies:
 *   - REST dataSource with responsePath + label/value mapping resolves at
 *     runtime through the generic fetch -> map -> bind pipeline.
 *   - A mock option-consumer adapter receives the mapped records and renders
 *     them into the DOM — no Dropdown component is assumed.
 *   - The standalone runtime is independent of the builder application: no
 *     builder modules are imported, no builder server is required.
 *   - Multiple instances sharing one runtime each resolve and bind their own
 *     data correctly.
 *   - Empty / error responses set the correct lifecycle state on the element.
 *   - The data-bound example JSON survives serialize/import round-tripping
 *     and re-renders identically (export/import contract).
 */
export {};
//# sourceMappingURL=data-bound-integration.test.d.ts.map