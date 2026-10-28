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
