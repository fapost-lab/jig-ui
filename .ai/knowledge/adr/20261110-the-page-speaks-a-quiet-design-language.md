---
id: adr-20261110-the-page-speaks-a-quiet-design-language
type: adr
status: accepted
date: 2026-11-10
domains: []
paths:
  - "web/**"
summary: The page's text is the system's sans with mono only for ids, commands, code, branches, versions, keys and paths, 14/13/12px, sentence-case headings, the theme's radius; Specs is a roadmap board, one spec per tab, Up and Down within a lane (amends the Look of adr-20261018 and the Moves of adr-20261106)
reviewed_at: 2026-11-10
---
# The page speaks a quiet design language: the system's sans, mono only for what is copied or compared

## Context

A colleague found the Specs view and the board's List heavy to read ("сильно грузит мозг, нужно
чтото легче и удобнее", 2026-11-10). The page followed adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas's
**Look**: style `reka-lyra`, JetBrains Mono everywhere, small text — every glyph the same width,
12px body, uppercase tracked headings, `[x]` and `[2]` marks, square corners. Three directions were
prototyped on real data (branch `prototype/specs-redesign`); the maintainer chose variant C, the
roadmap as a board, and asked for the whole page in its style (task `quiet-design`, approved at the
design gate 2026-11-10).

## Decision

This amends the **Look** bullet of adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas,
and the **Moves** bullet of adr-20261106-editing-a-roadmap-from-the-page for Up and Down; the rest
of both ADRs stands.

- **Text** is set in the system's own sans (`ui-sans-serif, system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif`, `--font-sans` in `web/style.css`): nothing bundled, so it works offline.
  **Mono** (the bundled JetBrains Mono) is kept for what a person copies or compares character by
  character: task and spec ids, commands, code runs, branch names, versions, settings keys, paths,
  and the `jig-ui://` wordmark.
- **Sizes**: 14px body, 13px secondary text and controls, 12px meta lines, badges and mono ids;
  headings 15–20px in sentence case, weight 600, no tracking.
- **Marks**: a plain muted count, a coloured dot for where an item stands, ✓ for a finished phase,
  and a dashed "nothing here" box for an empty column or lane. Selection is `bg-muted`, not
  inversion.
- **Shape**: the theme's radius — `rounded-md` controls, `rounded-lg` cards. The primitives in
  `web/components/ui/` are edited in place to it; `components.json` keeps `reka-lyra`, so a
  component added later from the CLI arrives square and in 12px and gets the same two edits.
- **Colour** is unchanged: a colour with a meaning still comes from `web/lib/tones.ts` only; the dots
  reuse `columnAccent` and `doneFill`, and other dots are greys that mean nothing more.
- Dark by default with a switch, as before.
- **The Specs view is a roadmap board**: one spec at a time — a tab for each when there are two or
  more, the choice in the address (`?spec=<id>`) —, a step for each phase, and the chosen phase's
  items in three lanes, To file, In work and Done (`laneOf` in `web/lib/specs.ts`). **Up and Down move
  an item among its lane's cards**, the board's filter rule of anchoring on the nearest card shown:
  Up is `--after` the item standing before the lane's previous card, or `--top`; Down is `--after`
  the lane's next card; the other lanes' items keep their places. Still one `jig spec item move`, the
  ⋯ menu only, no drag.

## Alternatives

- **Variants A (a quiet outline) and B (a list with details)** — lost to C by eye on the prototype.
- **A bundled face (Inter Variable)** — the same look on every system for ~100–300 KB more in
  `dist/web`; the system face costs nothing and is what the prototype showed.
- **Another shadcn-vue style, re-added through the CLI** (`--overwrite`) — it replaces our edits to
  the primitives, needs the registry, and brings a diff of every file; two edits in place do the same.
- **Keeping mono and only adding air** — the weight comes from every glyph having the same width.
- **Several specs stacked, each with its own steps and lanes** — a tall page again; tabs keep one
  plan in view.
- **Up and Down over the whole phase, as before** — on a board the item would seem not to move, or to
  jump past cards of its own lane.
- **Hiding an empty List group**, as the prototype did — Paused would lose its drop.

## Consequences

- A system without one of the listed faces shows the next; the page looks slightly different per OS.
- A component added from the CLI needs the radius and size edits before it matches; the canvas shows
  it if it does not.
- Undo: revert the merge commit; nothing is stored and no API changes. This ADR is then superseded.
