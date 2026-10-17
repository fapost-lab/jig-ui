---
id: convention-watcher
type: convention
status: active
domains: []
paths:
  - "server/watch/**"
summary: "MAY/MUST/MUST NOT for the Watcher in server/watch: report that a tree changed, never what, never Jig"
reviewed_at: 2026-10-17
---
# Watcher — noticing that a project changed

## Practice

```
Watcher (server/watch/)
MAY:      watch one directory tree; debounce; report "something changed"
MUST:     ignore what its owner says to ignore; close every system watcher on close();
          turn a system watcher's error into one change, never a crash
MUST NOT: read a file's content, know Jig or a project id, run a process
Why:      an event is never read as data (stack.md); what changed is read through JigClient,
          so the Watcher can be dropped for a remote adapter without touching the rest.
```

Its one owner is the local adapter (`server/source/local.ts`), which passes JigClient's
`watchDir` and `writtenByReads`, so the Watcher learns nothing of Jig's layout. A directory that
is not there gives a Watch that is not `open`; the adapter's rescan starts another.

## Example

`watchTree(dir, { ignore, onChange })` — one recursive `fs.watch`, `onChange` 1 s after the last
event or 2 s after the first of a run that never goes quiet. Native on macOS and Windows; on Linux
Node walks the tree with one inotify watch per directory.

## Rationale

adr-20261014-stack-vue-hono-sse-on-node, adr-20261014-project-source-port-keeps-hosting-open; the
boundary was approved in task `live-updates`' design on 2026-10-17 (feature-live-updates).
