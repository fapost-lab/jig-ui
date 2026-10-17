---
id: adr-20261017-registry-of-connected-projects
type: adr
status: accepted
date: 2026-10-17
domains: []
paths:
  - server/registry/projects.ts
  - server/source/checkout.ts
summary: projects.json of {id, path}, slug ids, unreadable registry kept, worktree told by git-dir vs common-dir, old Jig connected as unsupported
reviewed_at: 2026-10-17
---
# The registry is `projects.json` of `{id, path}` rows, kept even when unreadable, and connects a project whatever its Jig version

## Context

Connecting a project is the first data Jig UI owns (adr-20261014-jig-ui-is-an-optional-layer-over-jig).
Every merge publishes a prerelease, so the file's shape reaches users' config directories with the
first release and later code must keep reading it. Ids appear in the board's URLs and in the live
signal. Task `project-registry`, design approved by the maintainer on 2026-10-17.

## Decision

- The registry is `projects.json` in the config directory: `{"projects": [{"id", "path"}]}`, in the
  order projects were connected, written atomically through `writeConfigFile`. Nothing else is
  stored: Jig's version and a project's state are read on every request.
- `path` is the realpath of the clone's main checkout. A path inside it connects the checkout's
  root; a worktree is refused. A clone is a main checkout when `git rev-parse --git-dir` and
  `--git-common-dir` name the same directory — true for submodules and `--separate-git-dir`
  clones, false only for a worktree.
- The id is the checkout's directory name as a slug — NFKD without diacritics, lowercase, every run
  of other characters one `-`, `project` when nothing is left — with `-2`, `-3`… when taken. It never
  changes while the project stays connected; connecting the same checkout again returns it.
- A registry that exists but cannot be read is refused — reads and writes report
  `registry-unreadable` — and never overwritten.
- A project whose Jig is older than `MIN_JIG_VERSION` is connected and shown as `unsupported`, not
  read; `jig upgrade` in the project makes it readable without connecting it again. A repository
  without `.ai/scripts/jig` is refused.

## Alternatives

- Treating an unreadable registry as empty, as `instance.json` is — the next connect would silently
  erase the person's list; `instance.json` can be lost, the list cannot.
- An id that is a hash of the path — stable and collision-free, unreadable in a URL.
- Storing Jig's version or the state in the registry — a stale cache beside the source of truth.
- Refusing a project below the minimum Jig at connect — the person would connect it again after
  `jig upgrade`.
- Telling a worktree by `dirname(--git-common-dir) == --show-toplevel` — refuses submodules and
  `--separate-git-dir` clones as worktrees (review finding F1).
- Reading the `.git` file instead of running git — a branch of code per layout (submodules,
  relative `gitdir:`), where git already answers.

## Consequences

- The shape grows only by adding fields; changing what `id` or `path` means needs reading the old
  file.
- An id may differ after a disconnect and a reconnect, if another project took it meanwhile.
- `GET /api/projects` runs `jig --version` in every project on every request; caching belongs to
  the live updates item.
