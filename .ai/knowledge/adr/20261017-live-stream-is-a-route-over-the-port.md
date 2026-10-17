---
id: adr-20261017-live-stream-is-a-route-over-the-port
type: adr
status: proposed
date: 2026-10-17
domains: []
paths:
  - "server/http/**"
  - "server/source/**"
summary: The SSE stream is GET /api/events in http/ over ProjectSource.subscribe; no live/ module (amends the port ADR's module list)
---
# The live stream is a route over the port, not a `live/` module

## Context

adr-20261014-project-source-port-keeps-hosting-open lists `live/` among the server modules and
callers of ProjectSource. Task `live-updates` (design approved 2026-10-17) built the stream: it is
`GET /api/events` in `server/http/app.ts`, a dozen lines over `ProjectSource.subscribe`. Following
projects — the Watcher, the re-read, the comparison, the last read served while a page is open —
lives in the local adapter, where the port's convention puts it (feature-live-updates).

## Decision

- There is no `server/live/` module. The SSE stream is a route in `server/http/`, which reaches
  projects only through `ProjectSource.subscribe`; it carries "project X changed, revision R",
  never data or a path.
- This amends the module list of adr-20261014-project-source-port-keeps-hosting-open; the rest of
  that decision stands.

## Alternatives

- A `live/` module between `http/` and `source/` — a module holding one subscribe call and a
  ping; `http/` would still own the Hono stream, so `live/` would hold nothing of its own.
- Editing the accepted ADR's text — accepted decisions are not rewritten; a changed decision is a
  new record.

## Consequences

- `http/` is the only caller of `subscribe`. If the stream grows logic of its own (several signal
  kinds, replay after a gap), that logic belongs behind the port or in a module of its own then.
