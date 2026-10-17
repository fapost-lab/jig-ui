---
id: adr-20261017-one-typescript-for-server-and-web
type: adr
status: accepted
date: 2026-10-17
domains: []
paths:
  - package.json
  - tsconfig.json
  - web/tsconfig.json
summary: TypeScript 6 for server and web so vue-tsc checks .vue templates; TS 7 waits for vue-tsc
reviewed_at: 2026-10-17
---
# One TypeScript, the JavaScript 6.x line, checks both the server and the Vue page

## Context

The package was on `typescript` 7, the native compiler, which has no JavaScript API. `vue-tsc`,
the only checker of `.vue` templates, is built on that API, so with TypeScript 7 templates are not
type-checked at all: Vite only strips types. Phase 1's views are mostly templates over Jig's JSON.
Task `walking-skeleton`, decided with the maintainer on 2026-10-17 ("має бути один TS на бек і
фронт").

## Decision

- `typescript` is `^6.0.3` for the whole package; `tsc --noEmit` checks `server/`, and
  `vue-tsc --noEmit -p web/tsconfig.json` checks `web/`, both in `npm run typecheck`.
- `web/tsconfig.json` is separate only because the page needs the DOM library and bundler module
  resolution; both configs use the same compiler.
- Return to TypeScript 7 when `vue-tsc` supports it — one version change.

## Alternatives

- Two compilers: TypeScript 6 for `vue-tsc`, TypeScript 7 for `server/` — two compilers and two
  rule sets for a speed nobody notices at this size; `vue-tsc` resolves the package named
  `typescript`, so one of them would need an alias.
- TypeScript 7 with `.vue` unchecked — a misspelled field in a template only shows as a blank on
  the page.

## Consequences

- `npm run typecheck` fails on a template error (checked: `state.verzion` → TS2551).
- The speed of the native compiler is given up until `vue-tsc` follows it.
