# Architecture

High-level map of the system. Describe engineering intent, not implementation:
what the domains are, where the boundaries lie, which direction dependencies may point,
and which constraints and invariants hold system-wide. Anything the code already says
does not belong here.

Jig UI is an optional local control center for Jig projects: one page in the browser shows every
task and epic of every connected project, and later lets a person order, prioritise and file
them. It is for developers with a terminal and Node.js. Jig works exactly as before without it
(adr-20261014-jig-ui-is-an-optional-layer-over-jig).

## Intended — not built yet

Everything below is decided (spec `jig-ui`) and not built. The task that builds a part moves it
out of this heading.

### Domains

One npm package with a server and a page
(adr-20261014-project-source-port-keeps-hosting-open):

- `server/source/` — ProjectSource, the port through which everything else reaches a project;
  one local adapter composed of JigClient and Watcher (convention-project-source).
- `server/jig/` — JigClient, the only code that knows Jig's commands and JSON shapes
  (convention-jig-client).
- `server/watch/` — Watcher: recursive `fs.watch` on each project's `.ai/` plus a periodic
  rescan, emitting "project changed" and nothing more.
- `server/registry/` — connected projects, the config directory, the single instance.
- `server/board/`, `server/task/` — the workspace overview, the per-project board and task
  details, read through ProjectSource.
- `server/live/` — the SSE stream.
- `server/http/` — the Hono app, the access guard and the built page; the only module that knows
  Hono.
- `web/` — Vue 3 views (Workspace, Board, Task) and a store; knows nothing of the file system or
  of localhost.

### Boundaries and dependency direction

- `board/`, `task/`, `live/` depend on `source/`; only `source/` depends on `jig/` and `watch/`.
- `http/` depends on the area modules; nothing depends on `http/`.
- `web/` depends on the HTTP API only; shared types are the only code it shares with `server/`.

### Runtime flows

1. **Start.** `npx @fapost/jig-ui` checks Node 24+, finds a running instance through the config
   directory (and checks it answers) or starts one on 127.0.0.1 with a fresh token, and opens the
   browser on a link carrying the token (adr-20261014-local-server-access-guard).
2. **Read and follow.** The page fetches light lists and heavy detail on demand. A file change
   under a project's `.ai/`, debounced, makes ProjectSource re-read through Jig; `live/` sends
   "project X changed, revision R" and the page re-fetches what it shows.
3. **Change** (Phase 2). The page sends a command with the revision it saw; ProjectSource runs the
   matching Jig command; a stale revision comes back as Jig's refusal and is shown as a conflict.

### System-wide constraints and invariants

- Jig's files are the source of truth; Jig UI keeps only its registry and interface settings.
- Board columns are derived, never stored; a drop is a sticky request
  (adr-20261014-board-columns-are-derived-from-jig-state).
- A hosted or self-hosted Jig UI stays possible: projects by id, access behind a replaceable
  guard, writes carrying a revision (adr-20261014-project-source-port-keeps-hosting-open).
- Stack: adr-20261014-stack-vue-hono-sse-on-node.
