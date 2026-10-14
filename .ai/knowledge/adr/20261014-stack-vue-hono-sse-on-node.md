---
id: adr-20261014-stack-vue-hono-sse-on-node
type: adr
status: accepted
date: 2026-10-14
domains: []
paths:
  - package.json
  - "server/jig/**"
summary: Vue 3 + Vite, Hono + SSE on Node 24, one npm package started with npx @fapost/jig-ui
---
# The stack is Vue 3 + Vite on Hono with SSE, on Node.js 24, shipped as one npm package

## Context

The first users are developers with a terminal. Starting must be one command and installation
very simple; no native dependencies. `.ai/specs/jig-ui/stack.md`, decided with the maintainer on
2026-10-14.

## Decision

- Node.js 24 or later is a documented requirement the user installs; Jig UI does not bundle it.
- One npm package, `@fapost/jig-ui`, started with `npx @fapost/jig-ui`, ships the page already
  built. `server/` and `web/` live in it with shared types; npm and Vitest.
- Server: Hono on `@hono/node-server`, one process serving the JSON API, the live-update stream
  and the page. Live updates: Server-Sent Events; writes are ordinary HTTP requests.
- Page: Vue 3 with Vite. TypeScript on both sides.
- Watching: Node's recursive `fs.watch` on each project's `.ai/` plus a periodic rescan.
- Every write runs `jig` as a child process with `execFile`, no shell; on Windows through Git's
  `bash` running `.ai/scripts/jig` — Node refuses to spawn `jig.cmd` without a shell since the fix
  for CVE-2024-27980.

## Alternatives

- A git-clone installer like Jig's own — builds on the user's machine; returns only if `npx` is
  not simple enough. Unscoped `jig-ui` and `@jig` on npm are held by others.
- Node 22 — support ends in April 2027, likely before a release that waits on Jig's contracts.
- React + Vite, Svelte + Vite — no gap in Vue for the board; the concept named Vue.
- Fastify (heavier than the few routes), plain `node:http` (routing, statics and SSE by hand).
- WebSocket — a two-way channel the UI does not need.
- chokidar (a dependency, natively optional on macOS); polling alone (delay, `jig` on a timer).
- A pnpm workspace of several packages — a build of its own for one published package.

## Consequences

- Users without Node are out of scope until the installation fog item of the spec lifts.
- A per-change `jig` run costs a bash process; that cost is measured, not assumed (spec
  `jig-ui`, untested assumptions).
