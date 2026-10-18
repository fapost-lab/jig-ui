# Stack — Jig UI

Decided with the maintainer on 2026-10-14. Condition from the spec: one command to start, no
native dependencies, Node.js already on the machine.

## Chosen

- **Runtime:** Node.js 24 or later, installed by the user and documented in
  `docs/requirements.mdx`. Rejected: Node 22, whose support ends in April 2027 — before a release
  that waits for Jig's contracts is likely to ship.
- **Distribution:** an npm package, `@fapost/jig-ui`, started with `npx @fapost/jig-ui`.
  The package ships the page already built; nothing compiles on the user's machine.
- **Publishing:** only from GitHub Actions, through npm trusted publishing with provenance. A
  merge to the default branch publishes `<version>-next.<n>` under the `next` tag; a `v*` tag
  matching `package.json` publishes under `latest`. The very first version is published by hand,
  because a trusted publisher is configured on a package that already exists.
- **Server:** Hono on `@hono/node-server`. One process serves the JSON API, the live-update
  stream and the built page.
- **Live updates:** Server-Sent Events (Hono `streamSSE`). Writes are ordinary HTTP requests, so
  a one-way stream is enough.
- **Page:** Vue 3 with Vite, TypeScript.
- **Language:** TypeScript on both sides.

## Page: components and styling

- **Components:** shadcn-vue — Reka UI primitives (behaviour, ARIA, focus, keyboard; no styles)
  styled with Tailwind CSS v4, variants through class-variance-authority, classes merged by
  `cn()` (clsx + tailwind-merge), icons from `@lucide/vue`. The shadcn-vue CLI copies each
  component's source into the repository; the code is ours, upgrades are ours too.
- **Tailwind** comes in through `@tailwindcss/vite` in the existing `vite.config.ts`; no PostCSS
  or Tailwind config file.
- **Weight:** everything above is a dev dependency. The package ships the page already built, so
  what `npx @fapost/jig-ui` installs does not grow.
- **Themes:** light and dark, following the system, through the CSS variables shadcn-vue
  defines on `:root` and `.dark`.
- **Canvas:** a page of the app, `#/canvas`, shows every component in every variant and state,
  in both themes. It ships in the package as a chunk loaded only when opened, so the maintainer
  sees it in a `next` release on their own machine; one build, no separate mode. One
  `Canvas.vue` lists what it shows (maintainer, 2026-10-18).
- **Routing:** vue-router in hash mode; the addresses `#/projects/<id>` and
  `#/projects/<id>/tasks/<task>` stay as they are, the canvas is a lazily loaded route
  (maintainer, 2026-10-18). This replaces the rejection of vue-router in the board's feature
  knowledge, made for two screens; the page now has four, five with specs.
- **Look** — base colour, density, type, the colours of the columns — is decided in the task that
  builds the components, from two or three prototypes on real data, at its human gate
  (maintainer, 2026-10-18).
- **Drag and drop** is not covered by Reka UI; its library is chosen by the Phase 2 drag item.

## Rejected

- Reka UI with hand-written CSS, no Tailwind — three dependencies fewer, but every variant and
  token by hand and none of shadcn-vue's components to start from (maintainer, 2026-10-18).
- A styled component library (PrimeVue, Naive UI, Vuetify) — a quick start, but someone else's
  look, and the canvas would show their components, not ours (maintainer, 2026-10-18).
- Storybook or Histoire for the canvas — a second build and dozens of dependencies for a page of
  components the app can render itself.
- A dev-only canvas — invisible in a released `next` build (maintainer, 2026-10-18).
- A `.canvas.vue` file beside each component, gathered by `import.meta.glob`, with a test that
  fails on a component without one — no list to forget, but a file per component
  (maintainer, 2026-10-18).
- Keeping the hand-written hash parsing in `App.vue` — no dependency, but a regex and a manual lazy
  import that grow with every screen (maintainer, 2026-10-18).
- One theme only — dark added later means touching every component (maintainer, 2026-10-18).
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
  `jig` in the user's projects, so another site in the browser and another user on the machine
  must not reach it (maintainer, 2026-10-14). It does not keep out processes of the same user —
  the agents included — which can read the token file; they can run `jig` in those projects
  directly anyway, and the token claims no more than that. Rejected: localhost with `Host`/`Origin` checks
  alone — a bookmark always works, but any local process can drive the user's projects.
- **Registry and settings:** JSON files in the user's config directory — `$XDG_CONFIG_HOME/jig-ui/`,
  else `~/.config/jig-ui/`; `%APPDATA%\jig-ui\` on Windows. They survive a reinstall and a cleared
  `npx` cache; only Jig UI writes them, atomically (maintainer, 2026-10-14). Rejected: `~/.jig-ui/`
  on every system — easier to find, against each system's convention.
- **One instance:** a fixed default port, changed by a flag. A running instance records its port
  and token in the config directory; a second `npx @fapost/jig-ui` finds it, checks that it
  answers with that token (a crash leaves the file behind), opens the browser on it and exits, so each project has one watcher and the registry one writer (maintainer,
  2026-10-14). Rejected: a new process on a free port per start — two servers watch the same files
  and write the same registry.
- **Writes:** every change runs `jig` as a child process (`execFile`, no shell) in the project's
  main checkout. On Windows that is Git's `bash` running `.ai/scripts/jig`, never `jig.cmd`:
  since the fix for CVE-2024-27980 Node refuses to spawn a `.cmd` file without a shell, and a refusal is shown by Jig's failure code. Jig UI
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
  minimum Jig version it reads, and checks it in each connected project on start and again when a
  read fails its contract — a project's Jig can be upgraded while the UI runs.
