---
id: convention-project-source
type: convention
status: active
domains: []
paths:
  - "server/source/**"
  - "server/board/**"
summary: "MAY/MUST/MUST NOT for the ProjectSource port: ids not paths, typed data, no files or processes leak"
reviewed_at: 2026-11-10
---
# ProjectSource — how the server reaches a project

## Practice

```
ProjectSource (server/source/)

MAY:      read a project's tasks, specs, attention items and legal actions; subscribe to
          "project changed, revision R"; send a command with the revision it was based on
MUST:     name projects by id; return typed data, never Jig's raw output — but housekeeping's
          report, Jig's text a line each with its paths cut, which the page shows and never reads
          (adr-20261110-housekeeping-runs-from-the-project-card); report a refusal by
          Jig's failure code; keep the last good read when a read fails mid-write
MUST NOT: expose a path, a file or a child process to its callers — but `scan`'s findings, below,
          a task's documents as written (adr-20261030-a-task-document-is-shown-as-written), and
          the knowledge's paths relative to the project, a linked file's diff, and a proposed
          document's text with the file a stub links (adr-20261106-knowledge-decisions-from-the-page,
          adr-20261109-knowledge-text-and-drop-from-jig-0-41);
          write a project file; compute a board column or a legal action itself
Why:      a later remote adapter (a connector on the projects' machine) must fit behind the
          same port; anything a caller learns about directories or processes breaks that.
```

```
ProjectSource.scan(folder?)

MAY:      list folders under `folder`; tell a main checkout with Jig by its `.git` directory and
          Jig's script
MUST:     answer only `folder` and paths under it, with `~` for the home folder; say what it
          skipped and where it stopped
MUST NOT: run Jig or git; read or write a file in a project; follow a symbolic link; connect
          anything
Why:      a scan is pressed on a folder of the person's choosing, before any project in it is
          trusted: running a project's Jig is what connecting consents to
          (adr-20261029-finding-projects-shows-their-paths).
```

Callers (`board/`, and `http/` for task details and the change stream) depend on the port, never on `jig/` or `watch/` directly.

The port is `ProjectSource` in `server/source/project-source.ts` — the workspace, the connected ids
(`connected()`, read from the registry without running Jig) and one project as the workspace shows it
(`project(id)`), for a page that lists the projects before their reads land, a project's
live tasks and how many finished ones Jig still keeps (`tasks(id)`, for the board), those finished tasks (`finished(id)`,
read through Jig at each call and kept nowhere, so a failure stays its own answer and never becomes the project's state), one live task in full (`task(id, taskId)`), a task's documents (`artifacts(id, taskId)`, and one as it
is written, `artifact(id, taskId, kind)`, read through Jig at each call), its specs
(`specs(id)`), its settings (`settings(id)`, as `jig config keys` lists them with a revision of their own,
read through Jig at each call), `readAgain(id)` — the project read through Jig now, for a person's Read again — `scan(folder?)`, the
Jig projects under a folder — the source's own home folder when none is given — by path — connect,
disconnect, `subscribe` to changes, and the writes `move(id, taskId, place, revision)`,
`prioritise(id, taskId, priority, revision)`, `moveEpic(id, specId, place, revision)` and
`prioritiseEpic(id, specId, priority, revision)` — a spec's open epic, among the top level of the
queue — `requestPause(id, taskId, revision)`,
`cancelPause(id, taskId, revision)`, `resume(id, taskId, revision)`, `fileTask(id, taskId, goal)`, `housekeeping(id)` —
Jig's report on `written` as `report` —, and
`setSetting(id, key, value, revision)` and `unsetSetting(id, key, revision)` — the person's own keys, always
`--local` —, and a spec's roadmap edits `addItem(id, specId, phase, text, revision)`,
`moveItem(id, specId, item, place, revision)` and `fileItem(id, specId, item, taskId, goal, revision)`, and the
knowledge waiting for a decision — `knowledge(id)`, with a revision of its own and whether the project's Jig
reads a document's text and drops a link (`canRead`, `canDrop`), a linked file's diff `knowledgeDiff(id, doc)`
and a proposed document's text `knowledgeText(id, doc)`, read through Jig at each call, and the write
`decideKnowledge(id, doc, decision, revision)` —,
which answer `written` — with Jig's `note`, paths cut, where a roadmap edit carries one —, `refused` with Jig's code,
or the project's state when it is not `ready`; and the upgrade of a project's Jig — `planUpgrade(id)`,
`upgrade(id)`, which answers `started` before Jig has run, and `dismissUpgrade(id)`; its local adapter
`localSource(configDir)` in `local.ts` holds the registry, so `http/` never sees a stored path —
only the path a person types to connect or to look through, and a scan's answer. A read that fails becomes a state of the project, not an
error of the workspace: `unreadable` with Jig's failure code and never its message (it may name a
path), the code `timeout` when Jig did not answer within the read limit, its version read included; `incompatible` when Jig answered in a shape JigClient does not read. A task's details carry no
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
Jig's grammar before the port sees them (adr-20261022-filing-a-task-carries-no-revision). `housekeeping` is the other:
it names no task and acts on the clone as it is, under Jig's own lock
(adr-20261110-housekeeping-runs-from-the-project-card).

A roadmap edit runs Jig only for the spec, the phase and the item handles of the roadmap the last
read shows — the one on the spec's write branch while edits wait there — and below
`ROADMAP_JIG_VERSION` answers `refused: unsupported`; the specs read says which (`editable`).
`fileItem` with a live task id runs only `spec item file --task` with the person's revision. With a
new id, from `FILE_NEW_JIG_VERSION` it runs only `spec item file --new` with the person's revision,
and a refusal files nothing (adr-20261110-filing-an-items-task-in-one-write-from-jig-0-41). On Jig 0.40.0 it is the one write of two Jig writes: `agent.git`
read first (`none` is `refused: git-not-allowed` without Jig writing anything), `task new`, the
revision read again, `spec item file` with it; a refusal after the task was filed answers `refused`
with `filed: true`, and the same request again with the same id — now live — names it
(adr-20261106-editing-a-roadmap-from-the-page).

A knowledge decision reads the knowledge again first — no held read lists it — and runs Jig only for
an id that read lists open to the decision: `accept` and `reject` a proposal, `reviewed` a linked file
not `missing`, and from `KNOWLEDGE_TEXT_JIG_VERSION` `reject` a listed linked file too, which drops its
link — each with no decision waiting on it; anything else is `refused: not-found` without Jig. A record
Jig reads as not decidable now is still sent: Jig's write fetches first and judges it. A diff runs Jig
only for a file the sources read just before lists as `changed`, a text only for a document the
proposals read lists. Below Jig 0.41.0, Jig's own `not-found` on a decision the read allowed answers
`not-on-branch`, a code of Jig UI's own: the document is not on `knowledge/decisions`, cut from origin's
base; from 0.41.0 Jig says so itself, as `not-on-base` or `not-on-branch`. Below `KNOWLEDGE_JIG_VERSION`
the reads answer `unsupported` and a decision `refused: unsupported`; a text below
`KNOWLEDGE_TEXT_JIG_VERSION` is `unsupported` (adr-20261106-knowledge-decisions-from-the-page,
adr-20261109-knowledge-text-and-drop-from-jig-0-41).

An upgrade is offered only for a project whose last read carries Jig's `upgrade-available` item
(else `refused: not-found`), one at a time (`refused: running`). Its run — `running`, then `done`
with Jig's answer or `refused` with Jig's code and, for `upgrade-blocked`, Jig's reasons — lives in
the adapter's memory on the project's entry and goes out on the workspace read as `upgrade`; the
listeners hear it at the start and at the end. Those reasons, the plan's `wouldStop` and the
`manualSteps` of a plan or a run are Jig's own text, and JigClient has cut their paths. While it runs the adapter runs no other Jig in the
project: a read is skipped and the last one stays — kept by `stop()` too, so a new subscription does
not read it —, a task's documents, the settings and the finished tasks answer `unreadable: upgrading` and a write
`refused: upgrading`, all without Jig; the run itself starts once the reads, the on-demand reads and the writes under way
have ended. `disconnect` answers `upgrading` meanwhile. Upgrade starts and
disconnects run one at a time, so of two sent at once the second finds what the first did. It reads
the project once the run ends (adr-20261027-upgrading-a-project-runs-in-the-background).

## Example

The local adapter answers "tasks of project `abc`" by asking JigClient to run Jig's task list
in the main checkout it holds for `abc`, and returns the typed rows. The board turns those rows
into columns; it never learns the path.

## Rationale

adr-20261014-project-source-port-keeps-hosting-open, adr-20261014-jig-ui-is-an-optional-layer-over-jig.
