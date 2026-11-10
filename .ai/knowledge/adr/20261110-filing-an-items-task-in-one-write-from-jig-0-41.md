---
id: adr-20261110-filing-an-items-task-in-one-write-from-jig-0-41
type: adr
status: accepted
date: 2026-11-10
domains: []
paths:
  - server/source/local.ts
  - server/jig/client.ts
  - web/components/FileItemDialog.vue
  - web/lib/refusal.ts
summary: From Jig 0.41.0 File task… files a roadmap item's new task and names it in one jig spec item file --new write with the person's revision, a refusal filing nothing; the two-step filing stays below 0.41.0 (amends adr-20261106-editing-a-roadmap-from-the-page)
reviewed_at: 2026-11-10
---
# From Jig 0.41.0 an item's new task is filed and named in one write, with the revision the person saw

## Context

adr-20261106-editing-a-roadmap-from-the-page filed a roadmap item's new task in two writes: `jig
task new`, then `jig spec item file --task` with a revision the adapter read between them.
`task new` moves the clone's revision, and Jig 0.40.0 had no command doing both. That ADR named the
root fix, `spec item file … --new <task> --goal <g>` (fapost-lab/jig#390), and said it would
supersede the two-step filing once it landed. Jig 0.41.0 has it (task `file-item-in-one-write`,
tried on a scratch project on 2026-11-10):

- `jig spec item file <spec> <item> --new <task> --goal <text> --revision <n> --json` files the task
  and names it on the item in one commit on the spec's branch. It answers in the shape `--task` does.
- Jig checks everything before it writes anything. At `agent.git: none` the command is refused
  `git-not-allowed`, at an older revision `stale-revision`, and in both cases no task is filed. A
  failure after the commit is Jig's `note`, not a refusal.
- `write-still-waits` refuses a roadmap edit while an earlier one still waits where this one cannot
  follow.

## Decision

- From `FILE_NEW_JIG_VERSION` (0.41.0), **File task…** with an id that is not live is one write,
  `fileNewItem`. It carries the revision of the specs the person saw. The adapter neither reads
  `agent.git` first nor files the task itself, and a refusal never carries `filed`.
- A live task id is named with `--task`, as before. Below 0.41.0 the two writes stay as
  adr-20261106-editing-a-roadmap-from-the-page has them, `filed: true` included.
- The dialog's hint holds on both versions: Jig files the task and names it on the item with
  `jig spec item file`. No flag tells the page which Jig the project runs.
- `already-exists` on a filing is shown in Jig's own line (`fileItemRefusal`). From 0.41.0 it has
  two meanings: the id is taken, or the item already names a task on its branch, for example one
  filed in another clone and pushed but not fetched here. Jig's line says which one, and its
  contract tells a program to act on the code, never on the words.
- `write-still-waits` reaches the page by its code, with Jig's line. Its code came in with
  adr-20261109-knowledge-text-and-drop-from-jig-0-41.

From 0.41.0 the filing of an item's new task is one Jig command carrying the revision it was based
on. For it, adr-20261106-editing-a-roadmap-from-the-page no longer amends
adr-20261022-writes-carry-the-revision-of-their-read or
adr-20261014-project-source-port-keeps-hosting-open.

## Alternatives

- **Superseding adr-20261106-editing-a-roadmap-from-the-page.** It still decides the rest of
  roadmap editing, and the filing on Jig 0.40.0. Once superseded, `jig context` would stop handing
  it to agents.
- **Keeping the two writes on 0.41.0.** They still work, because the adapter reads the revision
  again between them. But they are the amendment jig#390 was filed to end: the filing ignores
  changes the person did not see, and a refused naming leaves a task filed with no item.
- **A flag in the specs read for the dialog's hint.** One more field for one sentence. The docs say
  which Jig runs which commands.

## Consequences

- From 0.41.0 a filing is refused `stale-revision` when the project changed since the specs were
  read, as every other roadmap edit is. The page reads the specs again, and the person files again.
- A refused filing leaves nothing to tidy up: no task is left without its item.
- The two-step filing of adr-20261106-editing-a-roadmap-from-the-page, its `agent.git` check and
  `filed` now hold only below 0.41.0.
