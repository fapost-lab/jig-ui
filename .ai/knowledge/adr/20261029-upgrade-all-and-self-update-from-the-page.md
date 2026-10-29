---
id: adr-20261029-upgrade-all-and-self-update-from-the-page
type: adr
status: accepted
date: 2026-10-29
domains: []
paths:
  - server/source/local.ts
  - server/http/app.ts
  - server/jig/client.ts
  - web/views/WorkspaceView.vue
  - web/lib/upgrade.ts
summary: "Upgrade all and self-update from the page: self-update only after a confirmation; Upgrade all self-updates first when a release is out, then upgrades projects one at a time in the background; refused 409 while any upgrade runs; amends adr-20261027"
---
# The page updates this machine's Jig after a confirmation, and upgrades every project one at a time

## Context

adr-20261027-upgrading-a-project-runs-in-the-background let a card upgrade one project whose Jig
is older than the machine's (`upgrade-available`), and ruled out "upgrade all". In practice the
common case is the other one: a new Jig release is out, the machine and its projects are all on the
previous one, and Jig's `release-available` item says "jig self-update, then jig upgrade". The card
offered nothing, and the person upgraded each project in a terminal. The maintainer asked for an
Upgrade button on that card and one button for every project (task `upgrade-buttons`, 2026-10-29).

`jig self-update` is unlike every other command Jig UI runs: it touches no project but moves the
framework checkout that every project on the machine upgrades from (a `git pull --ff-only`, or a
checkout of the newest release tag). It prints text, not JSON.

## Decision

- **A self-update only after the person confirms it.** **Upgrade…** on a card whose project shows
  `release-available` and no `upgrade-available` opens a confirmation that says the machine's Jig is
  updated for every project; confirmed, `POST /api/self-update` runs `jig self-update` through the
  first connected project's Jig (which hands it to the machine's), answers once it ends — a git
  fetch, two minutes at most — and every project is read again. The card then asks for the dry run
  as before. Decided with the maintainer, 2026-10-29: the confirmation, not a separate machine-wide
  button.
- **Upgrade all.** `POST /api/upgrade-all` answers `202` at once; in the server's background it
  self-updates first when any project shows `release-available` (a failure stops it before any
  project), then runs `jig upgrade` in each connected project that shows `upgrade-available`, in
  registry order, awaiting each before the next. Unreadable and up-to-date projects are skipped.
  There is no dry run per project: the page's confirmation lists the projects instead, and each
  card shows what its run came to — `upgrade-blocked` reasons included — as a single upgrade does.
- **One upgrade at a time on the machine.** While a self-update or Upgrade all runs, a project's
  `upgrade`, `planUpgrade`, another self-update and another Upgrade all are refused `409 running`
  at once, never queued; Upgrade all and a self-update are refused while any project upgrades.
- **State in memory, on the workspace read.** `GET /api/workspace` carries `machine: { selfUpdate,
  upgradeAll }` — running, then what it came to — kept until `DELETE /api/upgrade-all` or a restart.
  Listeners hear a change through every followed project's signal.
- **No path reaches the page.** Jig's self-update line and its error lines go through `withoutPaths`.

This amends adr-20261027-upgrading-a-project-runs-in-the-background — its "one project at a time;
no upgrade all" and, for Upgrade all only, its "plan first" — and every other line of it stands for
each project's run. adr-20261014-jig-ui-is-an-optional-layer-over-jig stands: the self-update writes
no file in a connected project; it changes the Jig installed on the machine, as the same command in
a terminal does.

## Alternatives

- A separate "Update Jig on this machine" button, Upgrade on cards only after it — rejected by the
  maintainer: two places to look, and the card the person is reading would still offer nothing.
- Self-update without a confirmation — it changes what every project upgrades from, outside any
  project the person picked.
- Upgrade all with a dry run per project and a second confirmation each — as many clicks as doing
  them one by one; Jig refuses a blocked upgrade itself with its reasons, which the card shows.
- Upgrades side by side — each `jig upgrade` may wait minutes for CI, but several at once compete
  for the person's credentials prompts and make a failure hard to follow.
- Running self-update through the global `jig` on PATH directly — the project's Jig already finds
  and hands over to it, and only `server/jig/` runs Jig.

## Consequences

- Jig UI can now change the machine's Jig. A wrong release is undone with `git checkout v<old>` in
  the framework checkout; nothing in a project changes until its own upgrade.
- A dry run a card asked for just before a self-update started is not waited for: the framework
  checkout may move under it. The window is a few seconds, and the run that follows plans again.
- `jig self-update` needs `jig` on the PATH of Jig UI's process, as in a terminal.
- A project unreadable at the moment Upgrade all reads it (a slow read past the timeout) is left
  alone; its card and the summary line say so, and the person upgrades it later.
