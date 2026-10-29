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
  - web/components/EpicMenu.vue
  - web/lib/epics.ts
summary: A project's specs from jig spec list, shown as the Specs view with open epics in Jig's queue order and a menu to move and prioritise them; read with the board, no ref or path on the page
reviewed_at: 2026-10-28
---
# Specs and epics

## What

A connected project's specs as Jig's `jig spec list --json` reports them (`readSpecs` in
`server/jig/client.ts`), served by `GET /api/projects/:id/specs` from `ProjectSource.specs(id)`, and
shown as the third view of the project's page, Specs (`web/components/SpecCard.vue`): each spec
with its progress, fog, epic (branch, open or finished, read as of the last fetch, branch missing)
and release level; phases folding away, a finished one folded; items done, open or fog, an item
naming a live task linking to its details (`web/lib/specs.ts` shapes an item's words). The specs
with an open epic come first, in the order of Jig's queue, and an epic's ⋯ menu (`EpicMenu.vue`)
moves it and sets its priority (`POST /api/projects/:id/queue/epic/move`, `/queue/epic/priority`).

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
- **The queue orders the epics, not Jig UI.** Jig's queue holds an epic (`epic:<spec-id>`) on its
  top level beside the tasks of no epic, on one scale of positions. The adapter puts the queued
  epics first by position, then the open epics not queued, then the specs with none, each in Jig's
  order (`ShownSpec.queue`); `ProjectSpecs` carries the revision of its read, which a write sends.
- **Up and Down move past the next epic, To top and To bottom take the whole queue.** Up is
  `--before` the epic above, Down `--after` the one below (`web/lib/epics.ts`); an epic not queued
  that goes up joins the queued ones at their end. To top and To bottom are Jig's `--top` and
  `--bottom`, so they move the epic past the tasks of no epic as well — the place `jig queue next`
  gives its tasks.
- **Only an open epic.** A write naming a spec without one is `not-found` before Jig runs; Jig
  refuses a spec that declares no epic as `not-found` too.
- **Editing a roadmap is not here.** Adding, moving or filing its items needs a Jig command with a
  revision; it is a fog item in spec `jig-ui`.
- **Not shown — not in Jig's contract:** which spec a task on the board belongs to (Jig's task
  list carries no spec link).

## Decisions and rejected alternatives

Task `specs-and-epics` (2026-10-18).

- A third view of the project's page, Board / List / Specs, remembered like the others —
  chosen by the maintainer over a strip of specs above the board (takes the board's height) and a
  separate address (one more hop).
- Reading specs on demand, only when the view opens — rejected: it breaks "served from the last
  read" and runs Jig per fetch.

Task `epic-order` (2026-10-28), decided by the maintainer:

- The ⋯ menu only, no drag: a spec's card is tall, with its phases open.
- To top is the top of the whole queue (`--top`), not the place before the first epic: putting
  an epic first is putting its tasks ahead of all other work. Rejected: a view of the whole top
  level, epics and tasks mixed — bigger, and the board orders the tasks already.
