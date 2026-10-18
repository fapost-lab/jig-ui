---
id: adr-20261017-live-stream-is-a-route-over-the-port
type: adr
status: accepted
date: 2026-10-17
domains: []
paths:
  - "server/http/**"
  - "server/source/**"
summary: The SSE stream and task details are routes in http/ over ProjectSource; no live/ or task/ module (amends the port ADR's module list)
reviewed_at: 2026-10-18
---
# The live stream and task details are routes over the port, not `live/` and `task/` modules

## Context

adr-20261014-project-source-port-keeps-hosting-open lists `live/` among the server modules and
callers of ProjectSource. Task `live-updates` (design approved 2026-10-17) built the stream: it is
`GET /api/events` in `server/http/app.ts`, a dozen lines over `ProjectSource.subscribe`. Following
projects — the Watcher, the re-read, the comparison, the last read served while a page is open —
lives in the local adapter, where the port's convention puts it (feature-live-updates). Task
`task-details` then built the details the same way: `GET /api/projects/:id/tasks/:task` reads
`ProjectSource.task` and adds the board's column; nothing was left for a `task/` module
(feature-task-details). Task `specs-and-epics` (2026-10-18) added `GET /api/projects/:id/specs`
over `ProjectSource.specs` the same way (feature-specs).

## Decision

- There is no `server/live/` module. The SSE stream is a route in `server/http/`, which reaches
  projects only through `ProjectSource.subscribe`; it carries "project X changed, revision R",
  never data or a path.
- There is no `server/task/` module. Task details are a route in `server/http/` over
  `ProjectSource.task`, with the column from `server/board/`. A project's specs are a route over
  `ProjectSource.specs` likewise.
- This amends the module list of adr-20261014-project-source-port-keeps-hosting-open (`live/`, `task/`); the rest of
  that decision stands.

## Alternatives

- A `live/` module between `http/` and `source/` — a module holding one subscribe call and a
  ping; `http/` would still own the Hono stream, so `live/` would hold nothing of its own.
- Editing the accepted ADR's text — accepted decisions are not rewritten; a changed decision is a
  new record.

## Consequences

- `http/` is the only caller of `subscribe`, `task` and `specs`. If any of them grows logic of its own (several
  signal kinds, replay after a gap, details computed rather than read), that logic belongs behind
  the port or in a module of its own then.
