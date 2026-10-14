---
id: convention-project-source
type: convention
status: active
domains: []
paths:
  - "server/source/**"
  - "server/board/**"
  - "server/task/**"
  - "server/live/**"
summary: "MAY/MUST/MUST NOT for the ProjectSource port: ids not paths, typed data, no files or processes leak"
---
# ProjectSource — how the server reaches a project

Not built yet: the paths match nothing until the first task writes them.

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

Callers (`board/`, `task/`, `live/`) depend on the port, never on `jig/` or `watch/` directly.

## Example

The local adapter answers "tasks of project `abc`" by asking JigClient to run Jig's task list
in the main checkout it holds for `abc`, and returns the typed rows. The board turns those rows
into columns; it never learns the path.

## Rationale

adr-20261014-project-source-port-keeps-hosting-open, adr-20261014-jig-ui-is-an-optional-layer-over-jig.
