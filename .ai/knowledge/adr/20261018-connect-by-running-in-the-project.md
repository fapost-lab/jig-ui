---
id: adr-20261018-connect-by-running-in-the-project
type: adr
status: accepted
date: 2026-10-18
domains: []
paths:
  - server/main.ts
  - server/source/checkout.ts
  - server/registry/instance.ts
summary: npx in a Jig project connects it through the serving instance; a worktree stands for its main checkout; silent elsewhere; no connect/disconnect subcommands
reviewed_at: 2026-10-18
---
# Running `npx @fapost/jig-ui` in a Jig project connects it, through the instance that serves

## Context

Connecting meant pasting an absolute path into the page, while the person starting Jig UI is usually
in the project's folder already. Decided by the maintainer on 2026-10-18 (spec `jig-ui`), built by
task `npx-connect`.

## Decision

- Run in a git checkout, the command asks the instance that serves — its own once it listens, the
  running one, or the winner of a start race — to connect the folder: `POST /api/projects` with the
  instance's token, as the page does. Only that instance writes `projects.json`.
- A worktree stands for its clone's main checkout, found with `git worktree list` (its first entry),
  and the terminal says so. A bare clone's worktree has none and connects nothing. The API keeps
  refusing a worktree path.
- Outside a Jig project — no git, no Jig, the API's `not-a-repository` and `no-jig` — the command
  says nothing and only starts. Any other refusal is printed and the start goes on.
- The link opens the project's board, `#/projects/<id>`: the token swap redirects to `/` with no
  fragment, so the browser keeps this one.
- There is no `connect` and no `disconnect` subcommand; disconnecting stays on the page.

## Alternatives

- An explicit `connect [path]` subcommand — a second word for the common case, when the folder
  already says which project is meant.
- Refusing a worktree as the page does — the page refuses because a pasted path may be a mistake;
  the terminal can name the main checkout itself.
- Connecting through the local source before listening — a start that loses the port race would
  write the registry beside the winner.
- `dirname(--git-common-dir)` for the main checkout — wrong for a worktree of a submodule
  (adr-20261017-registry-of-connected-projects rejected it for the same reason).

## Consequences

- Every start in a git checkout runs `git rev-parse` once, and in a Jig project one connect request.
- The command is a client of its own API; a change to `POST /api/projects` reaches it.
- Registering a project from `jig init`, without running Jig UI, stays open (spec `jig-ui`, fog).
