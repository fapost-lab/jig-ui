# Stack — Jig UI

Decided with the maintainer on 2026-10-14. Condition from the spec: one command to start, no
native dependencies, Node.js already on the machine.

## Chosen

- **Runtime:** Node.js 24 or later, installed by the user and documented in
  `docs/requirements.mdx`. Rejected: Node 22, whose support ends in April 2027 — before a release
  that waits for Jig's contracts is likely to ship.
- **Distribution:** an npm package, `@fapost/jig-ui`, started with `npx @fapost/jig-ui`.
  The package ships the page already built; nothing compiles on the user's machine.
- **Server:** Hono on `@hono/node-server`. One process serves the JSON API, the live-update
  stream and the built page.
- **Live updates:** Server-Sent Events (Hono `streamSSE`). Writes are ordinary HTTP requests, so
  a one-way stream is enough.
- **Page:** Vue 3 with Vite, TypeScript.
- **Language:** TypeScript on both sides.

## Rejected

- React + Vite — more ready-made kanban parts (dnd-kit), but nothing the board needs is missing
  in Vue, and the concept already named Vue.
- Svelte + Vite — lightest bundle, smallest ecosystem; no reason found to leave the concept's
  choice.
- Fastify — mature, schemas built in, heavier than the few routes need.
- Plain `node:http` — no dependencies, but routing, static files and SSE by hand.
- WebSocket — a two-way channel the UI does not need: it reads a stream and writes rarely.

## Running locally

- **Network and access:** the server listens on 127.0.0.1 only and refuses a request whose `Host`
  or `Origin` is not that local address (DNS rebinding, cross-site requests); no CORS. Each start
  makes a random token; the browser is opened on a link that carries it, the server swaps it for a
  cookie, and every API call without it is refused — the way Jupyter does it. The server can run
  `jig` in the user's projects, so neither another site in the browser nor another process on the
  machine may reach it (maintainer, 2026-10-14). Rejected: localhost with `Host`/`Origin` checks
  alone — a bookmark always works, but any local process can drive the user's projects.
- **Registry and settings:** JSON files in the user's config directory — `$XDG_CONFIG_HOME/jig-ui/`,
  else `~/.config/jig-ui/`; `%APPDATA%\jig-ui\` on Windows. They survive a reinstall and a cleared
  `npx` cache; only Jig UI writes them, atomically (maintainer, 2026-10-14). Rejected: `~/.jig-ui/`
  on every system — easier to find, against each system's convention.
- **One instance:** a fixed default port, changed by a flag. A running instance records its port
  and token in the config directory; a second `npx @fapost/jig-ui` finds it, opens the browser on
  it and exits, so each project has one watcher and the registry one writer (maintainer,
  2026-10-14). Rejected: a new process on a free port per start — two servers watch the same files
  and write the same registry.
- **Writes:** every change runs `jig` as a child process (`execFile`, no shell; `jig.cmd` on
  Windows) in the project's main checkout, and a refusal is shown by Jig's failure code. Jig UI
  never writes a project file itself. This follows from the spec's decisions, not a separate choice.
- **Watching:** Node's recursive `fs.watch` on each project's `.ai/`, plus a periodic rescan for
  events the system dropped. An event is never read as data: it only triggers, debounced, a
  re-read through Jig's JSON commands (maintainer, 2026-10-14). Rejected: chokidar — one more
  dependency, and on macOS an optional native one; polling alone — a delay, and `jig` run on a
  timer in every project.

## Repository

- One npm package with `server/` and `web/` and shared types; npm, Vitest on both sides
  (maintainer, 2026-10-14). Rejected: a pnpm workspace of several packages — cleaner borders,
  but a build of its own for a single published package.
- Every JSON shape Jig exposes has a contract test over fixtures. The package declares the
  minimum Jig version it reads, and checks it in each connected project on start.
