---
id: convention-project-source
type: convention
status: active
domains: []
paths:
  - "server/source/**"
  - "server/board/**"
summary: "MAY/MUST/MUST NOT for the ProjectSource port: ids not paths, typed data, no files or processes leak"
reviewed_at: 2026-10-18
---
# ProjectSource — how the server reaches a project

## Practice

```
ProjectSource (server/source/)

MAY:      read a project's tasks, specs, attention items and legal actions; subscribe to
          "project changed, revision R"; send a command with the revision it was based on
MUST:     name projects by id; return typed data, never Jig's raw output; report a refusal by
          Jig's failure code; keep the last good read when a read fails mid-write
MUST NOT: expose a path, a file or a child process to its callers; write a project file;
          compute a board column or a legal action itself
Why:      a later remote adapter (a connector on the projects' machine) must fit behind the
          same port; anything a caller learns about directories or processes breaks that.
```

Callers (`board/`, and `http/` for task details and the change stream) depend on the port, never on `jig/` or `watch/` directly.

The port is `ProjectSource` in `server/source/project-source.ts` — the workspace, a project's
live tasks (`tasks(id)`, for the board), one live task in full (`task(id, taskId)`), its specs
(`specs(id)`), connect,
disconnect, and `subscribe` to changes; its local adapter
`localSource(configDir)` in `local.ts` holds the registry, so `http/` never sees a stored path —
only the path a person types to connect. A read that fails becomes a state of the project, not an
error of the workspace: `unreadable` with Jig's failure code and never its message (it may name a
path), `incompatible` when Jig answered in a shape JigClient does not read. A task's details carry no
worktree path and only the actions Jig offers — a refused action's reason is Jig's text and may
name a path (feature-task-details). Either one right after a good
read is held back once — the last good read stays — and believed the second time.

`subscribe(listener)` returns the unsubscribe. The local adapter follows projects only while
someone listens: a Watcher per project (convention-watcher) and a rescan every minute; each change
re-reads the project, and the listener hears `{ id, revision }` only when the read differs from
the last one — connect and disconnect included. Meanwhile `workspace()`, `tasks(id)`, `task(id, taskId)` and `specs(id)` answer
from that last read (feature-live-updates) — a read made in this following, never one that
finished after the last listener left (task `specs-and-epics`: the next listener was served it).

## Example

The local adapter answers "tasks of project `abc`" by asking JigClient to run Jig's task list
in the main checkout it holds for `abc`, and returns the typed rows. The board turns those rows
into columns; it never learns the path.

## Rationale

adr-20261014-project-source-port-keeps-hosting-open, adr-20261014-jig-ui-is-an-optional-layer-over-jig.
