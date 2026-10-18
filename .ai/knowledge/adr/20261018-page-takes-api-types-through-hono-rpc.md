---
id: adr-20261018-page-takes-api-types-through-hono-rpc
type: adr
status: accepted
date: 2026-10-18
domains: []
paths:
  - web/api.ts
  - server/http/app.ts
  - web/tsconfig.json
  - eslint.config.js
summary: The page derives the API's types from the server's AppType through Hono's hc and InferResponseType; import type only, enforced by lint; hono/client bundled
reviewed_at: 2026-10-18
---
# The page takes the API's types from the server through Hono RPC

## Context

The page described every answer of the API in hand-written types in `web/api.ts`, copies of what
`server/http/app.ts` returns; nothing checked that the two agreed, so a renamed field showed only
as a blank on the page. Task `review-fixes`, decided with the maintainer on 2026-10-18 ("B: Hono
RPC зараз").

## Decision

- The API's routes are chained in `apiRoutes()` in `server/http/app.ts`, and
  `AppType = ReturnType<typeof apiRoutes>` is exported for the page.
- `web/api.ts` imports it with `import type` only and calls the API through
  `hc<AppType>('/')` from `hono/client`; the page's types (`Project`, `Board`, `Task`,
  `TaskDetails`, `Specs`, `Failure`…) are derived with `InferResponseType`, never written twice.
  `call()` wraps every request with the failures every view shares.
- `hc` does not encode path parameters: the page passes ids through `encodeURIComponent`.
- `web/tsconfig.json` sees Node's types (`"types": ["vite/client", "node"]`), because the server's
  types it imports name them. Two ESLint rules in `web/**` stand in for the check this gives up:
  `no-restricted-globals` refuses Node's globals, and `@typescript-eslint/no-restricted-imports`
  allows only type imports from `server/`, so no server code reaches the page's bundle.
- **Amends** adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas, "Weight": the page
  bundles `hono/client`, from `hono` in `dependencies`, which the server needs anyway; what
  `npx @fapost/jig-ui` installs does not grow. Every other page dependency stays a devDependency.
- **Supplements** adr-20261017-one-typescript-for-server-and-web: `web/tsconfig.json` is separate
  for the DOM library, bundler resolution and Node's types only as the server's types need them.

## Alternatives

- Hand-written copies of the types (what was there) — free, and wrong without a word when the
  server changes.
- `import type` of the server's own result types, with `fetch` by hand — types for the bodies, none
  for the addresses, the methods or which status carries which body.
- `hc` only for its types, `fetch` at run time — the same types, the URLs still built by hand.

## Consequences

- A field the server renames fails `npm run typecheck` in every view that reads it.
- The page bundle grows by `hono/client`: ~5 KB raw, ~1.8 KB gzipped (measured 2026-10-18).
- A route left out of the chain has no type on the page; a new route goes into `apiRoutes()`.
- The page's typecheck accepts Node's globals; only lint refuses them.
