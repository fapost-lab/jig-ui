# Glossary

Canonical ubiquitous language for this project. One entry per term. Use the canonical
term in source code, database schema, APIs, documentation and commit messages.

Entry format:

```
## <Canonical Term>

One-sentence definition.

Informal synonyms: <words people say instead>.
Use in: source code, schema, API, documentation.
```


## Connected project

A Jig project registered in Jig UI by the path of its main checkout, and named by an id
everywhere else.

Informal synonyms: repo, clone, workspace (wrong: workspace is all connected projects).
Use in: source code, API, documentation.

## Main checkout

A clone's primary working tree, which lists every task of the clone; a worktree is never
connected.

Informal synonyms: root, main repo.
Use in: source code, documentation.

## Registry

Jig UI's list of connected projects, kept in the user's config directory; the only data Jig UI
owns besides interface settings.

Informal synonyms: project list, database (wrong: there is none).
Use in: source code, documentation.

## Workspace

All connected projects together, as the workspace dashboard shows them.

Informal synonyms: overview, all projects.
Use in: source code, API, documentation.

## Board

One connected project's tasks laid out in columns derived from Jig's state.

Informal synonyms: kanban.
Use in: source code, API, documentation.

## Column

A board lane computed from a task's Jig state; never stored.

Informal synonyms: status (wrong: status is one of Jig's fields the column is computed from).
Use in: source code, documentation.

## Request

A sticky ask from the page that Jig holds until it is honoured or cancelled — today a pause, which
a task takes at its next stage boundary; the card shows it with its age.

Informal synonyms: pending move.
Use in: source code, API, documentation.

## Queue

Jig's order of a project's work (`jig queue list`): tasks and epics by level — the top level, then
each open epic's — and position. A task is in it only once something placed it there; the board
orders each column by it.

Informal synonyms: backlog order, ranking.
Use in: source code, API, documentation.

## Priority

A task's urgency in Jig's queue, 0 (most) to 5, or none; shown on a card as `P0`…`P5`. Set
apart from its position: priority does not reorder the queue.

Informal synonyms: severity, importance.
Use in: source code, API, documentation.

## Revision

The version of a project's state a read came from; carried by the change signal and sent back
with every write, so a stale write is refused.

Informal synonyms: version, etag, hash.
Use in: source code, API.

## Conflict
A change from the page that Jig refused as `stale-revision`, shown as what changed on the board
between the read it was made on and the read after it.
Informal synonyms: stale write, collision.
Use in: source code, documentation.

## ProjectSource

The port through which the server reads and changes a connected project; the local adapter is
built from JigClient and Watcher.

Informal synonyms: provider, backend.
Use in: source code.

## JigClient

The module that runs `jig` and validates its JSON; the only code that knows Jig's shapes.

Informal synonyms: Jig adapter, CLI wrapper.
Use in: source code.

## Action

Something a person may do next with a task, as Jig decides it from the task's state, with the Jig
command that takes it; Jig UI shows the ones Jig offers, and from the board takes two of them
itself — a pause request and a resume.

Informal synonyms: legal move, button.
Use in: source code, API, documentation.
