---
id: adr-20261029-close-a-ready-task-from-the-board
type: adr
status: accepted
date: 2026-10-29
domains: []
paths:
  - server/source/local.ts
  - server/jig/client.ts
  - web/components/TaskCard.vue
  - web/components/TaskRow.vue
  - server/http/app.ts
  - web/lib/refusal.ts
  - web/views/BoardView.vue
summary: The Ready card's close runs jig task set status consolidated, offered when Jig offers close or only its forge cache is behind; revision checked by a read, refusal reasons shown
reviewed_at: 2026-10-29
---
# A ready task is closed from the board with Jig's close command, offered beyond Jig's cached offer and checked against the board's revision by a read

## Context

The maintainer asked for one press that closes a task from its card in Ready (2026-10-29, task
`close-ready-task`). Jig ends a task three ways: `close` (`jig task set <id> status consolidated`,
done), `abandon` and `archive`. Ready means the work shipped and waits for its merge, so the ending
meant is `close`. Jig offers `close` in `task list --json` only when the knowledge decision is
recorded and its forge cache says the pull request merged — and the cache is written only by
`jig housekeeping`. In the project that asked (fapost-saas) all six ready tasks had merged, and Jig
offered none of them: housekeeping had never written the cache there. The command itself asks the
forge as it runs and refuses an unmerged pull request (since Jig 0.17.0, below Jig UI's minimum);
Jig's contract says a cache behind the forge "can only withhold a close the command would allow".
`jig task set` takes no `--revision` and prints no JSON (Jig 0.38.1).

## Decision

- The card offers the close (`closable`) when the task is `ready` and Jig offers `close`, or when the
  knowledge decision is recorded and the pull request is not known to be closed unmerged (cache
  state `null`, `open` or `merged`). A task without the knowledge decision has no button.
- The adapter runs it only for a task that is live and `closable` in the read it showed; anything else
  is `not-found`, Jig not run.
- JigClient reads the clone's revision (`queue list --json`) and refuses `stale-revision` when it is
  not the one the board was read at, then runs `jig task set <id> status consolidated`. Jig's refusal
  is its `jig: error:` lines, paths cut out, carried as `reasons` and sent as the API error's
  `message`; the page shows it.
- The page asks before it closes: ✕, then **Close task** in a question on the card.

## Alternatives

- Offer only what Jig offers — the button would be missing exactly where it was asked for, until
  someone runs housekeeping. Revisit when Jig's read refreshes the cache or offers `close` from the
  forge.
- Run `jig housekeeping` from the page first — it purges, flags and writes far more than the close,
  and takes a lock; a press on one card should not run the sweep.
- Abandon or archive instead — they say the work was dropped; a merged task is done.
- No revision check — every other write from the page carries one
  (adr-20261022-writes-carry-the-revision-of-their-read).

## Consequences

- The check is a read and then a write, not one claim: a write by an agent in between is not seen.
  The window is the time `task set` takes to start; closing a task is final, but Jig still checks
  the merge and the knowledge decision itself. When Jig's `task set` takes `--revision`, pass it.
- A close of a task whose pull request is still open is shown and refused by Jig, with its reason.
- Closing cannot be undone from the board.
