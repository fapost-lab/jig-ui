---
id: adr-20261027-upgrading-a-project-runs-in-the-background
type: adr
status: accepted
date: 2026-10-27
domains: []
paths:
  - server/source/local.ts
  - server/http/app.ts
  - web/components/UpgradePanel.vue
  - web/lib/upgrade.ts
summary: "Upgrade from the page: a dry run first, then jig upgrade runs in the server's background — 202 at once, state in memory on the workspace read, no other Jig in the project meanwhile, no revision; amends three ADRs for it"
reviewed_at: 2026-10-27
---
# Upgrading a project runs in the background of Jig UI's server

## Context

Jig 0.34.0 marks a project whose Jig is older than the machine's (`upgrade-available`) and prints
`jig upgrade --json`. Run from the page (task `upgrade-from-page`), the upgrade is unlike every
other write: it cuts a branch in the project's main checkout, commits, and pushes, opens a pull
request or merges as far as the project's `agent.git` allows — at `merge` it waits for CI, which
takes minutes. Jig keeps nothing of a run that stopped. While it runs, Jig replaces its own
scripts in the project. Decided with the maintainer at the design gate, 2026-10-27.

## Decision

- **Plan first.** **Upgrade…** on a marked card runs `jig upgrade --dry-run --json` and shows what
  Jig would do: the reasons it would not start (`would_stop`, no **Upgrade** button then), the
  steps the release asks for by hand, and a request to copy for the person's agent.
- **The run outlives its request.** `POST /api/projects/:id/upgrade` answers `202` at once and the
  adapter runs `jig upgrade --json` in the background (a 30-minute timeout). The run's state —
  `running`, then `done` with Jig's answer or `refused` with Jig's code and reasons — is kept in
  the adapter's memory, per project, and is part of the workspace read (`upgrade` on each
  project); listeners hear it change at the start and at the end, with the revision unchanged —
  `jig upgrade` writes no Jig state. Every tab and a reload see it; a second run of the same
  project is refused `409 running`.
- **The result stays until Dismiss** (`DELETE /api/projects/:id/upgrade`) or the next run. A
  restart of Jig UI forgets it; Jig's item stays.
- **Jig UI runs no other Jig in the project while it runs** — no read, from the watcher, the
  minute's rescan or a new subscription, and no write: a write is refused `upgrading`, and the run
  starts once a write already under way has ended. A read in the middle could fail or run a
  half-replaced `jig`. The project is read once at the end. It cannot be disconnected meanwhile
  (`409 upgrading`, and the card offers no Disconnect): the run is kept with the project, and one
  connected again would be read, or upgraded a second time.
- **No revision**, as for `jig task new` (adr-20261022-filing-a-task-carries-no-revision): Jig
  guards the stale case itself — `nothing-to-do`, or `upgrade-blocked` with its reasons.
- **No path reaches the page.** Jig's reasons are human text and may name a path; JigClient cuts
  absolute paths out of every reason, step and refusal line (`withoutPaths`).
- One project at a time; no "upgrade all".

For the upgrade alone, this amends three decisions; every other write stands as they say:

- adr-20261022-writes-carry-the-revision-of-their-read — the upgrade carries no revision and
  answers `202` before Jig has run, not after a re-read;
- adr-20261014-project-source-port-keeps-hosting-open ("writes are commands carrying the revision
  they were based on") and the matching line of ARCHITECTURE.md — the upgrade carries none;
- adr-20261014-jig-ui-is-an-optional-layer-over-jig ("stopping Jig UI changes nothing in any
  project") — stopping Jig UI while an upgrade runs stops the `jig upgrade` it started, as Ctrl+C
  on `jig upgrade` in a terminal does. The project may be left on `jig/upgrade-<to>`, or with the
  branch pushed and no pull request; the next `jig upgrade` there says what to do. Decided with
  the maintainer after the architecture review, 2026-10-27: a run that survives Jig UI would need
  its output in files and a path of its own on Windows, and its result would be lost anyway.

## Alternatives

- Hold the HTTP request until Jig finishes, like the other writes — the least code, but at
  `merge` it lasts minutes: a reload or a closed tab loses the result, and another tab does not
  know a run is going and can start a second.
- No dry run — `upgrade-blocked` names the reasons anyway; but the person would push and open a
  pull request without seeing the confirmation or the steps by hand, which decide whether to hand
  the upgrade to an agent instead.
- A stopped upgrade as an attention item — rejected by the maintainer: the card's result says it.
- Jig's reasons as they are — would break "no path reaches `web/`".
- Keeping the run's state on disk — RULES let Jig UI store only its registry and settings.

## Consequences

- Jig UI's process now starts a Jig command that pushes, opens pull requests and merges, with the
  person's git credentials: on macOS the Keychain asks, as for `git push` in a terminal. It is
  given 30 minutes, the dry run one.
- A board write made while the project upgrades is refused; the person tries again after it.
- At `agent.git: none` Jig leaves the main checkout on `jig/upgrade-<to>` with the change staged;
  the card says so and gives the commit command.
- The run's progress is not shown: Jig prints its JSON only at the end.
