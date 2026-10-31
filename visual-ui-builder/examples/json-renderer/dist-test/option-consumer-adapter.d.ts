/**
 * Mock option-consumer adapter for data-bound examples.
 *
 * This module demonstrates how a future Dropdown (or any other option-consuming
 * component) would receive resolved, mapped records from the data source runtime
 * via the binding-adapter contract — without assuming a Dropdown exists today.
 *
 * Two surfaces are provided:
 *
 *   1. {@link optionsBindingAdapter} — a `DataBindingAdapter` that renders each
 *      resolved record as a visible `<li>` inside the host element. Register it
 *      for the `"options"` target to see fetched data appear in the DOM at
 *      runtime.
 *
 *   2. {@link defineOptionConsumer} — a minimal custom element
 *      `<ui-option-consumer>` that projects the `data-bound-options` attribute
 *      into a list. A future Dropdown would replace this with its own Shadow
 *      DOM; the binding contract (`data-bound-options`) stays the same.
 *
 * Neither surface introduces a new native component in the sense of extending
 * the builder's component palette — they exist solely to verify the generic
 * fetch -> map -> bind pipeline end-to-end in a standalone runtime.
 */
import type { DataBindingAdapter } from "@visual-ui/renderer";
/**
 * Binding adapter that renders each resolved record as a `<li>` inside the host
 * element. This is the simplest possible "consumer" — it proves that data
 * fetched from a REST endpoint reaches a rendered element through the generic
 * binding pipeline without any Dropdown existing.
 *
 * The adapter receives records already mapped by the runtime (label/value
 * projection is the data source's `mapping` responsibility, not the adapter's).
 */
export declare const optionsBindingAdapter: DataBindingAdapter;
/**
 * Minimal custom element that projects bound options into a list. A future
 * Dropdown component would replace this; the contract (reading
 * `data-bound-options` as JSON) is the integration seam that stays stable.
 */
export declare class UiOptionConsumer extends HTMLElement {
    connectedCallback(): void;
    private render;
}
/**
 * Defines the `<ui-option-element>` custom element if it is not already
 * defined. Safe to call multiple times. No-op when `customElements` is absent
 * (e.g. server-side).
 */
export declare function defineOptionConsumer(): void;
//# sourceMappingURL=option-consumer-adapter.d.ts.map