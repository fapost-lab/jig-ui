---
id: adr-20261022-writes-carry-the-revision-of-their-read
type: adr
status: accepted
date: 2026-10-22
domains: []
paths:
  - "server/source/**"
  - server/http/app.ts
  - web/views/BoardView.vue
summary: A write from the page is one Jig command through ProjectSource with the board's lowest read revision, live ids only, answered after a re-read; 409 on stale-revision, never retried
reviewed_at: 2026-10-22
---
# Writes from the page are Jig commands carrying the revision of the read they were based on

## Context

Phase 2 lets a person change a project from the page, starting with the order and priority of
its tasks (task `queue-reorder`). Agents write to the same project while the page is open, and
Jig 0.31.0 refuses a write whose `--revision` is older than the clone's last write
(`stale-revision`). Decided with the maintainer at the design gate, 2026-10-22.

## Decision

- A write is one Jig command run by JigClient (`jig queue move`, `jig queue set --priority`)
  through a ProjectSource method (`move`, `prioritise`); Jig UI writes no project file.
- The page sends the revision of the board it showed. The board's revision is the **lowest** of
  the revisions of the reads it is made of (status, task list, queue): a write after any of them
  makes the page's write stale. Specs are read through their own route and do not count.
- The adapter runs Jig only for task ids that are live in the last read it showed — the task
  and a move's anchor; anything else is refused `not-found` without running Jig, so nothing but
  ids Jig itself returned reaches Jig's arguments.
- After a write the adapter re-reads the project before it answers, so the page's next read
  already shows it; the change signal goes out the usual way.
- HTTP: `200 { written: true }`, `409` for `stale-revision`, `404` for `not-connected` and
  `not-found`, `422` for any other refusal; a project that is not `ready` answers `200` with its
  state, as reads do.
- The page never moves a card ahead of Jig: it shows "moving…" and reads the board again,
  whatever came of the write. A stale refusal is not retried: the person sees the board again
  and decides again.

## Alternatives

- Retry a stale write automatically — it applies a choice to a board the person did not see.
  Revisit only if use shows `stale-revision` is common while the queue itself did not change.
- The revision of the task list alone — a queue write after the list read would not be caught.
- Moving the card at once and rolling back on refusal — a second truth for a moment, against
  adr-20261014-board-columns-are-derived-from-jig-state.

## Consequences

- One drag is one `jig queue move`; the page can never write over an agent's change unseen.
- With agents running, a write is refused whenever anything was written in the project since
  the board was read — the revision is one per clone. Untested: how often that annoys people.
