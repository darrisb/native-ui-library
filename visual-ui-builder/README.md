# Visual UI Builder

A framework-independent UI component library built with HTML, TypeScript, CSS, and native browser Web Components.

## Project Structure

```text
visual-ui-builder/
├── apps/
│   └── builder/          # Vite-based builder application
├── packages/
│   ├── core/             # Core types and utilities
│   ├── components/       # Native Web Components
│   └── renderer/         # Rendering and serialization logic
├── integrations/
│   ├── shopify/          # Future Shopify integration
│   └── wordpress/        # Future WordPress integration
```

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — Start the builder development server
- `npm run build` — Build all workspace packages
- `npm run typecheck` — Run TypeScript checks across workspaces

## Schema versions

Schema to Entity exposes a source's current version as `schemaVersion` from
`GET /api/data/{source}`. Pass those values to list-page generation through
`schemaVersions`; generated REST sources compare them with the
`X-Schema-Version` header returned by data endpoints.

## Schema graph list-page example

`npm run dev:schema-pages` runs a standalone, server-free example that turns a
two-source Schema to Entity graph into a working read-only Orders list with a
Customer relationship filter and pagination. See
[`examples/schema-pages/README.md`](examples/schema-pages/README.md) for mock
data details and instructions for connecting a running Schema to Entity server.
