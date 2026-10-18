---
id: adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas
type: adr
status: accepted
date: 2026-10-18
domains: []
paths:
  - "web/**"
  - components.json
  - package.json
  - tsconfig.json
  - tsconfig.build.json
  - vite.config.ts
summary: The page's components are shadcn-vue on Tailwind v4 as devDependencies, routed by vue-router in hash mode, with an in-app canvas; dark by default; browser preferences in localStorage
reviewed_at: 2026-10-18
---
# The page is built from shadcn-vue components, routed by vue-router, with a canvas of its own

## Context

The page grew to three screens of hand-written markup with no shared components, no styling
system and no place to see a component in every state; specs and epics would add more. The
maintainer wanted reusable components, a chosen styling library and a canvas of every component
and variant. Spec `jig-ui` (stack.md, "Page: components and styling") and task `design-system`,
decided with the maintainer on 2026-10-18; the look chosen from four prototypes on real data
(branch `prototype/design-system-look`).

## Decision

- **Components:** shadcn-vue — Reka UI primitives styled with Tailwind CSS v4 (through
  `@tailwindcss/vite`, no config file), variants through class-variance-authority, classes merged
  by the `cn` package, icons from `@lucide/vue`. The CLI copies each component's source into
  `web/components/ui/`; the code is ours.
- **Layers:** `web/views/` → `web/components/` → `web/components/ui/`, `web/lib/` from any of
  them; only views and `App.vue` fetch (convention-vue).
- **Weight:** every page dependency is a devDependency. The package ships the page built, so what
  `npx @fapost/jig-ui` installs does not grow; the font is bundled
  (`@fontsource-variable/jetbrains-mono`) because the page runs on 127.0.0.1, possibly offline.
- **Look:** style `reka-lyra`, base colour `neutral`, JetBrains Mono, small text; dark by default
  with a switch, the choice remembered by the browser (`localStorage` `jig-ui.theme`). Colours
  with a meaning are defined once, in `web/lib/tones.ts`.
- **Routing:** vue-router in hash mode; `#/projects/<id>` and `#/projects/<id>/tasks/<task>` kept
  as they were. This replaces the rejection of vue-router in feature-board, made for two screens.
- **Canvas:** `#/canvas`, one `CanvasView.vue` showing every component in every variant and state,
  a light and a dark panel side by side. It ships in the package as a lazily loaded chunk, linked
  from nowhere, so the maintainer sees it in a `next` release.
- **Browser preferences** (the theme, Board or List) live in the browser's `localStorage`, never
  in Jig UI's config directory: they need not survive the browser.

## Alternatives

- Reka UI with hand-written CSS — three dependencies fewer, every variant and token by hand.
- A styled library (PrimeVue, Naive UI, Vuetify) — someone else's look; the canvas would show
  their components, not ours.
- Storybook or Histoire — a second build and dozens of dependencies for what the app renders
  itself. A dev-only canvas — invisible in a released `next` build. A `.canvas.vue` beside each
  component — a file per component instead of one list.
- The address read by hand in `App.vue` — fine for two screens, not for four and more.
- Following the system theme with no switch — the approved design; replaced by the maintainer
  after seeing it: dark by default, with a switch.
- A web font from a CDN — the page must work offline.

## Consequences

- shadcn-vue's components are upgraded by us: re-run the CLI and review the diff.
- The CLI reads the `@` alias only from the root `tsconfig.json`, which checks `server/`; the
  server build clears `paths` in `tsconfig.build.json` so `@/` cannot resolve there.
- `components.json` carries no `font` key: with one, every `shadcn-vue add` re-inserts a Google
  Fonts import.
- A light choice shows dark for a moment while the page loads (`<html class="dark">` in
  `index.html`), the price of dark never flashing white.
- Drag and drop is not covered by Reka UI; Phase 2's drag item chooses its library.
