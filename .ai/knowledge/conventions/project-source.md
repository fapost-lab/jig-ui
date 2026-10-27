---
id: convention-project-source
type: convention
status: active
domains: []
paths:
  - "server/source/**"
  - "server/board/**"
summary: "MAY/MUST/MUST NOT for the ProjectSource port: ids not paths, typed data, no files or processes leak"
reviewed_at: 2026-10-27
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
live tasks and the finished ones Jig still keeps (`tasks(id)`, for the board), one live task in full (`task(id, taskId)`), its specs
(`specs(id)`), connect,
disconnect, `subscribe` to changes, and the writes `move(id, taskId, place, revision)`,
`prioritise(id, taskId, priority, revision)`, `requestPause(id, taskId, revision)`,
`cancelPause(id, taskId, revision)`, `resume(id, taskId, revision)` and `fileTask(id, taskId, goal)`, which answer `written`, `refused` with Jig's code,
or the project's state when it is not `ready`; and the upgrade of a project's Jig — `planUpgrade(id)`,
`upgrade(id)`, which answers `started` before Jig has run, and `dismissUpgrade(id)`; its local adapter
`localSource(configDir)` in `local.ts` holds the registry, so `http/` never sees a stored path —
only the path a person types to connect. A read that fails becomes a state of the project, not an
error of the workspace: `unreadable` with Jig's failure code and never its message (it may name a
path), `incompatible` when Jig answered in a shape JigClient does not read. A task's details carry no
worktree path and only the actions Jig offers — a refused action's reason is Jig's text and may
name a path (feature-task-details). Either one right after a good
read is held back once — the last good read stays — and believed the second time; while following,
only a read this following showed is kept, so a torn first read of a following is believed.

`subscribe(listener)` returns the unsubscribe. The local adapter follows projects only while
someone listens: a Watcher per project (convention-watcher) and a rescan every minute; each change
re-reads the project, and the listener hears `{ id, revision }` only when the read differs from
the last one, and for a project connected or disconnected — one another Jig UI registered too,
by the next sweep. The reads that start a following signal nothing: a subscriber reads what it
needs once its subscription is open, and is told only of changes after that (task `review-fixes`:
those signals made every page read everything two or three times). Meanwhile `workspace()`, `tasks(id)`, `task(id, taskId)` and `specs(id)` answer
from that last read (feature-live-updates) — a read made in this following, never one that
finished after the last listener left (task `specs-and-epics`: the next listener was served it).

A write runs Jig only when the task, and a move's anchor, are live in the last read the adapter
showed — anything else is `refused: not-found` without Jig — and answers after the project is
read again (adr-20261022-writes-carry-the-revision-of-their-read). A board's `revision` is the
lowest of its reads' revisions (status, task list, queue). `fileTask` is the exception: its id is
new, so it names no live task and carries no revision; `http/` checks the id and the goal against
Jig's grammar before the port sees them (adr-20261022-filing-a-task-carries-no-revision).

An upgrade is offered only for a project whose last read carries Jig's `upgrade-available` item
(else `refused: not-found`), one at a time (`refused: running`). Its run — `running`, then `done`
with Jig's answer or `refused` with Jig's code and, for `upgrade-blocked`, Jig's reasons — lives in
the adapter's memory on the project's entry and goes out on the workspace read as `upgrade`; the
listeners hear it at the start and at the end. Those reasons are the one text of Jig's the port
passes on; JigClient has cut their paths. While it runs the adapter runs no other Jig in the
project: a read is skipped and the last one stays — kept by `stop()` too, so a new subscription does
not read it — and a write is `refused: upgrading` without Jig; the run itself starts once the reads
and writes under way have ended. `disconnect` answers `upgrading` meanwhile. Upgrade starts and
disconnects run one at a time, so of two sent at once the second finds what the first did. It reads
the project once the run ends (adr-20261027-upgrading-a-project-runs-in-the-background).

## Example

The local adapter answers "tasks of project `abc`" by asking JigClient to run Jig's task list
in the main checkout it holds for `abc`, and returns the typed rows. The board turns those rows
into columns; it never learns the path.

## Rationale

adr-20261014-project-source-port-keeps-hosting-open, adr-20261014-jig-ui-is-an-optional-layer-over-jig.
