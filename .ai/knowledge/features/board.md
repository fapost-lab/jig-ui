---
id: feature-board
type: feature
status: active
domains: []
paths:
  - "server/board/**"
  - web/Board.vue
summary: Board columns from Jig's task state (Paused, Backlog, Needs you, Ready, In progress), first rule wins; why Needs you is read from state, not attention
reviewed_at: 2026-10-17
---
# Board

## What

A connected project's live tasks in five columns — Paused, Backlog, Needs you, Ready, In progress —
worked out from Jig's task list on every read by `server/board/columns.ts` (`columnOf`, first rule
that fits wins) and served by `GET /api/projects/:id/board`. Cards are light: id, class, goal, and
what the task waits for (gate, autopilot run, pull request). Finished tasks are only counted.

## Why

A person running agents in several projects wants to see where each task stands without reading
`jig task list`. The columns answer one question each: is it set aside, not begun, waiting for me,
done, or moving.

## Constraints

- Columns are derived and never stored (adr-20261014-board-columns-are-derived-from-jig-state);
  ProjectSource hands typed tasks and computes no column (convention-project-source).
- "Needs you" is read from the task's own state — a gate waiting or changed, an autopilot run
  stopped — so a task's column does not depend on the clone's `agent.git` or on housekeeping.
- Order inside a column is Jig's list order (by id) until Phase 2 brings Jig's queue.

## Decisions and rejected alternatives

- Column set and rules: task `project-board` (2026-10-17).
- "Needs you" from Jig's attention items — rejected: a ready task would sit there whenever the
  person's git level is `none` (the `git-step` item), and pull request items move with
  housekeeping, not with the task. Attention stays on the workspace page.
- vue-router for the board's address — rejected for two screens; the page reads
  `#/projects/<id>` itself (`web/App.vue`).
