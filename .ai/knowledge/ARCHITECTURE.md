# Architecture

High-level map of the system. Describe engineering intent, not implementation:
what the domains are, where the boundaries lie, which direction dependencies may point,
and which constraints and invariants hold system-wide. Anything the code already says
does not belong here.

Jig UI is an optional local control center for Jig projects: one page in the browser shows every
task and epic of every connected project, and later lets a person order, prioritise and file
them. It is for developers with a terminal and Node.js. Jig works exactly as before without it
(adr-20261014-jig-ui-is-an-optional-layer-over-jig).

## Built

- `server/cli.ts` — the `jig-ui` command. It imports nothing but the Node version check, so an
  old Node prints the requirement instead of a stack trace, then loads `server/main.ts`.
- `server/http/` — the Hono app on 127.0.0.1: the access guard in `access.ts` (local-only
  `Host`/`Origin`, then the per-start token swapped for a cookie; convention-access-guard) before
  every route, `GET /api/instance`, and the built page from `dist/web`.
- `server/registry/` — the config directory and the single instance: `instance.json` (port,
  token) written atomically, probed by a second start, removed with `open.html` on stop; and the
  registry, `projects.json`, of connected projects by id and main-checkout path
  (adr-20261017-registry-of-connected-projects). It knows neither git nor Jig.
- `server/jig/` — JigClient: the project's Jig version against `MIN_JIG_VERSION`, and the JSON
  reads `jig status` (what needs the person) and `jig task list`, validated against fixtures of
  Jig 0.29.0 in `server/jig/fixtures/` (convention-jig-client).
- `server/source/` — the ProjectSource port (`project-source.ts`: the workspace, a project's live
  tasks, one task in full, connect, disconnect, subscribe to changes) and its local adapter (`local.ts`), which holds the
  registry, runs Jig and, while someone subscribes, follows each project through a Watcher (feature-live-updates). A
  project is `ready` (task counts and attention items), `unsupported` (Jig below the minimum, not
  read), `incompatible` (a newer Jig's shape), `unreadable` (Jig refused; its code only) or
  `unavailable` (convention-project-source).
- `server/watch/` — Watcher: one recursive `fs.watch` per directory, debounced into "something
  changed", knowing nothing of Jig (convention-watcher).
- `server/board/` — a project's board: columns worked out from its tasks on every read
  (feature-board).
- `server/http/` also serves `GET /api/workspace`, `GET /api/projects/:id/board`,
  `GET /api/projects/:id/tasks/:task` (feature-task-details), connect /
  disconnect under `/api/projects`, and `GET /api/events` — the SSE stream of "project X changed,
  revision R" — through the port only; responses name projects by id.
  Directions: `http/` → `board/`, `source/`; `board/` → `source/` (types); `source/` → `jig/`,
  `registry/`, `watch/`.
- `server/open-browser.ts` — opens the browser through `open.html` in the config directory, so
  the token is never a process argument (adr-20261017-browser-opens-through-a-redirect-file).
- `web/` — the Vue 3 page, built from shadcn-vue components on Tailwind (adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas,
  convention-vue). `router.ts` — vue-router in hash mode: `#/` the workspace, `#/projects/<id>`
  a board, `#/projects/<id>/tasks/<task>` a task's details, `#/canvas` every component in every
  state (loaded lazily, linked from nowhere), anything else `#/`. `App.vue` — the project tabs
  and the theme switch over the current view. `views/` — one per address (and the canvas's
  helpers), the only callers of `api()` and `onChange()` besides `App.vue`; `components/` — Jig UI's own, props in and events out;
  `components/ui/` — shadcn-vue's, knowing nothing of Jig; `lib/` — what a card says, the colours
  that mean something, and the theme. `api.ts` — the shared fetch, types and the change stream each view
  re-fetches on. Vite builds it into `dist/web` and the package ships it built. One TypeScript
  checks both sides (adr-20261017-one-typescript-for-server-and-web).
  Directions: `views/` → `components/` → `components/ui/`; `lib/` from any of them.
- **Start flow.** `npx @fapost/jig-ui` checks Node 24+, finds a running instance through the
  config directory and checks it answers with its token — then opens it and exits — or starts one
  on 127.0.0.1 with a fresh token and opens the browser on a link carrying it
  (adr-20261014-local-server-access-guard). Two starts at once: the one that loses the port opens
  the winner.
- **Read and follow.** The page fetches; while it is open a change under a project's `.ai/`,
  debounced, or the minute's rescan makes the local adapter re-read through Jig, and only a read
  that differs sends "project X changed, revision R"; the page re-fetches, served from that read.
- **Release flow.** A merge to `main` runs the CI matrix, builds `dist/` in a job without
  credentials, and publishes `<version>-next.<run>` under npm's `next` tag; a `v*` tag on a
  commit of `main` publishes `latest`. Details in `RELEASING.md`.

## Intended — not built yet

Everything below is decided (spec `jig-ui`) and not built. The task that builds a part moves it
out of this heading.

### Domains

One npm package with a server and a page
(adr-20261014-project-source-port-keeps-hosting-open):

- `server/http/` — the Hono app, the access guard and the built page; the only module that knows
  Hono.

### Boundaries and dependency direction

- `board/` depends on `source/`; only `source/` depends on `jig/` and `watch/`.
- `http/` depends on the area modules; nothing depends on `http/`.
- `web/` depends on the HTTP API only; shared types are the only code it shares with `server/`.

### Runtime flows

The start flow and read-and-follow are built (see Built above). Still to build:

1. **Change** (Phase 2). The page sends a command with the revision it saw; ProjectSource runs the
   matching Jig command; a stale revision comes back as Jig's refusal and is shown as a conflict.

### System-wide constraints and invariants

- Jig's files are the source of truth; Jig UI keeps only its registry and interface settings.
- Board columns are derived, never stored; a drop is a sticky request
  (adr-20261014-board-columns-are-derived-from-jig-state).
- A hosted or self-hosted Jig UI stays possible: projects by id, access behind a replaceable
  guard, writes carrying a revision (adr-20261014-project-source-port-keeps-hosting-open).
- Stack: adr-20261014-stack-vue-hono-sse-on-node.
