---
id: adr-20261014-project-source-port-keeps-hosting-open
type: adr
status: accepted
date: 2026-10-14
domains: []
paths:
  - "server/**"
  - "web/**"
summary: Modules by area; projects reached only through ProjectSource and named by id, keeping hosting open
---
# Projects are reached through a ProjectSource port, which keeps a hosted Jig UI open

## Context

Jig UI owns almost no domain logic — Jig does; what it owns is reading Jig, noticing change and
showing it. It may later be hosted or self-hosted, where the server no longer sits on the machine
with the projects. `.ai/specs/jig-ui/architecture.md`, decided with the maintainer on 2026-10-14.

## Decision

- Server modules by area: `source/`, `jig/`, `watch/`, `registry/`, `board/`, `task/`, `live/`,
  `http/`; the page in `web/`.
- `board/`, `task/` and `live/` reach a project only through the ProjectSource port. Its one
  adapter today is local, composed of JigClient (`jig/`) and Watcher (`watch/`).
- Projects are named by id in the API and on the page, never by path; a path is a property of the
  local source.
- Access is a replaceable guard in `http/`. While the guard is the local token, the server refuses
  a non-local bind address.
- Writes are commands carrying the revision they were based on.
- The live stream carries a signal ("project X changed, revision R"), not data; the page re-fetches.

## Alternatives

- Plain layers (routes → services → `jig.ts`) — lightest now; Phase 2 would grow the services into
  one lump with Jig's shapes everywhere.
- Full ports and adapters around a domain core — a core with no logic, ports for file system,
  clock and browser that buy nothing at this size.
- Splitting a local connector from a view server already in Phase 1 — the cloud comes closer, but
  the first version stops being one process started by one command.
- Leaving hosting for later — cheap now, a rewrite of every module that took a path for granted.
- Pushing full snapshots over SSE — two ways for data to reach the page, and heavy events.

## Consequences

- A remote adapter later is a connector on the projects' machine; the server side does not change.
- A change of Jig's contract is a change in `jig/` and its contract tests only.
