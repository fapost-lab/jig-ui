---
id: feature-workspace
type: feature
status: active
domains: []
paths:
  - web/views/WorkspaceView.vue
  - web/components/ProjectCard.vue
  - web/lib/upgrade.ts
  - server/jig/fixtures/status-upgrade.json
  - web/components/UpgradePanel.vue
  - "server/jig/fixtures/upgrade-*.json"
  - web/components/ProjectList.vue
  - web/components/ProjectSwitcher.vue
  - web/components/ProjectMark.vue
  - web/lib/projects.ts
  - web/components/FoundProjects.vue
  - web/lib/scan.ts
  - web/components/ConnectForm.vue
summary: "The workspace page: a list of the connected projects with search and the chosen one's card — Jig's attention items, the mark and count of projects whose Jig is older than the machine's, their upgrade from the card — and Find projects, which lists the Jig projects in a folder not connected yet"
reviewed_at: 2026-10-29
---
# Workspace — every connected project on one page

## What

The page at `#/` (`web/views/WorkspaceView.vue`): a list of the connected projects with a search
over their ids (`web/components/ProjectList.vue`) and, beside it, one project's card
(`web/components/ProjectCard.vue`). The card is the project `?project=<id>` names, else the first
that needs the person — not readable, or with an attention item — else the first
(`web/lib/projects.ts`); a click in the list sets `?project=`, and a project just connected is
shown. The card has its Jig version, its live tasks counted, what needs the person there — Jig's
attention items as `jig status --json` lists them — and the housekeeping note. Every page's header
holds a dropdown with search over the projects (`web/components/ProjectSwitcher.vue`, in
`App.vue`) that opens a project's board; the list and the dropdown mark each project with its
count of attention items, or *!* when it cannot be read (`web/components/ProjectMark.vue`).
**Find projects** beside Connect looks for Jig projects in the folder typed, or the home folder, and
lists the ones not connected yet by path, each with **Connect** (`web/components/FoundProjects.vue`,
worded by `web/lib/scan.ts`; adr-20261029-finding-projects-shows-their-paths).
The first load lists the connected ids at once (`GET /api/projects`) and reads each project on its
own (`GET /api/projects/:id`), so each fills in as Jig answers for it — `…` until then — under a bar
counting the projects read (`readProgress` in `web/lib/projects.ts`); later loads read the whole
workspace, as before.
A project whose Jig is older than the machine's is marked with both versions
(*0.34.0 → 0.35.0 on this machine*) and counted in a line above the projects; `web/lib/upgrade.ts`
decides both. Its **Upgrade…** opens a panel on the card (`web/components/UpgradePanel.vue`): Jig's
dry run — the reasons it would not start, or the steps by hand and **Upgrade** — then the run and its
result, worded by `web/lib/upgrade.ts`, until **Dismiss**; beside it, a request to copy for the
person's agent (adr-20261027-upgrading-a-project-runs-in-the-background).

## Why

The person keeps several projects and needs to see at a glance which one waits for them. Jig's
attention items already say what and why; the page shows them as Jig ordered them, an unknown kind
by its texts. One card per project made a long page once a person kept many (a maintainer's
colleague, task `card-fields-and-artifacts`): a list scans at any length, and the card shown first
is the one most likely to need them. The choice is in the address, so a reload or a shared link
keeps it. The page read every project before it showed any, so one slow project — up to Jig's 30 s
limit — left *Reading projects…* on the whole page (a colleague, task `read-progress`); listed
before they are read, the projects a person came for are there in a second. Projects to upgrade get a mark on top of their item because across many cards a
version in the header and one count are quicker to scan than an item inside each card.

## Constraints

- The machine's Jig version is known only from the `upgrade-available` item: Jig UI never runs Jig
  outside a project and never reads Jig's files (convention-jig-client). The project's own Jig
  computes the item, from Jig 0.34.0, so a project on Jig 0.31–0.33 shows only its version;
  `docs/projects.mdx` says so.
- The mark shows the item's `versions.from` and `.to`, never the card's version beside `.to`: the
  card's version is the project's `jig --version`, and in a project installed with
  `jig init --link` the scripts move with Jig's source while the manifest, which Jig compares,
  stays until `jig upgrade`.
- The item stays in the card's list: it carries Jig's todo. The mark only repeats its versions.
- While projects are still read, no card is picked for the person (`chosen` waits): the one that needs
  them may be among the unread, and a card that jumps once it lands is worse than none. A project they
  chose shows *Reading <id>…* until it lands. **Upgrade all…** waits too: its plan is worked out over
  the projects read, and would leave the rest out.
- `GET /api/workspace` stays the one read of the machine's state
  (adr-20261029-upgrade-all-and-self-update-from-the-page). On the first load it starts after the
  per-project reads: it waits for the slowest project anyway, and a browser opens six connections to a
  site, two of them held that long by the change stream and the header's own workspace read
  (feature-live-updates). The four left serve the per-project reads, so four projects Jig does not
  answer, read first, already hold the rest, up to 30 s; one streamed answer for the first load would lift it.
- A project's own read fills only a place still waiting for it (`landed` in `web/lib/projects.ts`):
  these reads do not go through `lastWins`, and a project a workspace read already put there is as
  new or newer.

## Decisions and rejected alternatives

- An `unsupported` project (older than `MIN_JIG_VERSION`) is not counted: Jig UI does not know the
  machine's version for it, and its card already says to run `jig upgrade`.
- `release-available` (the machine's own Jig is outdated) is not a project mark: it is about the
  machine, not a project.
- One project at a time at first (the maintainer, 2026-10-27); Upgrade all came later,
  adr-20261029-upgrade-all-and-self-update-from-the-page.
- Find projects shares the connect field rather than a field of its own (the maintainer, task
  `scan-projects`): the field already takes a folder and `~/`, and a found project is connected
  through the same route as a typed one.
- A tree of projects — rejected: projects have no hierarchy to show, so a flat list with search
  (the maintainer, task `card-fields-and-artifacts`). The header's tabs gave way to the dropdown on
  every page for the same reason: tabs stop fitting long before a list does.
- A stopped upgrade is said on the card only, not as an attention item (the maintainer): Jig's
  item is the todo, the result says why it is still there.
- The agent's road is a copied request (*Upgrade Jig in <project>*), never an agent started:
  Jig UI runs no agents (adr-20261014-jig-ui-is-an-optional-layer-over-jig). It matters when the
  release asks for steps by hand, which the `jig-upgrade` skill does.
