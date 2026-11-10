---
id: adr-20261110-housekeeping-runs-from-the-project-card
type: adr
status: accepted
date: 2026-11-10
domains: []
paths:
  - server/jig/client.ts
  - server/source/local.ts
  - server/http/app.ts
  - web/components/ProjectCard.vue
  - web/views/WorkspaceView.vue
summary: Housekeeping on a project's card runs jig housekeeping at once — no dry run, no revision, through writing() — and keeps Jig's report, paths cut, on the card until Dismiss; the close still runs no sweep
reviewed_at: 2026-11-10
---
# Housekeeping runs from a project's card, at once, with no revision, and its report stays on the card

## Context

A project's card said "Pull request facts may be out of date: run `jig housekeeping` in the project", sending the
person to a terminal. The maintainer asked for a button beside **Board** (task `housekeeping-from-card`, from a
screenshot of the card, 2026-11-10; approved at the design gate as shown). `jig housekeeping` is built to run unattended
— from a terminal, from Jig's session hook once a `housekeeping.cadence` (1 day), and from a scheduler, with the same
effects: merged tasks' workspaces to `.ai/runtime/trash/<date>/` for `housekeeping.trash_ttl` (7 days), abandoned ones
to the archive, finished tasks out of the queue, the forge cache written, merged branches deleted locally and, at
`agent.git` push or above unless `git.delete_merged_branches: false`, on origin. Its fetch runs with
`GIT_TERMINAL_PROMPT=0`, a failed fetch only marks the remote stale, and a lock per clone makes a second run print
`another housekeeping run holds this clone; skipping`. It prints a grouped text report and no JSON.
adr-20261029-close-a-ready-task-from-the-board rejected running it *as part of a close*: "a press on one card should not
run the sweep".

## Decision

- **Housekeeping** on a readable project's card, left of **Board**, runs `jig housekeeping` in the project: no dry run
  first and no confirmation. It is hidden while the project's upgrade runs, as the ⋯ menu is; while it runs it reads
  *Housekeeping…*, disabled, over a line saying a dialog for git credentials may wait for the person.
- `POST /api/projects/:id/housekeeping` answers once Jig ends and the project was read again: `200 { report }`, Jig's
  report a line each as it printed it, every path cut — absolute ones by `withoutPaths`, the project's `.ai/…` ones too
  (`housekeeping` in `server/jig/client.ts`, 2 minutes). Jig's warnings on stderr lead it, since the report points up at
  them; exit 3 — Jig finished and flags a task to consolidate, a wrong base or an archive refused — is a report too,
  not a failure, as a hook reads it. Refusals: `422 failed` with Jig's `jig: error:` lines as
  reasons, `422 timeout` past the limit, `409 upgrading`, `404 not-connected`, a project not ready answered with its
  state. `ProjectSource.housekeeping(id)` runs it through the adapter's `writing()`, so an upgrade waits for it.
- **No revision and no live id**, as filing a task (adr-20261022-filing-a-task-carries-no-revision): a write carries the
  revision of its read because it acts on what the person saw (adr-20261022-writes-carry-the-revision-of-their-read);
  housekeeping acts on the clone as it is when it runs, under Jig's own lock, as the hook does without looking first.
- The report, or the refusal with Jig's reasons, stays on the card with **Dismiss**; it is the view's state
  (`WorkspaceView`), so a reload forgets it, and a press while a run still goes answers Jig's `skipping` line.
- The card's stale note says "Pull request facts may be out of date until Housekeeping runs."
- adr-20261029-close-a-ready-task-from-the-board stands: Close still runs no sweep.

## Alternatives

- **A dry run, then Run**, as an upgrade's plan — a second click on every press for a sweep the hook runs unasked; what
  it removes is merged or in the trash for 7 days, and the report says what it did.
- **A background run on the read** (`202`, its state on the workspace read, as an upgrade) — survives a reload and shows
  in every tab, for a run state in the adapter, the read and a signal; a run of seconds needs an answer, as Check merge
  gives.
- **Only with the stale note** — the sweep also clears finished workspaces and flags what waits to be closed, any day.
- **Only reading the project again** — the person would not see what was removed.
- **The report with its paths, the RULES path invariant amended** — the trash's path is nothing a person acts on from
  the page.
- **Housekeeping for every project at once** — not asked.

## Consequences

- Where a fetch or a push asks a credential helper with a dialog of its own (the macOS keychain), each press shows it,
  and the run waits for the answer up to its 2 minutes; past them it is stopped, as every Jig run Jig UI started is.
- Jig's report is text and its wording is Jig's: the page shows it, never reads it, so a change of wording needs no
  change here.
- Class T3, not T4: what a run removes is merged or recoverable, by the project's own settings, and the same run happens
  unasked at every agent session; the page only chooses the moment.
- Undo: revert the merge; nothing is stored. What a run did is undone as Jig says (`.ai/runtime/trash/`,
  `jig task unarchive`).
