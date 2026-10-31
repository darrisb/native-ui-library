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
/**
 * Binding adapter that renders each resolved record as a `<li>` inside the host
 * element. This is the simplest possible "consumer" — it proves that data
 * fetched from a REST endpoint reaches a rendered element through the generic
 * binding pipeline without any Dropdown existing.
 *
 * The adapter receives records already mapped by the runtime (label/value
 * projection is the data source's `mapping` responsibility, not the adapter's).
 */
export const optionsBindingAdapter = (element, records) => {
    const options = [];
    for (const record of records) {
        const label = record["label"];
        const value = record["value"];
        if (label === undefined || label === null) {
            continue;
        }
        options.push({
            label: String(label),
            value: typeof value === "number" ? value : String(value ?? ""),
        });
    }
    element.setAttribute("data-bound-options", JSON.stringify(options));
    const list = document.createElement("ul");
    list.className = "option-consumer-list";
    for (const option of options) {
        const item = document.createElement("li");
        item.className = "option-consumer-item";
        item.setAttribute("data-option-value", String(option.value));
        item.textContent = option.label;
        list.appendChild(item);
    }
    const existing = element.querySelector(".option-consumer-list");
    if (existing) {
        existing.replaceWith(list);
    }
    else {
        element.appendChild(list);
    }
};
/**
 * Minimal custom element that projects bound options into a list. A future
 * Dropdown component would replace this; the contract (reading
 * `data-bound-options` as JSON) is the integration seam that stays stable.
 */
export class UiOptionConsumer extends HTMLElement {
    connectedCallback() {
        this.render();
    }
    render() {
        const raw = this.getAttribute("data-bound-options");
        if (!raw) {
            return;
        }
        let options;
        try {
            options = JSON.parse(raw);
        }
        catch {
            return;
        }
        const list = document.createElement("ul");
        list.className = "option-consumer-list";
        for (const option of options) {
            const item = document.createElement("li");
            item.className = "option-consumer-item";
            item.setAttribute("data-option-value", String(option.value));
            item.textContent = option.label;
            list.appendChild(item);
        }
        const existing = this.querySelector(".option-consumer-list");
        if (existing) {
            existing.replaceWith(list);
        }
        else {
            this.appendChild(list);
        }
    }
}
/**
 * Defines the `<ui-option-element>` custom element if it is not already
 * defined. Safe to call multiple times. No-op when `customElements` is absent
 * (e.g. server-side).
 */
export function defineOptionConsumer() {
    if (typeof customElements === "undefined") {
        return;
    }
    if (customElements.get("ui-option-consumer")) {
        return;
    }
    customElements.define("ui-option-consumer", UiOptionConsumer);
}
//# sourceMappingURL=option-consumer-adapter.js.map