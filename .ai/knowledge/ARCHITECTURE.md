# Architecture

High-level map of the system. Describe engineering intent, not implementation:
what the domains are, where the boundaries lie, which direction dependencies may point,
and which constraints and invariants hold system-wide. Anything the code already says
does not belong here.

Jig UI is an optional local control center for Jig projects: one page in the browser shows every
task and epic of every connected project, and later lets a person order, prioritise and file
them. It is for people with a terminal: a developer starts it with their own Node.js, anyone else with
one line that brings its own (the install flow). Jig works exactly as before without it
(adr-20261014-jig-ui-is-an-optional-layer-over-jig).

## Built

- `server/cli.ts` — the `jig-ui` command. It imports nothing but the Node version check, so an
  old Node prints the requirement instead of a stack trace, then loads `server/main.ts`, which
  dispatches the commands parsed in `args.ts`: none (the start flow below), `serve`, and `start`,
  `stop`, `status`, `open`.
- `server/service.ts` — the background instance: `start` runs the CLI itself as `serve` (the
  server with no browser and no folder) detached, output in `server.log`, and waits for it to
  answer; `stop` asks the instance over HTTP; `status` and `open` read and probe. A probe tells
  `up`, `gone` (refused, or another's answer: a stale file) and `silent` (maybe busy: touched by
  nothing). Its system calls are injected, so tests start and signal no process.
- `server/http/` — the Hono app on 127.0.0.1: security headers, then the access guard in
  `access.ts` (local-only `Host`/`Origin`, then the per-start token swapped for a cookie;
  convention-access-guard) before every route, `GET /api/instance`, `POST /api/instance/stop` (the same shutdown as SIGTERM, after its 202), and the built page from
  `dist/web`. The API's routes are chained in `apiRoutes()`, whose type `AppType` the page takes
  (adr-20261018-page-takes-api-types-through-hono-rpc). A route's refusal is
  `{ error: { code, message } }`, and so is what `onError` answers: Hono's own (a body that is no
  JSON) as `usage` with its status, anything unforeseen as `internal` with 500 and its message only
  in the terminal, since it may name a path. The guard's 403 (text) and 401, and an unknown `/api/*`
  path's 404, keep forms of their own.
- `server/registry/` — the config directory and the single instance: `instance.json` (port,
  token) written atomically, probed by a second start, removed with `open.html` on stop; and the
  registry, `projects.json`, of connected projects by id and main-checkout path
  (adr-20261017-registry-of-connected-projects). It knows neither git nor Jig.
- `server/jig/` — JigClient: the project's Jig version against `MIN_JIG_VERSION`, the JSON
  reads `jig status` (what needs the person), `jig task list`, `jig queue list` and `jig spec list`
  (feature-specs), and the writes `jig queue move`, `jig queue set --priority`, `jig queue request`
  and `cancel` (a pause), `jig task new` and `jig task resume` (from Jig 0.35.0), and
  `jig upgrade`, its dry run and its run (from Jig 0.34.0), and `jig self-update` (its text line), each JSON answer checked by a zod schema (adr-20261018-jig-answers-checked-by-zod-schemas) and tested against
  fixtures in `server/jig/fixtures/` — Jig 0.29.0 for the reads it had, 0.31.0 for the queue
  (convention-jig-client).
- `server/source/` — the ProjectSource port (`project-source.ts`: the workspace, a project's live
  tasks, one task in full, connect, disconnect, subscribe to changes, and the writes `move`,
  `prioritise`, `moveEpic`, `prioritiseEpic`, `requestPause`, `cancelPause`, `resume` and `fileTask`, `planUpgrade`, `upgrade` and
  `dismissUpgrade`, and the machine's runs `machine`, `selfUpdate`, `upgradeAll` and `dismissUpgradeAll`) and its local adapter (`local.ts`), which holds the
  registry, runs Jig and, while someone subscribes, follows each project through a Watcher (feature-live-updates). A
  project is `ready` (task counts and attention items), `unsupported` (Jig below the minimum, not
  read), `incompatible` (a newer Jig's shape), `unreadable` (Jig refused; its code only) or
  `unavailable` (convention-project-source).
- `server/watch/` — Watcher: one recursive `fs.watch` per directory, debounced into "something
  changed", knowing nothing of Jig (convention-watcher).
- `server/board/` — a project's board: columns worked out from its tasks on every read
  (feature-board).
- `server/http/` also serves `GET /api/workspace`, `GET /api/projects/:id/board`,
  `GET /api/projects/:id/tasks/:task` (feature-task-details), `GET /api/projects/:id/specs`
  (feature-specs), `POST /api/projects/:id/queue/move`, `/queue/priority`, `/queue/epic/move`, `/queue/epic/priority`, `/queue/pause`,
  `/queue/pause/cancel` and `/tasks/resume` (adr-20261022-writes-carry-the-revision-of-their-read),
  `POST /api/projects/:id/tasks` (adr-20261022-filing-a-task-carries-no-revision),
  `POST /api/projects/:id/upgrade/plan`, `POST` and `DELETE /api/projects/:id/upgrade`
  (adr-20261027-upgrading-a-project-runs-in-the-background), `POST /api/self-update`, `POST` and
  `DELETE /api/upgrade-all` (adr-20261029-upgrade-all-and-self-update-from-the-page), connect /
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
  helpers), the only callers of `call()`, `client` and `onChange()` besides `App.vue`; `components/` — Jig UI's own, props in and events out;
  `components/ui/` — shadcn-vue's, knowing nothing of Jig; `lib/` — what a card says, the colours
  that mean something, the theme, and `lastWins` (a read that lands only if no later one started).
  `api.ts` — the typed `client` (Hono's `hc` over `AppType`), the response types derived from it,
  `call()` with the failures every view shares, and the change stream each view re-reads on. Vite builds it into `dist/web` and the package ships it built. One TypeScript
  checks both sides (adr-20261017-one-typescript-for-server-and-web).
  Directions: `views/` → `components/` → `components/ui/`; `lib/` from any of them; `api.ts` →
  `server/http/` for types only — lint refuses a value import from `server/`.
- **Start flow.** `npx @fapost/jig-ui` checks Node 24+, finds a running instance through the
  config directory and checks it answers with its token — then opens it and exits — or starts one
  on 127.0.0.1 with a fresh token and opens the browser on a link carrying it
  (adr-20261014-local-server-access-guard). Two starts at once: the one that loses the port opens
  the winner. Run in a git checkout, the command then asks the instance that serves — its own or
  the running one — to connect the folder (`POST /api/projects` with the token, so only that
  instance writes the registry), a worktree standing for its clone's main checkout, and opens the
  board at `#/projects/<id>`; outside a Jig project it says nothing.
- **Read and follow.** The page opens its change stream and reads once it is open; while it is
  open a change under a project's `.ai/`, debounced, or the minute's rescan makes the local adapter
  re-read through Jig, and only a read that differs — or a project newly connected — sends
  "project X changed, revision R"; the page re-reads, served from that read (feature-live-updates).
- **Change.** The page sends a write with the revision of the board it showed; ProjectSource
  runs the matching Jig command for live task ids only and answers after reading the project
  again; Jig's `stale-revision` comes back as 409, and the page reads the board again and shows
  the conflict: what changed between the board the write was made on and that read, its cards
  marked (adr-20261022-writes-carry-the-revision-of-their-read, feature-board). Built for the
  queue: order, priority and pause requests; and for a resume
  (adr-20261026-a-drop-out-of-paused-resumes-at-once). Filing a task is the one write with no revision: it
  names a new id, which Jig claims or refuses `already-exists`
  (adr-20261022-filing-a-task-carries-no-revision). Upgrading a project's Jig is the one write that
  outlives its request: after a dry run, `jig upgrade` runs in the server's background, its state in
  the adapter's memory and on the workspace read, and no other Jig runs in the project meanwhile
  (adr-20261027-upgrading-a-project-runs-in-the-background). Upgrade all runs those upgrades one at
  a time, after `jig self-update` when a release is out; a self-update only after the person confirms
  it (adr-20261029-upgrade-all-and-self-update-from-the-page).
- **Install flow.** `install.sh`, fetched by one line from the latest GitHub Release, uses a
  Node.js 24 or later already on PATH; otherwise it puts the official Node.js 24 from nodejs.org,
  its SHA-256 sum checked and the binary run once, in Jig UI's own data folder. Then it writes a
  `jig-ui` command that runs `npx @fapost/jig-ui` with that Node.js, so the package updates as it
  does for npx and running the line again updates Node.js. It runs from a terminal, Git Bash on
  Windows; what it may write is a rule in `RULES.md`.
- **Release flow.** A merge to `main` runs the CI matrix, builds `dist/` in a job without
  credentials, and publishes `<version>-next.<run>` under npm's `next` tag; a `v*` tag on a
  commit of `main` publishes `latest`, runs `install.sh` on each OS against it, and then creates
  the GitHub Release that carries `install.sh`. Details in `RELEASING.md`.

## Intended — not built yet

Everything below is decided (spec `jig-ui`) and not built. The task that builds a part moves it
out of this heading.

### Domains

One npm package with a server and a page
(adr-20261014-project-source-port-keeps-hosting-open):

- `server/http/` — the Hono app, the access guard and the built page; the only server module that
  knows Hono, but for `main.ts` serving it (`@hono/node-server`); the page knows `hono/client`.

### Boundaries and dependency direction

- `board/` depends on `source/`; only `source/` depends on `jig/` and `watch/`.
- `http/` depends on the area modules; nothing depends on `http/` but the page's types.
- `web/` depends on the HTTP API only; shared types are the only code it shares with `server/`.

### Runtime flows

The start flow, read-and-follow and change, with its conflict display, are built (see Built above).

### System-wide constraints and invariants

- Jig's files are the source of truth; Jig UI keeps only its registry and interface settings.
- Board columns are derived, never stored; a drop on another column is a sticky request
  (adr-20261014-board-columns-are-derived-from-jig-state), except a drop out of Paused, which
  resumes the task at once (adr-20261026-a-drop-out-of-paused-resumes-at-once).
- A hosted or self-hosted Jig UI stays possible: projects by id, access behind a replaceable
  guard, writes carrying a revision (adr-20261014-project-source-port-keeps-hosting-open) — all but
  the upgrade (adr-20261027-upgrading-a-project-runs-in-the-background).
- Stack: adr-20261014-stack-vue-hono-sse-on-node.
