---
id: convention-code-style
type: convention
status: active
domains: []
paths:
  - eslint.config.js
  - .prettierrc.json
  - .gitattributes
summary: ESLint for correctness, Prettier for layout; npm run lint is what jig verify and CI run
reviewed_at: 2026-10-18
---
# Code style: ESLint and Prettier

## Practice

- Prettier owns layout: single quotes, width 140, Tailwind classes in Tailwind's order (also
  inside `cn()` and `cva()`). `.prettierrc.json`.
- ESLint owns correctness: typescript-eslint's and eslint-plugin-vue's `recommended`, with
  formatting rules off so the two never disagree. `eslint.config.js`; a rule turned off there
  carries its reason.
- `npm run format` writes both; `npm run lint` checks both and is what CI and a full `jig verify` run
  (a narrowed `jig verify --changed` runs ESLint on changed js/ts only — no Prettier, no `.vue`).
- They cover `server/**/*.ts`, `web/**/*.{ts,vue,css}` and the root `*.{ts,js}`; `.ai/`, `docs/` and
  `dist/` are not ours to format.

## Rationale

The maintainer, task `design-system`, 2026-10-18: one style in every file, without review
comments about it.
