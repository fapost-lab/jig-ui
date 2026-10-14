---
id: adr-20261014-local-server-access-guard
type: adr
status: accepted
date: 2026-10-14
domains: []
paths:
  - "server/http/**"
  - "server/registry/**"
summary: 127.0.0.1 with Host/Origin checks, a per-start token, one instance, registry in the user's config dir
---
# The local server is reachable only from the user's browser on this machine

## Context

The server runs `jig` in the user's projects. Another site open in the browser (cross-site
requests, DNS rebinding) or another user on the machine must not be able to drive it.
`.ai/specs/jig-ui/stack.md`, decided with the maintainer on 2026-10-14.

## Decision

- The server listens on 127.0.0.1 by default and refuses a request whose `Host` or `Origin` is not
  that local address. No CORS.
- Each start makes a random token. The browser is opened on a link that carries it, the server
  swaps it for a cookie, and every API call without it is refused.
- One instance: a fixed default port, changed by a flag. The running instance records its port and
  token in the config directory; a second start checks that the instance answers with that token,
  opens the browser on it and exits.
- The registry and settings live in `$XDG_CONFIG_HOME/jig-ui/`, else `~/.config/jig-ui/`;
  `%APPDATA%\jig-ui\` on Windows. Only Jig UI writes them, atomically.

## Alternatives

- Localhost with `Host`/`Origin` checks alone — a bookmark always works, but any local process can
  drive every connected project.
- A new process on a free port per start — two servers watch the same files and write one
  registry.
- `~/.jig-ui/` on every system — against each system's convention.

## Consequences

- The token does not keep out processes of the same user, agents included: they can read it. They
  can run `jig` in those projects directly anyway; the guard claims no more than that.
- A bookmark of the page stops working after a restart; the start command reopens it.
