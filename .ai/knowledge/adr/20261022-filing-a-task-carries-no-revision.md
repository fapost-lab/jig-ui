---
id: adr-20261022-filing-a-task-carries-no-revision
type: adr
status: accepted
date: 2026-10-22
domains: []
paths:
  - server/http/app.ts
  - server/source/local.ts
  - server/jig/client.ts
  - web/views/BoardView.vue
  - web/components/NewTaskForm.vue
summary: "Filing a task from the page carries no revision and names no live id: Jig's already-exists claims the id; the id and goal are checked against Jig's grammar at the API and passed without a shell"
reviewed_at: 2026-10-22
---
# Filing a task carries no revision

## Context

Task `file-backlog-task` lets a person file a task from the board (`jig task new <id> --goal
<goal>`). adr-20261022-writes-carry-the-revision-of-their-read says a write from the page carries
the revision of the board it showed, so a change nobody saw is never written over. Jig 0.31.0's
`task new` takes no `--revision`. Decided with the maintainer, 2026-10-22.

## Decision

- Filing a task is one Jig command through ProjectSource (`fileTask`) and carries **no
  revision**. It writes nothing that exists: Jig creates the task's directory and refuses an id
  already there (`already-exists`), finished tasks included. The id is the claim, so it is also
  what keeps a repeated request from filing twice.
- The id and the goal are a person's text, not ids Jig returned, so the live-id rule of the
  earlier ADR cannot hold for them. They are checked at the API against Jig's own grammar — an
  id of `[A-Za-z0-9._-]` not starting with `.` or `-`, a goal of one non-empty line of at most
  500 characters — and refused `422 usage` without running Jig; JigClient passes them by
  `execFile`, never through a shell — on Windows in the environment, since Git bash globs and
  unquotes its own command line (convention-jig-client).
- HTTP: `POST /api/projects/:id/tasks {task, goal}`; `200 { written: true }` after the re-read,
  `409` for `already-exists`, `422` for `usage`, `404` for `not-connected`.
- Everything else in the earlier ADR holds: the re-read before the answer, the page waiting for
  Jig, no retry.

## Alternatives

- The page sends its revision and the adapter compares it with its last read — a check outside
  Jig, racing the write it guards; nothing it would catch is overwritten anyway.
- Ask Jig for `task new --revision` and wait — there is nothing for it to protect.

## Consequences

- Two people (or a person and an agent) can file the same work under two ids; `jig task abandon`
  takes one back.
- A taken id the board does not show — a finished task's — is refused with a message saying so.
