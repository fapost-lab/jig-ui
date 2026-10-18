---
id: convention-code-style
type: convention
status: active
domains: []
paths:
  - eslint.config.js
  - .prettierrc.json
  - .gitattributes
  - package.json
summary: Prettier for layout, ESLint for correctness and the layout Prettier keeps (object types a line per member, .vue padding); npm run lint is what jig verify and CI run
reviewed_at: 2026-10-18
---
# Code style: ESLint and Prettier

## Practice

- Prettier owns layout: single quotes, width 140, Tailwind classes in Tailwind's order (also
  inside `cn()` and `cva()`), the inside of a `.vue` file's `<script>` and `<style>` indented
  (`vueIndentScriptAndStyle`, as WebStorm does). `.prettierrc.json`.
- ESLint owns correctness: typescript-eslint's and eslint-plugin-vue's `recommended`, with
  Prettier's formatting rules off (`skipFormatting`). `eslint.config.js`; a rule turned off there
  carries its reason.
- ESLint also owns the layout Prettier leaves as it finds it, through `@stylistic` after
  `skipFormatting`, so the two still never disagree:
  - an object type of two members or more — `{ a: …; b: … }` — has a line per member; one member
    goes on one line or not, as Prettier fits it (`object-curly-newline`, `consistent`);
  - in `.vue`, every object type — props and events — has a line per member, even one, and a
    statement of several lines is followed by a blank line (`padding-line-between-statements`).
- `npm run format` writes both, ESLint first: its fix breaks a line after the brace, Prettier then
  puts each member on its own; `npm run lint` checks both and is what CI and a full `jig verify` run
  (a narrowed `jig verify --changed` runs ESLint on changed js/ts only — no Prettier, no `.vue`).
- They cover `server/**/*.ts`, `web/**/*.{ts,vue,css}` and the root `*.{ts,js}`; `.ai/`, `docs/` and
  `dist/` are not ours to format.

## Rationale

The maintainer, task `design-system`, 2026-10-18: one style in every file, without review
comments about it. Object types a line per member and the indented `<script>`: the maintainer,
task `review-fixes`, 2026-10-18: a `defineProps` of four members on one line was "важко читати"
(hard to read). Rejected: a line per member in TypeScript even for one member — a one-member
cast spread over six lines reads worse; a rule for `defineProps` alone — ESLint has none without a
rule of our own.
