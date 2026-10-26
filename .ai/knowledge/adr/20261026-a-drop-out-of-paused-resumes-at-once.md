---
id: adr-20261026-a-drop-out-of-paused-resumes-at-once
type: adr
status: accepted
date: 2026-10-26
domains: []
paths:
  - web/lib/drop.ts
  - server/board/columns.ts
  - web/components/QueueMenu.vue
reviewed_at: 2026-10-26
summary: A drop out of Paused, or Resume in the menu, runs jig task resume at once on the one column the task lands in; no request; Jig 0.35.0 or later
---
# A drop out of Paused resumes the task at once, onto the column it will be in

## Context

adr-20261014-board-columns-are-derived-from-jig-state makes a drop on another column a sticky
request: the card stays where Jig says, shows "requested" with its age and a cancel, and moves only
when Jig's state changes. That fits a pause, which Jig honours at the task's next stage boundary
(task `pause-request`). A resume is different: while a task is paused no agent works on it, so there
is no boundary to wait for — spec `jig-ui` decided on 2026-10-19 that resume is not a request (Jig's
`contract-queue` decision). Jig 0.35.0's `jig task resume <id> --revision <n> --json` made it a write
the page can send (fapost-lab/jig#295). Task `resume-from-page`; decided with the maintainer at the
design gate and after the architecture review, 2026-10-26.

## Decision

- A drop of a paused card onto another column, or **Resume** in its menu, runs `jig task resume`
  at once, with the revision of the board it was made on
  (adr-20261022-writes-carry-the-revision-of-their-read). It leaves no request behind.
- The drop is offered on one column only: the one the task will be in once resumed. The board names
  it on the card (`resumesTo`), worked out by the board's own `columnOf` on the task with `paused`
  false — a resume changes nothing else Jig reports. A paused task Jig UI cannot resume has none.
- It is offered only where Jig offers the `resume` action and the project's Jig takes
  `--revision` (0.35.0, `RESUME_JIG_VERSION`); elsewhere the card names `jig task resume <id>`.
- The card still moves only when Jig's state does: the page reads the board again after the
  write, as for every other change. Only a pause is a request.
- This amends adr-20261014-board-columns-are-derived-from-jig-state ("a drop on another column is a
  request") for a drop out of Paused; the rest of it stands.

## Alternatives

- A resume as a request, like the pause — a badge and a cancel for something Jig does at once.
- A drop on any other column — the card would land in a column other than the one it was dropped
  on; naming the column costs a field and one call of a rule the board already has.
- Resuming only pauses that kept no stash — needs a field Jig's task list does not have; a pause
  Jig UI asks for never stashes, and Jig refuses a stash pause in the wrong checkout
  (`wrong-checkout`).
- A confirmation before each resume — the page cannot say whether a stash will be applied, so it
  would ask a vague question every time for a rare case.

## Consequences

- A stash a person's own `jig task pause --stash` kept is applied in the project's main checkout
  when it is on the task's branch — what `jig task resume` does in a terminal there. When it does
  not apply, Jig leaves the task paused (`stash-conflict`) and the page says to resolve it there.
- What the terminal's resume prints about the pause — its days and the files changed meanwhile
  (`paused_days`, `overlap`) — is not shown: the page reads the board again, not the answer.
- The page copies a third rule of Jig's: a resume changes only `paused`. A Jig that changes more on
  resume makes `resumesTo` name the wrong column until `server/board/columns.ts` follows.
