---
id: feature-live-updates
type: feature
status: active
domains: []
paths:
  - "server/watch/**"
  - server/source/local.ts
  - web/api.ts
summary: Why the page follows projects by watching .ai/ and re-reading through Jig, what is ignored, and the measured debounce
reviewed_at: 2026-10-17
---
# Live updates

## What

While a page is open, the local adapter watches each connected project's `.ai/`
(`server/watch/watch.ts`), re-reads a changed project through Jig, and signals only when the new
read differs from what the page was shown. `GET /api/events` streams that signal ("project X
changed, revision R"); the page re-fetches what it shows (`onChange` in `web/api.ts`), and
everything after the stream reconnects. While followed, reads are answered from the last read, so
re-fetches and extra tabs run no Jig.

## Why

The revision alone cannot drive updates: Jig raises it on its own writes only, never on a pull, a
checkout or a hand edit (Jig's `schemas/json.md`). So the files are watched, and the read result
— not the event — decides whether anything changed: an event is never read as data.

## Constraints

- **Jig's reads write under `.ai/runtime/`** (Jig 0.29.0: `runtime/working/<task>`,
  `runtime/checkout`). Watching them makes every read trigger the next. `writtenByReads` in
  `server/jig/client.ts` names them and keeps `runtime/revision/` watched. Jig's contract does not
  name these paths: a Jig that moves them brings the loop back, and `local.test.ts`' stand-in Jig
  writes there on every call to catch it.
- **Debounce: 1 s quiet, 2 s longest wait, 60 s rescan.** Measured on 2026-10-17 (macOS, 3 real
  Jig clones, built server, one page): with a Jig write every ~0.6 s in each project, each project
  was read 26 times a minute (78 Jig runs) instead of once per write; with a write every 3 s,
  21 reads for 20 writes. The server process used ~0.4 s CPU a minute; each read runs Jig three
  times (version 0.03 s, `status --json` 0.4 s, `task list --json` 0.2 s), so three busy projects
  cost about 0.8 of a core in Jig. With no writes, no Jig ran between rescans. A 250 ms quiet time
  read once per write — three times the cost.
- **A torn read is kept back once.** `unreadable` or `incompatible` right after a good read is not
  shown; the next read is believed (convention-project-source).
- Watching runs only while a stream is open; no page, no watcher, no rescan. A page closes its
  stream while its tab is hidden and reopens it when shown, re-fetching everything on every open:
  browsers give one site six connections over HTTP/1.1, and a stream per tab would use them up
  (task `live-updates`, review F1). So with every Jig UI tab hidden, nothing is watched.

## Decisions and rejected alternatives

Task `live-updates` (2026-10-17), on adr-20261014-project-source-port-keeps-hosting-open (the
signal carries no data) and adr-20261014-stack-vue-hono-sse-on-node (SSE, `fs.watch` + rescan).

- Signal straight from the watcher, page reads through Jig — every tab runs Jig on every event,
  an agent's context cache reloads every page, torn reads reach the page.
- Watch `.ai/runtime/revision/` only, or poll the revision — miss git and hand edits.
- Watch every project from start — rescans with no page open, and every source built in a test
  would need closing.
- The stream lives in `server/http/` with the other routes, not in a `live/` module of its own:
  it is a dozen lines over `ProjectSource.subscribe`.
