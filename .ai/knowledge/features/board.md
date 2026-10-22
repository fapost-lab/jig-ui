---
id: feature-board
type: feature
status: active
domains: []
paths:
  - "server/board/**"
  - web/views/BoardView.vue
  - "web/components/Board*.vue"
summary: Board columns from Jig's task state, first rule wins, shown Needs you first; Board and List views; why Needs you is read from state, not attention
reviewed_at: 2026-10-22
---
# Board

## What

A connected project's live tasks in five columns, shown in the order of `COLUMNS` — Needs you,
In progress, Ready, Backlog, Paused — worked out from Jig's task list on every read by
`server/board/columns.ts` (`columnOf`, first rule that fits wins: Paused, Backlog, Needs you,
Ready, In progress) and served by `GET /api/projects/:id/board`. Cards are light: id, class, priority, goal,
and what the task waits for (gate, autopilot run, pull request — `web/lib/waits.ts`). Finished
tasks are only counted.

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
  `jig queue move` puts it; a drop on another column does nothing yet
  (adr-20261022-native-drag-and-drop-with-a-card-menu). The card stays where Jig says, marked
  "moving…", until the board is read again; a stale write is said in one line above the board
  (adr-20261022-writes-carry-the-revision-of-their-read).
- The order of the columns is not the order of the rules: what waits for the person comes first
  (maintainer, task `design-system`, 2026-10-18).

## Decisions and rejected alternatives

- Column set and rules: task `project-board` (2026-10-17).
- "Needs you" from Jig's attention items — rejected: a ready task would sit there whenever the
  person's git level is `none` (the `git-step` item), and pull request items move with
  housekeeping, not with the task. Attention stays on the workspace page.
- vue-router for the board's address — rejected for two screens in `project-board`; adopted
  with the design system when the page reached four (adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas). The address stays
  `#/projects/<id>`.
- Board and List as two addresses — rejected: the switch is a way of looking at one board.
- The view remembered in Jig UI's settings file — rejected: a preference of one browser need
  not survive it.
