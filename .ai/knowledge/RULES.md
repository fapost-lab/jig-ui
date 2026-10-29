# Rules and Invariants

Normative requirements for this project. Rules say how work must be done; invariants say
what must always hold. Both are enforced in review and verification. Area-specific rules
are added as sections of this file.

## Invariants

- Jig UI never writes a file inside a connected project; every change is a `jig` command.
  (spec `jig-ui`; adr-20261014-jig-ui-is-an-optional-layer-over-jig. Checked in review: no file
  write outside the config directory.)
- Jig UI stores nothing but its project registry, interface settings, the access `token` (kept
  across starts, removed only by `jig-ui reset-token`) and the running instance's
  `instance.json` and `open.html`, in the user's config directory, written atomically — and the
  background instance's `server.log` there, its output, overwritten by each `jig-ui start`
  (task background-service). A
  preference of one browser — the theme, Board or List — is that browser's `localStorage`, not
  a file. (adr-20261014-local-server-access-guard,
  adr-20261017-browser-opens-through-a-redirect-file, adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas. Checked in review.)
- A board column is computed from Jig's state on every read and never stored.
  (adr-20261014-board-columns-are-derived-from-jig-state. Checked in review.)
- Only `server/jig/` runs `jig` or knows the shape of its output.
  (convention-jig-client. Checked in review: nothing outside `server/jig/` spawns `jig` or names
  Jig's fields; the only other `child_process` uses are `server/open-browser.ts` starting the
  system browser opener, `server/service.ts` starting the CLI itself detached as `serve`, `git rev-parse` and `git worktree list` in `server/source/` telling a main
  checkout from a worktree and finding a worktree's main checkout, and `git --exec-path` in `server/jig/` finding Git's bash on Windows.)
- `install.sh` writes only Jig UI's Node.js folder and its own `jig-ui` command, never over a
  command it did not write, and installs Node.js only after its SHA-256 sum matched nodejs.org's; it
  edits no shell profile and no system setting. (spec `jig-ui`, task `install-without-node`. Checked
  by `server/install.test.ts` and the Installer workflow.)
- The API and the page name projects by id; no path reaches `web/`.
  (adr-20261014-project-source-port-keeps-hosting-open. Checked by tests on the API responses.)
- The server binds 127.0.0.1 unless a guard other than the local token is in place, refuses a
  foreign `Host` or `Origin`, and refuses every API call without the token.
- `jig-ui stop` never signals a pid read from `instance.json` on its own word: it asks the instance
  over `POST /api/instance/stop` with the token, and sends SIGTERM only to an older instance that
  answered the probe with its token and has no such route. A file whose port refuses is removed
  with no signal; one whose port stays silent is left alone, as the instance may only be busy.
  (task background-service. Checked by tests in `server/service.test.ts`.)
  (adr-20261014-local-server-access-guard. Checked by tests.)

## Rules

- Each JSON shape Jig exposes has a contract test over fixtures, and the package declares the
  minimum Jig version it reads. (spec `jig-ui`, stack.md. Checked by `jig verify`.)
- `jig` is spawned without a shell: with `spawn` leading a process group of its own, so that stopping Jig UI stops
  the whole run (task `stop-ends-upgrade`); on Windows with `execFile` through Git's bash.
  (adr-20261014-stack-vue-hono-sse-on-node. Checked in review.)
- The published package has no native runtime dependencies and carries the page already built;
  development tools (the TypeScript compiler, Vitest's bundler) may be native.
  (adr-20261014-stack-vue-hono-sse-on-node. Checked in review of `package.json` `dependencies`.)
- The package is published only by `.github/workflows/release.yml`, through npm trusted
  publishing: never with a token, never from a machine, except the one-time bootstrap in
  `RELEASING.md`. The job holding `id-token: write` installs no dependencies; publishing waits for
  the CI matrix on Linux, macOS and Windows; a tag publishes only a commit on `main`.
  (spec `jig-ui`, Phase 0. Checked in review of `.github/workflows/`.)
- Every action in `.github/workflows/` is pinned to a full commit SHA with its version in a
  comment; Dependabot proposes updates. (spec `jig-ui`, Phase 0. Checked in review.)
- Code passes `npm run lint` — ESLint for correctness and the layout Prettier leaves open, Prettier for the rest of the layout
  (convention-code-style. Checked by CI and a full `jig verify`.)
- Work that changes what a user sees or does updates the pages in `docs/` it affects and adds a
  line under **Unreleased** in `docs/changelog.mdx`. (spec `jig-ui`, roadmap. Checked in review.)
- A release is not cut until `docs/` describes what its tag ships: the version pull request turns
  **Unreleased** into the version and date and reads every page against the release, as
  `RELEASING.md` lists. `docs/` is the public documentation, and a user reads it before trying
  what a release says it does. (The maintainer, 2026-10-22. Checked in review of the version pull
  request.)
- Every page in `docs/` compiles as MDX: Mintlify deploys `docs/` from `main` and, when a page
  does not parse, keeps the old site with no failing check of ours, which left 0.4.0 off the site.
  A literal `<word>` outside code is written `&lt;word&gt;`. (The maintainer, 2026-10-29. Checked by
  `server/docs.test.ts` in `npm test`.)
