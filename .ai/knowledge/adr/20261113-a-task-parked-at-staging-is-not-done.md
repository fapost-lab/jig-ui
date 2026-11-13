---
id: adr-20261113-a-task-parked-at-staging-is-not-done
type: adr
status: accepted
date: 2026-11-13
domains:
  - web
  - server
paths:
  - server/source/local.ts
  - server/board/columns.ts
  - web/lib/waits.ts
  - web/components/QueueMenu.vue
  - server/jig/client.ts
  - web/lib/drop.ts
  - web/lib/refusal.ts
summary: On Jig's staging flow a parked task's card says why it waits, its close waits for housekeeping's merge into the base, and Take back for a fix is Jig's resume.
reviewed_at: 2026-11-13
---
# A task parked at a staging branch is shown as waiting there, closed only once its work is in the base, and taken back with Jig's resume

## Context

Jig 0.45.0's staging flow (`git.flow: staging`) ships a task's pull request into a staging branch. The task
lands there, waits *parked* while it is tested, and reaches the base through a second pull request,
the promotion, when a person says "prepare for prod". `jig task list --json` reports `staging` (`on`,
`behind`, `null`) and `parked` (`{reason, hint}` or `null`) on that flow only. Its `pull_request.url`
stays the one into staging (`pr_url`), while its `state` and `ci` come from Jig's forge cache for the
task's branch into its *base*: `null` until there is a promotion, then the promotion's.

Three of the board's rules did not fit:
- `waits()` showed a parked task as "Pull request opened" (its state `null`), or, with no pull request
  (CI landing), "No pull request yet" — never why it waits.
- The close's fallback (adr-20261029-close-a-ready-task-from-the-board) reads a `null` state as a cache
  that has not heard yet, so it offered ✕ on every parked task with a pull request.
- A resume was assumed to change only `paused` (adr-20261026-a-drop-out-of-paused-resumes-at-once).

Jig 0.45.0's `jig task set <id> status consolidated` then closes the task: it asks the forge whether
`pr_url` merged, and that is the pull request into staging (`_task_close_refusal` in task.sh). Jig's
`close` action is offered on its cache lookup against the base, so only for a task with no pull
request — one CI landed. Either way a parked task can be closed before its work reached the base
(fapost-lab/jig#509). Housekeeping does not make that mistake: a merge into staging is passed over,
and only a merge into the base flags `needs-consolidation`.

The maintainer asked for the UI to follow the new flow (2026-11-13; task `tasks-on-staging`, spec `jig-ui`).

## Decision

- **The card says why a parked task waits**, before its pull request's state (`web/lib/waits.ts`):
  - "Pull request into staging waits for review";
  - "Pull request into staging — yours to land", in the attention tone, for `hint: landing`;
  - "On staging, waits for prepare for prod" for `signal`.

  A task on staging that is not parked reads "Fix not on staging yet" (`behind`), or, `on`, its
  promotion's state and CI ("Promotion open, CI green") without a link — the url is the pull request
  into staging — and "On staging" before there is one.
  A parked task stays in Ready: the column rules are unchanged.
- **On the staging flow the close is narrower than Jig's offer.** When `staging` is there, a task is
  `closable` only when it is ready, its knowledge decision is recorded, it is not parked, and
  housekeeping flagged it `needs-consolidation`. Jig's `close` action and the fallback on the pull
  request are not read there. Off that flow adr-20261029-close-a-ready-task-from-the-board stands.
- **Take back for a fix** in a parked card's menu, or a drop on the column it lands in, runs the resume
  write the page already has (`jig task resume <id> --revision <n> --json`), offered where Jig offers
  `resume`. A parked task that is not paused resumes as `active` (Jig's `resume.parked`), so `resumesTo`
  is worked out on the task with `status: active`. A paused one only loses `paused`, as before: Jig
  parks it again. This amends the consequence of adr-20261026-a-drop-out-of-paused-resumes-at-once
  that a resume changes only `paused`, and its Decision's "a resume changes nothing else Jig
  reports".
- The drop that takes a parked task back is one more drop on another column that is not a request,
  beside the one out of Paused: this amends adr-20261014-board-columns-are-derived-from-jig-state ("a
  drop on another column is a request") and adr-20261022-native-drag-and-drop-with-a-card-menu ("any
  other drop on another column does nothing"). It is offered only on the column the resume puts the
  task in, as the one out of Paused is.
- `not-paused` reads "Somebody resumed <task> first.", which fits a pause and a parked task alike.

## Alternatives

- **Withhold the close only while `parked`.** That still offers it for a task whose promotion is open
  but not merged, and, under `git.staging_land: external`, for one with no pull request at all. Jig's
  close refuses neither.
- **Trust Jig's `close` offer, or its command, on the staging flow.** It is the defect above, reported
  as fapost-lab/jig#509.
- **A column of its own for parked tasks.** A parked task is a `ready` one with a reason, and a column
  only staging projects have would change the board's grid, and its five-column layout, for every project.
- **Land and Prepare for prod buttons.** Jig offers `land` only at `agent.git: merge`, and neither
  `task land` nor `task promote` answers as JSON or takes a revision. "Prepare for prod" is a person's
  word to their agent, or CI's.

## Consequences

- A task on the staging flow gets ✕ only after a housekeeping run that saw its work in the base. Until
  then the page offers no close, even where Jig would close it rightly. **Housekeeping** on the card
  runs it.
- The page now copies a fourth rule of Jig's: what a resume changes. A Jig that changes more on resume
  makes `resumesTo` wrong until `server/board/columns.ts` follows.
- A new `parked.reason` or `staging` value from Jig fails the read (`incompatible`) rather than showing a
  wrong note: the schemas name Jig's words.
- Untested on a forge: the `review` notes come from the contract and a fixture variant. `signal`,
  `behind` and the take-back were run against Jig 0.45.0 in a scratch repository with a local origin.
