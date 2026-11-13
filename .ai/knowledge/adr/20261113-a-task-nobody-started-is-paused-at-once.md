---
id: adr-20261113-a-task-nobody-started-is-paused-at-once
type: adr
status: accepted
date: 2026-11-13
domains: []
paths:
  - server/jig/client.ts
  - server/source/local.ts
  - server/http/app.ts
  - web/lib/drop.ts
  - web/components/QueueMenu.vue
  - web/views/BoardView.vue
  - web/lib/refusal.ts
summary: A drop on Paused or Pause in the menu runs jig task pause at once for a task nobody started (Jig 0.45.0); a started task keeps the request
reviewed_at: 2026-11-13
---
# A task nobody started is paused at once by a drop on Paused or Pause in its menu, through `jig task pause`

## Context

A drop on Paused, or **Request pause** in the ⋯ menu, asks Jig to pause the task at its next stage boundary
(`jig queue request … pause`, adr-20261022-native-drag-and-drop-with-a-card-menu), offered only where Jig offers the
`request-pause` action. Jig 0.45.0 (task `pause-not-started-directly` in fapost-lab/jig) withholds `request-pause` from
a task nobody started, because no stage of it would ever take the request, and offers `pause` instead, with
`jig task pause <id> --revision <n> --json`. So such a card could not go to Paused at all, and its menu item was
disabled. Seen in a scratch repository on Jig 0.45.0:
- not started: `pause` offered, `request-pause` withheld;
- started: both offered;
- started with a pause asked already: `pause` offered, `request-pause` withheld;
- paused: both withheld.

`jig task pause` takes a pending request out with it. Spec `jig-ui`, roadmap item "pause a task nobody started";
task `pause-not-started`.

## Decision

- A card is `pausable` when the project's Jig takes `task pause --revision` (`PAUSE_JIG_VERSION`, 0.45.0), the task
  has no branch, Jig offers `pause` and withholds `request-pause` (`card()` in `server/source/local.ts`).
- A drop of a `pausable` card on Paused, or **Pause** in its menu, runs `jig task pause <id> --revision <n> --json` at
  once (`POST /api/projects/:id/tasks/pause`, `ProjectSource.pause`, `pauseTask` in `server/jig/client.ts`), with
  the revision of the board it was made on (adr-20261022-writes-carry-the-revision-of-their-read). The adapter runs it
  only for a task its last read shows `pausable`; anything else is `not-found` without Jig. The card moves when the
  board is read again.
- **Pause** sits beside **Cancel pause request** when a request nobody will take is there, written before Jig 0.45.0
  or in a terminal: Jig's pause takes it out, so the menu does what the drop does.
- **Only a task nobody started.** Jig 0.45.0 also offers `pause` for a started task whose pause was asked already. That
  card keeps **Cancel pause request** and takes no drop on Paused, as before: an agent may be in one of its stages, and
  the request already says what the person wants. This narrows the roadmap item's "which of the two a drop does
  comes from the task's actions" by the task's branch, as `closable` narrows Jig's `close` on the staging flow.
- Refusals by code: `already-paused` reads "Somebody paused <id> first." (`web/lib/refusal.ts`); `stale-revision` is
  the board's conflict, as for every write.
- This amends adr-20261022-native-drag-and-drop-with-a-card-menu ("on Paused it asks a pause"),
  adr-20261014-board-columns-are-derived-from-jig-state ("a drop on another column is a request") and
  adr-20261026-a-drop-out-of-paused-resumes-at-once ("Only a pause is a request") for a task nobody started.

## Alternatives

- **Decide from the actions alone**, as the roadmap item words it: a started task with a pending request would then be
  paused at once by a drop, under the agent that may be working on it.
- **A Pause now item on every card.** The roadmap asks for the task nobody started, where the request is no use; a
  started task's pause belongs at its stage boundary.
- **Narrow `pausable` to a task with no request.** A request on a task nobody started is never taken, so the card
  would keep a request no stage honours and no way to pause it from the page.

## Consequences

- Below Jig 0.45.0 the board is as before: no card is `pausable`, and a task nobody started still takes the request
  that Jig offered it then.
- The page copies one more condition of its own on top of Jig's actions (no branch). A Jig that starts withholding
  `pause` from a started task with a request makes it redundant, not wrong.
- Undo: revert the merge; nothing is stored.
