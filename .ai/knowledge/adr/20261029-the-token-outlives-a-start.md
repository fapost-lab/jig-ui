---
id: adr-20261029-the-token-outlives-a-start
type: adr
status: accepted
date: 2026-10-29
domains: []
paths:
  - server/registry/token.ts
  - server/main.ts
  - "server/http/**"
summary: The token is kept in the config dir across starts; reset-token forgets it; the Host/Origin guard is unchanged
---
# The access token is kept across starts until the user resets it

## Context

adr-20261014-local-server-access-guard made a new token at every start. With `jig-ui start` and
`stop` (background mode) a restart is routine, and every page left open then answered 401 — "this
page's session has ended" — while `start` did not even open a new one. Decided with the maintainer
at the gate of task `token-survives-restart`, 2026-10-29: Jig UI starts only on this machine and
reads only its files, so a token kept on disk exposes nothing that a per-start token kept out.

## Decision

- The token lives in `token` in the config directory (0600). A start reads it. When there is none,
  the start creates the file with a hard link from a temporary file, which lands whole or fails if
  the file exists, and then reads it: of two starts at once, both use the token of the one that
  created it. A file that is empty or not 43 characters of base64url is replaced atomically.
- Stopping removes `instance.json` and `open.html`, never `token`. Since every start shares the
  token, an instance tells its own `instance.json` from a later one's by token and pid. The token
  is still recorded in `instance.json`, so the probe and `stop` are unchanged, and it is never a
  process argument: `serve` reads the file itself.
- `jig-ui reset-token` deletes the file: the next start makes a new token and every page holding the
  old one is refused. It does not restart a running instance — that would cut short an upgrade it
  runs — and says that the running one keeps the old token until it stops.
- The cookie stays a session cookie: access in the browser still ends when the browser closes.
- Everything else of the access guard stands: 127.0.0.1 only, `Host`/`Origin` checks, every `/api/*`
  call refused without the cookie.

## Alternatives

- Keep a token per start and only have `start` open the browser — the access model is untouched, but
  every open page still dies at each restart, which is what the task set out to fix.
- Accept the previous start's token for a while after a restart — that token has to be stored on
  disk anyway, at more complexity than keeping one.
- A long-lived cookie (`Max-Age`) — extends access past the browser session, which nobody asked for.

## Consequences

- What keeps other sites out does not depend on the token's lifetime: the server listens on
  127.0.0.1 only, refuses a foreign `Host` or `Origin`, and the cookie is `SameSite=Strict` and
  `httpOnly`. A persistent token does not weaken any of these.
- A link with `?token=` stays valid until a reset instead of until a restart: one left in terminal
  scrollback or browser history keeps working. Only a process on this machine can use it, and
  processes of the same user could read the token before as well. `reset-token` is the remedy.
- A bookmark of the page keeps working across restarts while the browser stays open; the consequence
  "a bookmark stops working after a restart" of adr-20261014-local-server-access-guard no longer holds.
