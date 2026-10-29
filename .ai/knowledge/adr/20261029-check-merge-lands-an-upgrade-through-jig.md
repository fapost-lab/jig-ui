---
id: adr-20261029-check-merge-lands-an-upgrade-through-jig
type: adr
status: accepted
date: 2026-10-29
domains: []
paths:
  - server/jig/client.ts
  - server/source/local.ts
  - server/http/app.ts
  - web/lib/upgrade.ts
  - web/components/ProjectCard.vue
summary: "Check merge: an upgrade's pull request is remembered and landed by Jig 0.39.0 (status items, jig upgrade --land); Jig UI only calls it, gated on the project's Jig"
---
# Check merge lands an upgrade's pull request through Jig, never by Jig UI's own git

## Context

With `agent.git: pr` an upgrade from the page ends on `jig/upgrade-<to>` with a pull request, and
the project's main checkout stays on the old Jig. Jig UI kept that only in memory: after a restart,
or once the card was dismissed, the project showed `upgrade-available` again, **Upgrade…** came
back, and `jig upgrade` cut `jig/upgrade-<to>-2` (fapost-core #322 and #323, 2026-10-29). The
person wanted the card to say the upgrade waits for a merge and, once merged, to bring it here — the
base branch checked out and fast-forwarded. RULES forbid Jig UI to run git in a project ("every
change is a `jig` command").

## Decision

Decided with the maintainer at the design gate of task `upgrade-waits-for-merge`, 2026-10-29
(alternative A):

- **Jig does the git work and remembers the pull request** (fapost-lab/jig#352, Jig 0.39.0):
  `jig status` reports `upgrade-pull-request-waiting` / `upgrade-pull-request-merged` from the forge
  cache of its last housekeeping, and stops reporting `upgrade-available` meanwhile; `jig upgrade
  --land` checks the forge, checks the base branch out, fast-forwards it and lets the branch go —
  refused `not-merged` while open, `upgrade-blocked` with reasons otherwise; never stashes, never forces.
- **Jig UI only calls it.** A card shows the waiting upgrade — from Jig's item, or from the page's
  last run before housekeeping hears of it — and offers **Check merge** (`POST
  /api/projects/:id/upgrade/land`, answered once Jig has) instead of **Upgrade…**; **Check all
  merges** (`POST /api/upgrade/land-all`) runs them in turn. The outcome is the project's `upgrade`,
  as an upgrade's is. A landing is one more upgrade run on the machine: refused while another runs.
- **The server decides the wait** and sends it on the workspace read as the project's `mergeWait`
  (`open` or `merged`, the version, the link); the page only renders it. Until Jig's item exists,
  the pull request the page's own run left open is kept on the project — through a `not-merged`
  Check merge, until a landing ends `landed` or `nothing-to-do` — so **Upgrade…** cannot come back
  and cut a second branch.
- **Unlike an upgrade, Check merge holds its request** until Jig answers (a forge question, a fetch:
  two minutes at most a project); each card's outcome survives a reload, the summary line of Check
  all merges does not.
- **Gated on the project's own Jig ≥ 0.39.0** (`LAND_JIG_VERSION`): it is the project's Jig that
  reports the item and lands. An upgrade *to* 0.39.0 from an older Jig is not covered; it is
  merged and pulled by hand, as before.

The RULES invariant stands; adr-20261027-upgrading-a-project-runs-in-the-background stands for the
upgrade itself.

## Alternatives

- Jig UI runs `git fetch`, `checkout` and `merge --ff-only` itself and asks `gh` about the pull
  request — no Jig release needed, but it breaks "every change is a jig command", duplicates Jig's
  base-branch and branch rules, and an agent in a terminal gets nothing.
- Check merge only checks and shows the git commands to copy — nothing changes in the architecture,
  but the switch stays manual and the state does not survive a restart.

## Consequences

- The state survives a restart only as fresh as the project's last `jig housekeeping`; right after
  an upgrade the card knows the pull request from the run itself.
- Upgrades from Jig 0.39.0 on get the full flow; projects on older Jig keep the old behaviour.
