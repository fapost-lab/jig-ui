---
id: adr-20261110-a-taken-id-is-told-by-the-finished-tasks
type: adr
status: accepted
date: 2026-11-10
domains: []
paths:
  - server/http/app.ts
  - web/lib/refusal.ts
summary: A filing's new id refused already-exists is said to be a finished task's, with the id field marked, when Jig's list of finished tasks holds it; otherwise Jig's line is shown (amends adr-20261110-filing-an-items-task-in-one-write-from-jig-0-41)
reviewed_at: 2026-11-10
---
# A filing's new id that Jig refuses `already-exists` is told taken by Jig's list of finished tasks, not by its words

## Context

adr-20261110-filing-an-items-task-in-one-write-from-jig-0-41 shows every `already-exists` on a
filing in Jig's own line. From Jig 0.41.0, `spec item file --new` refuses `already-exists` in two
cases. The id may be a task's already. Or the item may already name a task on its branch, for
example one filed in another clone. Jig checks the item first. The page marked the id field invalid
on both. It also no longer said why an id the board does not show is taken.

Jig's contract tells a program to act on `error.code`, never on the message. On the `--new` path
the id is not live, since the dialog names a live id with `--task`. Jig checks the revision before
anything else, so a task filed since the person's read is refused `stale-revision`. A taken id there
is therefore a finished task's, and Jig lists those tasks (`finished`).

## Decision

- The `items/file` route reads `source.finished` when a filing with a goal is refused
  `already-exists`. When the list holds the id, the refusal carries `taken: true` along with Jig's
  reasons.
- With `taken`, the page says "The project has a finished task called X. Choose another id." and
  marks the id field (`fileItemRefusal`). Any other `already-exists` is shown in Jig's line, with no
  mark on the field.
- The read runs on that refusal only. When it fails, the refusal is Jig's line, as before.

This amends adr-20261110-filing-an-items-task-in-one-write-from-jig-0-41 where it shows
`already-exists` in Jig's line. The rest of that ADR stands.

## Alternatives

- **Matching Jig's message in `server/jig/`.** That is fewer lines, but it acts on the words, which
  Jig's contract forbids. A rewording in Jig would break it silently.
- **No mark when Jig gives its line.** That would lose the mark, and the reason, in the common case:
  a finished task's id.
- **A distinct code from Jig for an item already filed.** That is the root fix, and it is Jig's to
  make. Once Jig has it, the read is not needed.

## Consequences

- A refused filing can cost two more Jig reads, the finished tasks' `task list`s, on this refusal
  only.
- When both cases hold, the id is a finished task's and the item names a task. The page then asks
  for another id, and the next try shows Jig's line about the item.
- An id whose task Jig keeps but does not list as finished, such as an archived one, gets Jig's
  line with no mark.
