---
id: feature-specs
type: feature
status: active
domains: []
paths:
  - web/components/SpecCard.vue
  - web/components/SpecItemRow.vue
  - web/components/ProgressBar.vue
  - web/lib/specs.ts
  - server/jig/fixtures/spec-list.json
summary: A project's specs from jig spec list, shown as the Specs view; read with the board, Jig's numbers, no ref or path on the page
reviewed_at: 2026-10-18
---
# Specs and epics

## What

A connected project's specs as Jig's `jig spec list --json` reports them (`readSpecs` in
`server/jig/client.ts`), served by `GET /api/projects/:id/specs` from `ProjectSource.specs(id)`, and
shown as the third view of the project's page, Specs (`web/components/SpecCard.vue`): each spec
with its progress, fog, epic (branch, open or finished, read as of the last fetch, branch missing)
and release level; phases folding away, a finished one folded; items done, open or fog, an item
naming a live task linking to its details (`web/lib/specs.ts` shapes an item's words).

## Why

A spec is the plan above the tasks: the board says where each task stands, the specs say how far
the plan behind them is. Jig already computes the progress and reads an open epic's roadmap from
the epic branch, so the page shows Jig's numbers and computes none.

## Constraints

- **Read with the board.** The spec list is the fourth Jig run of a project's read (~0.1 s), so
  specs follow live updates and a page fetch runs no Jig (feature-live-updates). `.ai/specs/` is
  under the watched `.ai/`; an epic branch that moves is a git ref outside it, caught by the
  minute's rescan.
- **Jig's numbers, not ours.** Progress counts fog items in the total, as Jig does; an epic's
  roadmap comes from the ref Jig chose. Jig UI never reads a roadmap file
  (adr-20261014-jig-ui-is-an-optional-layer-over-jig).
- **No ref and no path reach the page.** Only whether the epic's roadmap was read from a remote
  branch (`fetched`) goes on, not the ref name.
- **Read-only.** Planning from the page is Phase 3 fog in spec `jig-ui`.
- **Not shown — not in Jig's contract:** which spec a task on the board belongs to (Jig's task
  list carries no spec link).

## Decisions and rejected alternatives

Task `specs-and-epics` (2026-10-18).

- A third view of the project's page, Board / List / Specs, remembered like the others —
  chosen by the maintainer over a strip of specs above the board (takes the board's height) and a
  separate address (one more hop).
- Reading specs on demand, only when the view opens — rejected: it breaks "served from the last
  read" and runs Jig per fetch.
