/** Options for the post-render data-source resolver. */
export interface DataSourceResolveOptions {
    /**
     * Fetch implementation used to retrieve suggestion data. Defaults to the
     * global `fetch`. Tests inject a mock so no real network request is made.
     */
    readonly fetch?: typeof fetch;
}
/**
 * Walks the rendered DOM and resolves data-source components by fetching their
 * configured URL, extracting items via responsePath, and mapping label/value
 * fields into the `data-bound-options` attribute.
 *
 * Both `ui-dropdown` and `ui-input` use the same `data-source-url` /
 * `data-bound-options` convention, so a single selector covers both.
 */
export declare function resolveDataSourceElements(root: HTMLElement, options?: DataSourceResolveOptions): Promise<void>;
/**
 * Backwards-compatible alias for the resolver's original name. The resolver
 * now populates both Dropdown options and Input suggestions.
 */
export declare const resolveDataSourceDropdowns: typeof resolveDataSourceElements;
//# sourceMappingURL=main.d.ts.map