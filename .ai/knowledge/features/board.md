---
id: feature-board
type: feature
status: active
domains: []
paths:
  - "server/board/**"
  - web/views/BoardView.vue
  - "web/components/Board*.vue"
  - web/components/NewTaskForm.vue
  - web/lib/conflict.ts
  - web/components/FinishedList.vue
  - web/lib/finished.ts
summary: Board columns from Jig's task state, first rule wins, shown Needs you first; Board and List views; why Needs you is read from state, not attention
reviewed_at: 2026-10-25
---
# Board

## What

A connected project's live tasks in five columns, shown in the order of `COLUMNS` — Needs you,
In progress, Ready, Backlog, Paused — worked out from Jig's task list on every read by
`server/board/columns.ts` (`columnOf`, first rule that fits wins: Paused, Backlog, Needs you,
Ready, In progress) and served by `GET /api/projects/:id/board`. Cards are light: id, class, priority, goal,
and what the task waits for (gate, autopilot run, pull request — `web/lib/waits.ts`). Finished
tasks are not on the board: a toggle above it with their count opens the list of those Jig still
keeps (`web/components/FinishedList.vue`, its words from `web/lib/finished.ts`).

`web/views/BoardView.vue` reads the board and shows it two ways, switched by the person and
remembered by the browser (`localStorage` `jig-ui.board-view`): Board (`BoardColumns`), the
columns side by side, where a click expands a card into its details; List (`BoardList`), the
columns as folding groups of one-line rows, a selected row's details in a pane on the right. The
two take the columns and the selected task as props and emit the choice; the view holds it. Both read the details on demand (feature-task-details).

## Why

A person running agents in several projects wants to see where each task stands without reading
`jig task list`. The columns answer one question each: is it set aside, not begun, waiting for me,
done, or moving.

## Constraints

- Columns are derived and never stored (adr-20261014-board-columns-are-derived-from-jig-state);
  ProjectSource hands typed tasks and computes no column (convention-project-source).
- "Needs you" is read from the task's own state — a gate waiting or changed, an autopilot run
  stopped — so a task's column does not depend on the clone's `agent.git` or on housekeeping.
- Order inside a column is Jig's queue (`jig queue list`): queued tasks first, the top level
  before epics' levels, by position; then the unqueued in Jig's list order. The queue starts
  empty, so a first drag queues one card only.
- A person changes the order by dragging a card within its column, or with the card's "⋯" menu
  (To top, Up, Down, To bottom, priority P0–P5 or none). A drop is offered only where one
  `jig queue move` puts it (adr-20261022-native-drag-and-drop-with-a-card-menu). The card stays
  where Jig says, marked "sending to Jig…", until the board is read again; a stale write is said
  in one line above the board (adr-20261022-writes-carry-the-revision-of-their-read).
- A drop on Paused, or "Request pause" in the menu, asks Jig to pause the task at its next stage
  boundary (`jig queue request … pause`); it is offered only where Jig offers the `request-pause`
  action. The card stays in its column with "Pause requested <age>" and a cancel
  (`jig queue cancel`) until Jig pauses it — the drop as a request of
  adr-20261014-board-columns-are-derived-from-jig-state. The age moves on with a clock of the
  page (`web/lib/clock.ts`), once a minute, not with reads: an idle project is not read again.
  A drop on any other column does nothing.
- A paused card names `jig task resume <id>`; the page does not resume a task.
- A change Jig refuses as `stale-revision` shows the conflict: the page compares the board the
  change was made on with the read the change itself started (`web/lib/conflict.ts`), marks each
  card that is new, in another column, moved within its own, or shows other facts — "Changed while
  you acted" — and says in one line above the board what became of the person's card and how many
  others changed or left. The marks live as long as that line: dismiss, or the next change, clears
  both. Jig's revision rises with every write in the clone, so "nothing on the board changed" is a
  common answer while agents work.
- "New task" above the board files a task with an id and a one-line goal (`jig task new <id>
  --goal <goal>`, `POST /api/projects/:id/tasks`); it shows in Backlog once Jig wrote it. No
  revision: a new id overwrites nothing (adr-20261022-filing-a-task-carries-no-revision). An id
  Jig has — a finished task's too, which only the list of finished tasks shows — is refused with a line saying
  so; the button waits while a request is on its way, so a double click files once. Class,
  domains and a longer description stay with the terminal or the agent that starts the task.
- The order of the columns is not the order of the rules: what waits for the person comes first
  (maintainer, task `design-system`, 2026-10-18).
- The finished list holds what `jig task list --all` returns, read with the live tasks in one Jig
  run: a closed task until housekeeping sees its branch merged — a task of an epic, the epic on
  the default branch — and moves its workspace to trash (one with no branch, or none seen merged,
  stays), an abandoned one for `housekeeping.abandoned_ttl` (14 days by default). Each row is the
  id, closed or abandoned, the goal, the pull request and the day Jig last changed the task, the
  latest first; a finished task has no details and no actions. The list starts hidden on every
  visit, and closes when the last finished task leaves; nothing remembers it.

## Decisions and rejected alternatives

- Column set and rules: task `project-board` (2026-10-17).
- "Needs you" from Jig's attention items — rejected: a ready task would sit there whenever the
  person's git level is `none` (the `git-step` item), and pull request items move with
  housekeeping, not with the task. Attention stays on the workspace page.
- vue-router for the board's address — rejected for two screens in `project-board`; adopted
  with the design system when the page reached four (adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas). The address stays
  `#/projects/<id>`.
- Resuming from the page by a drop out of Paused (the roadmap's wish) — not built: Jig 0.31.0's
  `jig task resume` takes no `--revision` and no `--json`, refuses unless the checkout is on the
  task's branch (never so for a task in its own worktree), and applies a stash into the person's
  checkout. Raised as fapost-lab/jig#295; the maintainer chose to show the command meanwhile
  (task `pause-request`, 2026-10-22).
- Conflict display (task `conflict-display`, 2026-10-25, the maintainer's choice of marking the
  changes over a list of them or the one line as before). A move within a column is the cards
  outside the longest run that kept its order — of equal runs, the one keeping most cards whose
  queue position did not change — not a changed index, which marks a whole column after one
  insert, nor a changed position, which Jig respaces for a whole level when there is no room.
  Marks that fade after a minute — rejected for a timer that tells nothing the line does not.
- Finished tasks (task `finished-list`, 2026-10-25). A Finished column — the maintainer's first
  wish, hidden by default — rejected for a toggle on the count that opens a list (the maintainer's
  choice): Jig forgets a closed task once housekeeping sees it merged (an epic's, once the epic
  lands), so a column would hold the latest closed tasks and the abandoned ones, which is no
  history; the merged pull requests are. Reading
  them on demand, through a route of their own — rejected for `--all` in the board's read: no new
  route and no Jig run of its own. Each task Jig keeps adds about 0.06 s to the task list (0.26 s
  live only, 0.45 s with three finished, measured 2026-10-25), hidden while `jig status`, read
  beside it, takes longer (0.84 s): from about ten kept tasks — an epic's, kept until it lands — the
  board waits on the list, and the finished ones are worth a read of their own, on demand. A Collapsible
  for the list — rejected: the header already sits in the New task form's Collapsible, and a
  trigger binds to the nearest one.
- Board and List as two addresses — rejected: the switch is a way of looking at one board.
- The view remembered in Jig UI's settings file — rejected: a preference of one browser need
  not survive it.
