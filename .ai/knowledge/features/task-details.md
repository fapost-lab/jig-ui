---
id: feature-task-details
type: feature
status: active
domains: []
paths:
  - server/board/columns.ts
  - server/source/local.ts
  - server/http/app.ts
  - server/jig/client.ts
  - web/views/TaskView.vue
  - web/components/TaskBrief.vue
  - web/components/TaskFacts.vue
  - web/lib/queue.ts
summary: What a task's details show from Jig's task row and queue, why only offered actions and no paths reach the page, and what Jig does not report yet
reviewed_at: 2026-10-29
---
# Task details

## What

A click on a board card expands it into the task's facts; in the List, a selected row shows them
in a pane (`web/components/TaskBrief.vue`), with a button that copies the task's id. "Open full
details" opens `#/projects/<id>/tasks/<task>` (`web/views/TaskView.vue`), the page links land on,
and only it lists the actions Jig offers. All three are served by
`GET /api/projects/:id/tasks/:task` from `ProjectSource.task`: the task's row from Jig's task list
in full — column (the board's rule), status, class, branch and base, worktree's uncommitted count,
knowledge decision, dates, gate, autopilot run with its stage and stop question, pull request with
CI, housekeeping flags — the attention items that name it, the actions Jig offers with their
commands, and from `jig queue list` its priority, its place and what it waits for. Its place is
counted among the live tasks and open epics of its level (`server/source/local.ts`): Jig keeps a
finished task or epic in its queue until `jig queue remove`, and counting it would put a task
behind work that is done. What it waits for is its own `depends_on`, then its epic's, each as
declared — met or not, since Jig's queue does not say. It re-fetches on a change of its project,
like the board.

## Why

A card answers "where does it stand"; the details answer "what is it waiting for, and what do I
run". The fields a person orders work by — priority, place, dependencies — sit first (a
maintainer's colleague, task `card-fields-and-artifacts`); the actions left the expanded card,
where a command to copy was noise, for the full page. The actions come from Jig's own table (Jig's adr-20261015-one-table-of-what-a-person-may-do),
so the page never decides what is allowed.

## Constraints

- **Only offered actions reach the page, without a reason.** An action's `reason` is Jig's refusal
  text word for word and can name a checkout or worktree path; no path reaches `web/` (RULES.md).
  For the same reason the worktree is only its `uncommitted` count — JigClient drops the path.
- **Jig UI runs no action** in Phase 1: the page shows the command to run in the project.
- **Not shown:** which task documents exist — a gap in Jig's contract, not a choice (Jig's JSON
  carries none, and reading Jig's files is ruled out by
  adr-20261014-jig-ui-is-an-optional-layer-over-jig; asked in fapost-lab/jig#347, task
  `task-artifacts` waits on it).
- Details cost no extra Jig run: the local adapter keeps one detail per live task in the same read
  as the board's rows (feature-live-updates). A finished task has none; its link says so.
- An action id this Jig UI does not know is ignored in `server/jig/client.ts`, as Jig's contract
  asks of a consumer; the page names the ten it knows.
- Strict validation: the whole task row is checked (convention-jig-client), so a Jig that changes
  an action's or the autopilot's shape makes the project `incompatible`, not half-read.

## Decisions and rejected alternatives

- A detail read beside the board's light rows — rejected: one fat card type, which would put ten
  actions per task into every board response ("light rows for lists, the detail on demand",
  `.ai/specs/jig-ui/architecture.md`).
- A `server/task/` module — rejected: it would hold nothing; the route adds the column from
  `board/placeOf` and reads the port (proposed adr-20261017-live-stream-is-a-route-over-the-port).
- Showing refused actions with Jig's reason — rejected for the path rule above.
