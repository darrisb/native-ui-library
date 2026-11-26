# Schema graph list-page example

This standalone page shows the complete read-only flow: a Schema to Entity
`GET /api/graph` document is parsed, converted into a renderer document, and
rendered as native Card, Dropdown, Input, and Table Web Components. By default
it uses a local mock of the data API, so no server is required.

```bash
npm run dev:schema-pages
```

Open the printed URL for mock data. To use a running Schema to Entity instance,
pass its origin as `api`, for example:

```text
http://localhost:5175/?api=http://localhost:8080
```

Configure Schema to Entity with `data-api-enabled` and `graph-enabled` turned
on. Add the page origin (for the command above, `http://localhost:5175`) to
`data-allowed-origins`; the browser will otherwise block the cross-origin data
requests. Replace `graph.json` with the response from that server's
`GET /api/graph` when demonstrating its schema.

The generated page makes only `GET /api/data/...` requests. It never generates
forms, mutation actions, or write calls. Relationship dropdowns are generated
only for relationships whose graph status is `declared` or `confirmed`;
`proposed` and `rejected` relationships do not become filters. Each data source
also carries the version read from `GET /api/data/{source}`, so a different
`X-Schema-Version` response is visibly marked stale.
