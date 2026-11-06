---
id: adr-20261106-editing-a-roadmap-from-the-page
type: adr
status: accepted
date: 2026-11-06
domains: []
paths:
  - server/source/local.ts
  - server/http/app.ts
  - web/views/BoardView.vue
  - web/components/SpecCard.vue
  - web/components/FileItemDialog.vue
summary: Roadmap edits from the page are jig spec item commands with the specs' revision, shown on the spec's write branch while they wait; filing an item's new task is two writes (amends two ADRs for it), none checked first, filed:true recovered by filing again
reviewed_at: 2026-11-06
---
# A roadmap is edited from the page on the spec's branch, and an item's task is filed in two writes

## Context

Phase 3 of spec `jig-ui` lets a person edit a spec's roadmap on the Specs view (task
`roadmap-from-page`): add an item to a phase, move an item, file an item's task. Jig 0.40.0 carries
it (fapost-lab/jig#362): `jig spec item add|move|file <spec> … --revision <n> --json`, item handles
(`id`) and the edits waiting on the spec's write branch (`waiting`) in `jig spec list --json`. Each
edit is committed by Jig on `spec/<id>` (or the open epic) in a tree of its own under the git
directory, and goes as far as `agent.git` allows; it never merges. Decided with the maintainer at the
design gate, 2026-11-06.

## Decision

- An edit is one `jig spec item` command with the revision of the specs the person saw
  (adr-20261022-writes-carry-the-revision-of-their-read), run only for what the adapter's last read
  shows — the spec, the phase and every item named, in the roadmap the page shows — else
  `refused: not-found` without Jig. Below `ROADMAP_JIG_VERSION` (0.40.0) the view is as before and a
  write is `refused: unsupported`.
- **The page shows the roadmap the next edit changes**: the one on the write branch while edits wait
  there (`waiting ?? spec`), with a line saying where they wait (the pull request, or "pushed, no pull
  request yet", or "committed in this clone, not pushed") and a "waiting" mark on each item that is
  new there, in another phase than on the base, or filed there.
- **Filing an item's task is two writes.** `jig task new` moves the clone's revision, so
  `spec item file` after it can never carry the person's revision. For a task id that is live, the
  adapter runs only `spec item file` with the person's revision. Otherwise it reads `jig config keys`
  and refuses `git-not-allowed` itself when `agent.git` is `none` (the default, where Jig refuses the
  second write); then `task new <id> --goal <g>`, a fresh revision from `queue list`, and
  `spec item file` with it. A refusal of the second write answers `refused` with `filed: true`; the
  page says the task was filed and that File task… again with the same id names it — which is the
  live-id path.
- The API checks an item's text against Jig's grammar (one non-blank line of at most 500 characters,
  not led by a backticked id and a dash, which Jig would read as filed to that id); Jig's `write.note`
  (whose step is next, a failed push) reaches the page as `note`, paths cut. Each edit has 60 s: it
  fetches, may push and ask the forge.
- Moves are the ⋯ menu's Up, Down and To Phase N — Jig has no `--before`, so Up is `--after` the item
  two above, or `--top` for the second; no drag.

For filing an item's new task alone, this amends two decisions; every other write, roadmap edits
included, stands as they say:

- adr-20261022-writes-carry-the-revision-of-their-read ("a write is one Jig command run by
  JigClient") — the filing is two writes, `task new` and `spec item file`, behind one request;
- adr-20261014-project-source-port-keeps-hosting-open ("writes are commands carrying the revision
  they were based on") — its second write carries a revision the adapter read after the first, not
  the person's. Naming a live task on an item carries the person's revision as every write does.

## Alternatives

- **The base roadmap, with the waiting edits as one line** — Jig resolves handles on the write
  branch; a person who does not see their last edit adds it twice or moves around it.
- **Filing in one write with the person's revision** — impossible while `task new` moves the
  revision. The root fix is one Jig command, `spec item file … --new <task> --goal <g>`
  (fapost-lab/jig#390); it supersedes the two-step filing when it lands.
- **Checking every refusal of the second write before `task new`** (a checkout on the branch, the
  base on origin) — more code and still racy; only `none`, the default, is checked first.
- **`jig writes ship` from the page** — each edit already goes as far as `agent.git` allows, and at
  `merge` Jig's known issue lets it merge an edit someone rejected.
- **Hiding the edits at `agent.git: none`** — the specs read does not carry the level; one more Jig
  run per read is not worth it, and the refusal names the fix (the project's Settings).

## Consequences

- An edit never moves the person's checkout; it waits in a pull request until it lands, and the page
  shows it waiting. A rejected edit is closed in the forge; Jig UI keeps nothing.
- Between the two writes of a filing, the item is guarded by its handle and Jig's own refusals
  (`already-exists`, `not-linkable`), not by the person's revision.
- With `spec/<id>` checked out in the person's clone (as `jig spec new` and `resume` leave it), every
  edit is refused `branch-checked-out` until they switch away.
