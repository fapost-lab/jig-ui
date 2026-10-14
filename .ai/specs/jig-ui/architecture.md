# Architecture — Jig UI

Decided with the maintainer on 2026-10-14.

## Shape: modules by area, two ports at the edge

Jig UI owns almost no domain logic — Jig does. What it owns is reading Jig, noticing change and
showing it, so the edges are what deserve a seam.

```
server/
  jig/        JigClient port: run jig, parse and validate its JSON
              (real adapter, and a fake over fixtures for tests)
  watch/      Watcher port: fs.watch + rescan -> "project changed"
  registry/   connect and disconnect projects, the config directory, one instance
  board/      workspace overview and per-project boards, read from JigClient
  task/       task details, read from JigClient
  live/       SSE: "project X changed, revision R"
  http/       Hono app, token and Host/Origin guard, the built page
web/
  views:      Workspace, Board, Task
  store:      fetch on load, refetch on an SSE event
```

- **JigClient** is the only module that knows Jig's commands and JSON shapes. A change of Jig's
  contract is a change here and in its contract tests, nowhere else. The other modules see typed
  data.
- **Watcher** emits that a project changed and nothing more; what changed is read through
  JigClient.
- Dependencies point inward to `jig/` and `watch/`; `http/` is the only module that knows Hono.

## Live updates

The SSE stream carries a signal, not data: "project X changed, revision R". The page re-fetches
what it shows — light rows for lists, the detail on demand. One read path, and a reconnect is
just a re-fetch. Rejected: pushing full snapshots — fewer requests, but two ways for data to
reach the page and heavy events.

## Rejected shapes

- Plain layers (routes → services → `jig.ts`) — lightest today, but Phase 2 (queue, requests,
  conflicts) would grow the services into one lump, and nothing would keep Jig's shapes in one
  place.
- Full ports and adapters around a domain core — a core with no logic of its own, and ports for
  the file system, the clock and the browser that buy nothing at this size.
