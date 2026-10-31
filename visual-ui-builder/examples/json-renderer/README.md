# JSON to DOM Renderer Example

This standalone example demonstrates rendering Card, Text, and Button components
from a JSON document using the shared `@visual-ui/renderer` package and the
native Web Components (`ui-card`, `ui-text`, `ui-button`). It does not require
the Visual UI Builder application or any frontend framework.

## What it demonstrates

- Loading a JSON document that contains an ordered list of root component
  instances.
- Initializing the component metadata registry and the native component
  registry independently of the builder.
- Registering the Card, Text, and Button definitions and their custom elements
  using the established `@visual-ui/core` and `@visual-ui/components` APIs.
- Rendering each root instance into a native DOM element with the shared
  `renderComponent()` renderer.
- Recursively rendering nested children: a Card can contain Text, Button, and
  other Card components through its default slot.
- Applying component properties through the renderer's property adapters:
  - Card: `title`, `description`, `padding`, `backgroundColor`
  - Text: `content`, `color`, `align`
  - Button: `label`, `variant`, `disabled`
- Handling invalid documents, unknown component types, invalid properties,
  disallowed children, cyclic references, excessive nesting, and missing
  registrations with readable error messages in the page.

## JSON document format

The document is a plain JSON array of `ComponentInstance` objects. Each entry
must have an `id`, a `type`, and a `properties` object. Children are optional:

```json
[
  {
    "id": "card-welcome",
    "type": "card",
    "properties": {
      "title": "Welcome",
      "description": "Discover our reusable native UI components.",
      "padding": 24,
      "backgroundColor": "#ffffff"
    },
    "children": [
      {
        "id": "text-welcome",
        "type": "text",
        "properties": {
          "content": "Discover our latest arrivals.",
          "color": "#333333",
          "align": "left"
        }
      },
      {
        "id": "button-welcome",
        "type": "button",
        "properties": {
          "label": "Shop Now",
          "variant": "primary",
          "disabled": false
        }
      }
    ]
  }
]
```

The shape matches the existing `ComponentInstance` interface from
`@visual-ui/core`. No new document contract is introduced.

The example document lives at:

```text
examples/json-renderer/document.json
```

## How component properties map to the rendered appearance

### Card

| Property          | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `title`           | Sets the `title` attribute on the native `ui-card` element.     |
| `description`     | Sets the `description` attribute on the native `ui-card` element. The `ui-card` Shadow DOM renders it beneath the title. Omitting the property keeps the Card valid and hides the description. |
| `padding`         | Sets the `--ui-card-padding` CSS custom property (with `px`).   |
| `backgroundColor` | Sets the `--ui-card-background` CSS custom property.            |

### Text

| Property  | Effect                                                    |
| --------- | --------------------------------------------------------- |
| `content` | Sets the `content` attribute on the native `ui-text` element. |
| `color`   | Sets the `color` attribute on the native `ui-text` element.   |
| `align`   | Sets the `align` attribute on the native `ui-text` element.   |

### Button

| Property   | Effect                                                       |
| ---------- | ------------------------------------------------------------ |
| `label`    | Sets the `label` attribute on the native `ui-button` element. |
| `variant`  | Sets the `variant` attribute on the native `ui-button` element. |
| `disabled` | When `true`, sets the `disabled` attribute; when `false`, the attribute is removed. |

The native Card's Shadow DOM exposes a default slot for children, so nested
components are projected into the Card's content area without recreating Card
internals.

## Start the development server

From the repository root:

```bash
npm run dev:json-renderer
```

This starts Vite on port `5174` and serves the example. Vite resolves the
`@visual-ui/*` workspace package imports and bundles them for the browser.

## Create the production build

From the repository root, first build the required packages and then the
example:

```bash
npm run build
npm run build:json-renderer
```

The production assets are emitted to:

```text
examples/json-renderer/dist/
```

Vite bundles all workspace dependencies, so the emitted JavaScript contains no
unresolved bare imports such as `@visual-ui/core` or `@visual-ui/renderer`.

## Data-bound (API-backed) example

A second document, `data-bound-document.json`, demonstrates the generic
fetch -> map -> bind pipeline: a Card's options are resolved from a declarative
REST data source at runtime rather than from static properties.

### How it works

Each Card declares a `dataSource` (type `rest`, method `GET`) plus a
`bindings` entry targeting the `"options"` render slot. At mount time the
`DataSourceRuntime` fetches the URL, extracts the collection via
`responsePath`, projects each record to `{ label, value }` via `mapping`, and
delivers the mapped records to a binding adapter registered for the `"options"
target.

Example JSON:

```json
{
  "id": "card-api-products",
  "type": "card",
  "properties": { "title": "Products (API-backed)", "padding": 24 },
  "dataSource": {
    "type": "rest",
    "method": "GET",
    "url": "https://api.example.com/catalog/products",
    "responsePath": "data.items",
    "mapping": { "label": "name", "value": "sku" },
    "loadOn": "mount"
  },
  "bindings": [{ "target": "options" }]
}
```

- `responsePath` (`data.items`) drills into the response payload to the array of
  records.
- `mapping` (`{ "label": "name", "value": "sku" }`) projects each source record
  to the `label`/`value` shape the `"options"` binding target expects.

### Mock option-consumer adapter

A Dropdown component does not exist yet, so `option-consumer-adapter.ts` provides
a **mock** adapter for the `"options"` binding target that renders each resolved
record as an `<li>` inside the host element. This adapter proves the pipeline
end-to-end without assuming any particular consumer component. A future Dropdown
would replace this adapter; the `data-bound-options` attribute contract and the
binding-target name (`"options"`) stay stable.

Run the data-bound page:

```bash
npm run dev:json-renderer
# then open http://localhost:5174/data-bound.html
```

`data-bound-main.ts` wires the mock fetch adapter (so the page runs with no live
network) and the mock option-consumer binding adapter to the renderer.

### CORS requirement

The external API **must** permit cross-origin requests from the page's origin:
the browser enforces CORS on the fetch made by `RestFetchAdapter`. If the API
does not send `Access-Control-Allow-Origin`, the browser blocks the response
and the data source resolves to an error state.

For private/internal APIs that cannot be exposed with CORS headers, the customer
must supply a same-origin proxy or backend relay. The proxy forwards the request
to the private API and re-emits the response with permissive CORS headers. The
`dataSource.url` then points at the proxy, never at the private backend
directly.

No credentials are embedded in the data source contract — the adapter rejects
URLs containing userinfo and sends no `Authorization` or `Cookie` headers by
design, keeping project JSON free of secrets.

### Scope

- `data-bound-document.json` is a **fixture**: it shows the declarative REST
  data source shape. It is exercised by focused integration tests, not by the
  default `index.html`.
- `option-consumer-adapter.ts` is a **verification seam**: a mock adapter that
  renders resolved records into the DOM. It is not a native component in the
  builder palette and is not imported by the builder.
- `data-bound.html` + `data-bound-main.ts` form a standalone page that loads
  with a mock fetch and no builder server.

## Scope

- This example supports **root-level Card, Text, and Button instances**.
- **Nested component rendering is supported**: Cards may contain Text, Button,
  and other Card components. Text and Button cannot contain children.
- The renderer validates nested trees recursively and rejects invalid child
  types, disallowed children, invalid properties, cyclic references, and
  excessive nesting.
- The example does not depend on the builder application, property editor,
  canvas, or drag-and-drop logic.
