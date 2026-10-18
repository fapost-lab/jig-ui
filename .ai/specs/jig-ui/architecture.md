# Architecture — Jig UI

Decided with the maintainer on 2026-10-14.

## Shape: modules by area, two ports at the edge

Jig UI owns almost no domain logic — Jig does. What it owns is reading Jig, noticing change and
showing it, so the edges are what deserve a seam.

```
server/
  source/     ProjectSource port: the only way the rest reads or changes a project
              (one adapter today: local, built from jig/ and watch/)
  jig/        JigClient: run jig, parse and validate its JSON
              (real adapter, and a fake over fixtures for tests)
  watch/      Watcher: fs.watch + rescan -> "project changed"
  registry/   connect and disconnect projects, the config directory, one instance
  board/      workspace overview and per-project boards, read from JigClient
  task/       task details, read from JigClient
  live/       SSE: "project X changed, revision R"
  http/       Hono app, token and Host/Origin guard, the built page
web/
  ui/         shadcn-vue components (button/, badge/, card/ …): know nothing of Jig
  components/ Jig UI's own, built from ui/: task card, board column, project row …
  views/      one per route: Workspace, Board, Task, Canvas; the only callers of api.ts
  lib/        cn() and other helpers
  api.ts      fetch on load, refetch on an SSE event
```

In `web/`, dependencies point one way: `views/` → `components/` → `ui/` (maintainer,
2026-10-18). A component that fetches is a view.

- **JigClient** is the only module that knows Jig's commands and JSON shapes. A change of Jig's
  contract is a change here and in its contract tests, nowhere else. The other modules see typed
  data.
- **Watcher** emits that a project changed and nothing more; what changed is read through
  JigClient.
- **ProjectSource** is what `board/`, `task/` and `live/` depend on: read a project, list its
  tasks and specs, subscribe to its changes, send a command. The local adapter composes JigClient
  and Watcher; nothing outside `source/` knows that a project is a directory.
- Dependencies point inward to `source/`; `http/` is the only module that knows Hono.

## Room for a hosted or self-hosted Jig UI

Jig UI may later run in the cloud or on a team's own server (maintainer, 2026-10-14). Nothing of
that is built in Phase 1, but four seams keep it open:

1. **ProjectSource is a port.** A later remote adapter is a connector on the machine that holds
   the projects, pushing snapshots and taking commands; the server side does not change.
2. **Projects are named by id, never by path.** The API and the page speak project ids; a path is
   a property of the local source. `web/` knows nothing of the file system or of localhost.
3. **Access is a replaceable guard in `http/`.** Today the per-start token; later accounts. The
   bind address is configurable and defaults to 127.0.0.1; the server refuses a non-local address
   while the guard is the local token.
4. **Writes are commands carrying the revision they were based on**, as Jig's contract does, so
   they can later travel as a queue of commands to a connector.

Rejected: splitting a local connector from a view server already in Phase 1 — the cloud comes
closer, but the first version stops being one process started by one command. Rejected: leaving
it all for later — cheap now, and a rewrite of every module that took a path for granted.

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
