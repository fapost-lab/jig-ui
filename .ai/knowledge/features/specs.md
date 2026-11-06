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
  - web/components/SpecItemMenu.vue
  - web/components/FileItemDialog.vue
  - server/jig/fixtures/spec-list-items.json
  - server/jig/fixtures/spec-list-waiting.json
summary: "A project's specs from jig spec list as the Specs view: open epics in Jig's queue order with a menu to move and prioritise them, and from Jig 0.40.0 the roadmap edited on the card (add, move, file) on the spec's write branch; read with the board, no ref or path on the page"
reviewed_at: 2026-11-06
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
A spec with work for the person's agent offers the request to copy (`agentRequests` in
`web/lib/specs.ts`): to file the tasks of the first phase with an item that has none, and to continue
the spec while it has fog.

From Jig 0.40.0 (`editable`) a roadmap is edited on its card: **Add item** at the end of each
numbered phase, an item's ⋯ menu (`SpecItemMenu.vue`) moving it Up, Down or To Phase N, and
**File task…** (`FileItemDialog.vue`) filing an item's task and naming it on the item — `POST
/api/projects/:id/specs/items/add`, `/move`, `/file`, Jig's `jig spec item add|move|file`
(adr-20261106-editing-a-roadmap-from-the-page). While edits wait on the spec's write branch, the
card shows the roadmap there (`shownRoadmap`), a line saying where they wait, and a "waiting" mark
on each item they added, moved to another phase or filed (`waitingItems`).

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
  branch (`fetched`) goes on, not the ref name. Waiting edits carry branch names only (`branch`,
  `base`), as the epic does, and their pull request's address, linked only when it is `https://`;
  not the commit.
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
- **Edits go through Jig's handles, on the roadmap the next edit changes.** An item is named by
  Jig's `id`, which holds through a move or a filing, and only an id of the roadmap the page shows —
  the waiting one when there is one — reaches Jig. Up is `--after` the item two above, or `--top`
  for the second, since Jig has no `--before`; another phase is `--phase <n>`, its bottom.
- **Rewording, checking or removing an item is not here** — Jig has no command for them. Filing a
  phase's tasks and continuing a spec go to the person's agent as a request to copy, in the words of
  Jig's `jig-idea` skill; the page runs no agent.
- **"Phase N" names the phase.** Items before the first phase heading get no request to file and no
  Add item: neither could name them (Jig adds only to `--phase <n>`).
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

Task `spec-agent-request` (2026-10-29), decided by the maintainer:

- The requests stand in the card's head, one line each to copy, as an upgrade's request does.
  Rejected: an "Ask agent…" button that opens them — one click more for a line or two.

Task `roadmap-from-page` (2026-11-06), decided by the maintainer at the design gate: the branch's
roadmap shown with waiting marks, the ⋯ menu only, the two-step filing and no `jig writes ship`
(adr-20261106-editing-a-roadmap-from-the-page).
