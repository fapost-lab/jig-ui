---
id: adr-20261113-refresh-brings-the-clone-up-from-the-card
type: adr
status: accepted
date: 2026-11-13
domains: []
paths:
  - server/jig/client.ts
  - server/source/local.ts
  - server/http/app.ts
  - web/lib/refresh.ts
  - web/components/AttentionItem.vue
  - web/components/ProjectCard.vue
  - web/views/WorkspaceView.vue
  - web/lib/knowledge.ts
summary: Refresh on a project's card runs jig refresh only when pressed — on Jig's base-behind-origin item and beside a fetch more than a day old —, through writing() with no revision, answering the outcome without git's messages or paths in the page's words; knowledge origin decided already is not offered
reviewed_at: 2026-11-13
---
# Refresh on a project's card brings the clone up to origin through `jig refresh`, only when pressed, and the page says the outcome in its own words

## Context

Jig's reads never reach the network, so everything the page shows is as of the clone's last fetch. On 2026-11-12
fapost-lab/core#346 merged, and the page went on showing its four knowledge sources as waiting, then offered to decide
them again (spec `jig-ui`, "the clone kept in step"). Jig 0.45.0 gives a UI three things for this:
- `jig refresh --json`: a fetch as the clone's own account, then a fast-forward of the base that never moves the
  person's checkout or touches their changes, and Jig's own writes that are over closed. A base that cannot move is an
  answer (`blocked-by-changes`, `checked-out-elsewhere`, `diverged`, `missing`), not a failure.
- `origin` (`fetched_at`, `behind`, `ahead`) in `jig status --json`, and the item `base-behind-origin`, whose `todo` is
  the text `jig refresh`.
- `reason: landed` on a knowledge record that origin's base decided already.

The maintainer asked for a button on that item, from a screenshot of it (2026-11-13, task `clone-in-step`).

## Decision

- **Refresh** is on the `base-behind-origin` item of a project's card, as **Close task** is on a merged task's item.
  When the clone last fetched more than a day ago (`staleFetch` in `web/lib/refresh.ts`), the card also has a line
  saying how long ago that was, with **Refresh** beside it unless Jig's item already has one. Neither is shown while
  the project's upgrade runs.
- **Only when pressed.** Jig UI never runs a refresh on its own: not when the page opens, and not on a timer. This was
  the maintainer's choice on 2026-11-13. The fetch reaches origin as the clone's account through `gh`, whose token is
  in the macOS keychain, so a run nobody pressed could put up a keychain dialog. The roadmap item's "also run when the
  page opens, at most once in a while" was dropped for this.
- `POST /api/projects/:id/refresh` goes through `ProjectSource.refresh(id)` and the adapter's `writing()`, as
  Housekeeping does (adr-20261110-housekeeping-runs-from-the-project-card):
  - It carries no revision and names no live id, because it changes nothing the person decided.
  - It is refused `unsupported` below Jig 0.45.0 without running Jig, `upgrading` while the upgrade runs, and `timeout`
    after 2 minutes.
  - It answers `200 { refreshed }` once the project was read again.
- **The answer holds no git message and no path.** `refreshed` keeps the outcomes, the base's name and commits, and the
  writes closed. It drops `base.message` and `fetch.message`, which are git's own text and name files or a command,
  and `checked_out_in`, which is a worktree's path (RULES: no path reaches `web/` beyond the listed ones).
  `refreshReport` puts each outcome into the page's words. The tone is `attention` when the fetch did not reach origin
  or the base stayed where it was.
- **A knowledge record origin already decided is not offered.** For `reason: landed` the Knowledge view says
  "Decided on origin already", in the quiet tone, and shows no Accept, Reject, Keep or Drop (`landed` in
  `web/lib/knowledge.ts`). It does not promise that Refresh clears it: Jig judges `landed` on the checkout's HEAD
  against `origin/<base>`, and Refresh moves the base without moving a checkout that is on another branch. This
  amends adr-20261109-knowledge-text-and-drop-from-jig-0-41 ("`decidable: false` is said above the buttons, which
  stay") for `landed` alone: there no decision is owed, and one sent would be refused.

## Alternatives

- **Run it when the page opens, at most once an hour per project**, as the roadmap item first said. The maintainer
  rejected it on 2026-11-13: a keychain dialog nobody asked for.
- **Jig UI running `git fetch` or `git pull` itself.** RULES lets Jig UI change a project only through `jig`, and the
  spec rejects it.
- **Passing git's message to the page.** It names files, a worktree's path, or a git command to type, and the item
  asks for words.
- **A third button in every card's header, beside Housekeeping and Board.** The person sees **Refresh** where the
  page says the clone is behind or old, and the maintainer drew it there.

## Consequences

- Each press may put up the keychain dialog, and the run waits for it up to its 2 minutes, as Housekeeping's does.
- A fetch from a terminal is seen by the next read like any other change. The page does not fetch to find out.
- A new `base.outcome` or write `reason` from a later Jig fails the answer (`incompatible`) rather than showing a wrong
  line: the schema names Jig's words.
- Undo: revert the merge; nothing is stored. A fast-forward is undone with `base.from`, which the answer keeps.
