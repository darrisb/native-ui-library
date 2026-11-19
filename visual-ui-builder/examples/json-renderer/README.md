# JSON to DOM Renderer Example

This standalone example demonstrates rendering Card, Text, Button, Dropdown, and
Input components from a JSON document using the shared `@visual-ui/renderer`
package and the native Web Components (`ui-card`, `ui-text`, `ui-button`,
`ui-dropdown`, `ui-input`). It does not require the Visual UI Builder
application or any frontend framework.

## What it demonstrates

- Loading a JSON document that contains an ordered list of root component
  instances.
- Initializing the component metadata registry and the native component
  registry independently of the builder.
- Registering the Card, Text, Button, Dropdown, and Input definitions and their
  custom elements using the established `@visual-ui/core` and
  `@visual-ui/components` APIs.
- Rendering each root instance into a native DOM element with the shared
  `renderComponent()` renderer.
- Recursively rendering nested children: a Card can contain Text, Button, and
  other Card components through its default slot.
- Applying component properties through the renderer's property adapters:
  - Card: `title`, `description`, `padding`, `backgroundColor`
  - Text: `content`, `color`, `align`
  - Button: `label`, `variant`, `disabled`
  - Dropdown: `label`, `placeholder`, `name`, `required`, `disabled`,
    `staticOptions`, `dataSourceUrl`, `dataSourceResponsePath`,
    `dataSourceLabelField`, `dataSourceValueField`
  - Input: `label`, `placeholder`, `name`, `inputType`, `required`, `disabled`,
    `readonly`, `maxLength`, `defaultValue`, `dataSourceUrl`,
    `dataSourceResponsePath`, `dataSourceLabelField`, `dataSourceValueField`
- Populating Dropdown options from a static JSON string or from a REST data
  source, and Input suggestions from a REST data source, fetched after
  rendering (with `responsePath` navigation and field mapping).
- Triggering declarative actions in interactive mode: the search Input's
  `submit` action navigates to `/search?q={value}`, substituting the entered
  value with `encodeURIComponent` before navigation.
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

### Dropdown

The Dropdown supports two ways to populate its options:

1. **Static options** via `staticOptions` — a JSON-encoded string of
   `{value, label}` pairs. The renderer parses it and writes the result to the
   `options` attribute on the `ui-dropdown` element.

2. **REST data source** via `dataSourceUrl` — after rendering, the example's
   `main.ts` walks the DOM for any `ui-dropdown` with a `data-source-url`
   attribute, fetches the URL, navigates to `dataSourceResponsePath` in the
   JSON response, maps the `dataSourceLabelField` and `dataSourceValueField`
   onto `{label, value}` objects, and writes them to the `data-bound-options`
   attribute. The `ui-dropdown` component gives `data-bound-options` priority
   over static `options`.

During the fetch the dropdown enters a loading state (`data-ds-status="loading"`),
disabling the select. On success it populates the options; on failure it shows
an error message.

| Property                 | Effect                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `label`                  | Sets the `label` attribute on `ui-dropdown`.                                             |
| `placeholder`            | Sets the `placeholder` attribute (disabled first option text).                           |
| `name`                   | Sets the `name` attribute on the internal `<select>`.                                    |
| `required`               | When `true`, sets the `required` attribute; when `false`, removes it.                    |
| `disabled`               | When `true`, sets the `disabled` attribute; when `false`, removes it.                    |
| `staticOptions`          | JSON string of `[{value, label}, …]`. Parsed by the renderer and written to the `options` attribute. |
| `dataSourceUrl`          | REST endpoint URL. Written to `data-source-url` attribute; resolved after rendering.    |
| `dataSourceResponsePath` | Dot-separated path into the JSON response (e.g. `"items"` or `"data.results"`). Defaults to the response root. |
| `dataSourceLabelField`   | Field name on each item to use as the display label. Defaults to `"label"`.             |
| `dataSourceValueField`   | Field name on each item to use as the option value. Defaults to `"value"`.              |

#### Example data-source endpoint

A **Schema-to-Entity** style endpoint that returns a paginated, field-projected
collection:

```
GET /api/data/customers?fields=id,name
```

```json
{
  "items": [
    { "id": "c-101", "name": "Acme Corp" },
    { "id": "c-102", "name": "Globex Inc" }
  ],
  "total": 2
}
```

With `dataSourceResponsePath: "items"`, `dataSourceLabelField: "name"`, and
`dataSourceValueField: "id"`, the dropdown renders:

```html
<ui-dropdown
  label="Customer"
  data-bound-options='[{"value":"c-101","label":"Acme Corp"},{"value":"c-102","label":"Globex Inc"}]'
></ui-dropdown>
```

### Input

The Input is intended for **search and filter values**. Its suggestion endpoint
is a read-only `GET`: the example never writes to or mutates the backend.
Suggestions are rendered in the `ui-input` Shadow DOM as a `<datalist>` linked
to the native `<input>`.

The Input supports a REST data source through the same
`dataSourceUrl` / `data-source-url` / `data-bound-options` convention as the
Dropdown. After rendering, `main.ts` fetches the URL, navigates to
`dataSourceResponsePath`, maps the configured label/value fields, and writes
the result to `data-bound-options`.

| Property                 | Effect                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `label`                  | Sets the `label` attribute on `ui-input`.                                                |
| `placeholder`            | Sets the `placeholder` attribute on the internal `<input>`.                              |
| `name`                   | Sets the `name` attribute on the internal `<input>`.                                     |
| `inputType`              | Sets the `input-type` attribute (`text`, `search`, `email`, `number`, `date`, `tel`, `url`). Invalid values fall back to `text`. |
| `required`               | When `true`, sets the `required` attribute; when `false`, removes it.                    |
| `disabled`               | When `true`, sets the `disabled` attribute; when `false`, removes it.                    |
| `readonly`               | When `true`, sets the `readonly` attribute; when `false`, removes it.                    |
| `maxLength`              | Positive integers set the `max-length` attribute.                                        |
| `defaultValue`           | Sets the `default-value` attribute (initial input value).                                |
| `dataSourceUrl`          | Read-only suggestion endpoint URL. Written to `data-source-url`; resolved after rendering. |
| `dataSourceResponsePath` | Dot-separated path into the JSON response (e.g. `"suggestions"`). Defaults to the response root. |
| `dataSourceLabelField`   | Field name on each item to use as the suggestion label. Defaults to `"label"`.            |
| `dataSourceValueField`   | Field name on each item to use as the suggestion value. Defaults to `"value"`.            |

#### Actions

The Input definition declares `focus` and `submit` events. A `submit` event is
emitted when Enter is pressed in the inner input, with `{value}` bound to the
current input value. The example configures:

```json
{
  "id": "action-search-submit",
  "event": "submit",
  "type": "navigate",
  "config": { "url": "/search?q={value}" }
}
```

The action executor replaces `{value}` with `encodeURIComponent(inputValue)`
and navigates the current window to `/search?q=…`. The final URL is validated
against the shared scheme allowlist before navigation.

### CORS

The REST fetch uses the browser's native `fetch()`, so data-source endpoints
(Dropdown options and Input suggestions) must allow cross-origin requests.
Configure the server to include these headers:

```
Access-Control-Allow-Origin: https://your-app-origin
Access-Control-Allow-Headers: Content-Type
```

If the endpoint is on the same origin as the rendered page, no CORS headers are
needed.

### Example suggestion endpoint

A read-only suggestion endpoint for the search Input:

```
GET /api/search/suggestions?fields=title,query
```

```json
{
  "suggestions": [
    { "title": "Native Web Components", "query": "native" },
    { "title": "JSON Renderer", "query": "renderer" }
  ]
}
```

With `dataSourceResponsePath: "suggestions"`, `dataSourceLabelField: "title"`,
and `dataSourceValueField: "query"`, the input renders matching suggestions in
its `<datalist>`.

No credentials are embedded in the example JSON. Provide authentication through
cookies, an `Authorization` header injected by a reverse proxy, or a bearer
token in the page's runtime configuration.

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

## Scope

- This example supports **root-level Card, Text, Button, Dropdown, and Input
  instances**.
- **Nested component rendering is supported**: Cards may contain Text, Button,
  and other Card components. Text, Button, Dropdown, and Input cannot contain
  children.
- **Dropdown data binding**: dropdowns with `dataSourceUrl` have their options
  populated after rendering by fetching the configured REST endpoint.
- **Input suggestions**: inputs with `dataSourceUrl` have their suggestions
  populated after rendering into `data-bound-options`, which the native
  `ui-input` renders as a `<datalist>`.
- **Declarative actions**: in interactive mode, `submit` actions on the Input
  navigate to the configured URL with `{value}` replaced by the encoded input
  value.
- The example JSON is plain serializable data and round-trips through
  `JSON.parse(JSON.stringify(...))` unchanged.
- The renderer validates nested trees recursively and rejects invalid child
  types, disallowed children, invalid properties, cyclic references, and
  excessive nesting.
- The example does not depend on the builder application, property editor,
  canvas, or drag-and-drop logic.
