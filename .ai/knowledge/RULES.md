# Rules and Invariants

Normative requirements for this project. Rules say how work must be done; invariants say
what must always hold. Both are enforced in review and verification. Area-specific rules
are added as sections of this file.

## Invariants

- Jig UI never writes a file inside a connected project; every change is a `jig` command.
  (spec `jig-ui`; adr-20261014-jig-ui-is-an-optional-layer-over-jig. Checked in review: no file
  write outside the config directory.)
- Jig UI stores nothing but its project registry, interface settings and the running instance's
  `instance.json` and `open.html`, in the user's config directory, written atomically. A
  preference of one browser — the theme, Board or List — is that browser's `localStorage`, not
  a file. (adr-20261014-local-server-access-guard,
  adr-20261017-browser-opens-through-a-redirect-file, adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas. Checked in review.)
- A board column is computed from Jig's state on every read and never stored.
  (adr-20261014-board-columns-are-derived-from-jig-state. Checked in review.)
- Only `server/jig/` runs `jig` or knows the shape of its output.
  (convention-jig-client. Checked in review: nothing outside `server/jig/` spawns `jig` or names
  Jig's fields; the only other `child_process` uses are `server/open-browser.ts` starting the
  system browser opener, `git rev-parse` and `git worktree list` in `server/source/` telling a main
  checkout from a worktree and finding a worktree's main checkout, and `git --exec-path` in `server/jig/` finding Git's bash on Windows.)
- The API and the page name projects by id; no path reaches `web/`.
  (adr-20261014-project-source-port-keeps-hosting-open. Checked by tests on the API responses.)
- The server binds 127.0.0.1 unless a guard other than the local token is in place, refuses a
  foreign `Host` or `Origin`, and refuses every API call without the token.
  (adr-20261014-local-server-access-guard. Checked by tests.)

## Rules

- Each JSON shape Jig exposes has a contract test over fixtures, and the package declares the
  minimum Jig version it reads. (spec `jig-ui`, stack.md. Checked by `jig verify`.)
- `jig` is spawned with `execFile` and no shell; on Windows through Git's bash.
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
- Code passes `npm run lint` — ESLint for correctness, Prettier for layout
  (convention-code-style. Checked by CI and a full `jig verify`.)
- Work that changes what a user sees or does updates the pages in `docs/` it affects.
  (spec `jig-ui`, roadmap. Checked in review.)
