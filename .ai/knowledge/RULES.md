# Rules and Invariants

Normative requirements for this project. Rules say how work must be done; invariants say
what must always hold. Both are enforced in review and verification. Area-specific rules
are added as sections of this file.

## Invariants

- Jig UI never writes a file inside a connected project; every change is a `jig` command.
  (spec `jig-ui`; adr-20261014-jig-ui-is-an-optional-layer-over-jig. Checked in review: no file
  write outside the config directory.)
- Jig UI stores nothing but its project registry and interface settings, in the user's config
  directory, written atomically. (adr-20261014-local-server-access-guard. Checked in review.)
- A board column is computed from Jig's state on every read and never stored.
  (adr-20261014-board-columns-are-derived-from-jig-state. Checked in review.)
- Only `server/jig/` runs `jig` or knows the shape of its output.
  (convention-jig-client. Checked in review: no `child_process` and no Jig field names elsewhere.)
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
- No native dependencies; the published package carries the page already built.
  (adr-20261014-stack-vue-hono-sse-on-node. Checked in review of `package.json` and by CI.)
- Work that changes what a user sees or does updates the pages in `docs/` it affects.
  (spec `jig-ui`, roadmap. Checked in review.)
