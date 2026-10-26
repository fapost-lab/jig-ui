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
summary: "The workspace page: a card per connected project with Jig's attention items, and the mark and count of projects whose Jig is older than the machine's"
reviewed_at: 2026-10-26
---
# Workspace — every connected project on one page

## What

The page at `#/` (`web/views/WorkspaceView.vue`): one card per connected project
(`web/components/ProjectCard.vue`) with its Jig version, its live tasks counted, what needs the
person there — Jig's attention items as `jig status --json` lists them — and the housekeeping note.
A project whose Jig is older than the machine's is marked with both versions
(*0.34.0 → 0.35.0 on this machine*) and counted in a line above the projects; `web/lib/upgrade.ts`
decides both.

## Why

The person keeps several projects and needs to see at a glance which one waits for them. Jig's
attention items already say what and why; the page shows them as Jig ordered them, an unknown kind
by its texts. Projects to upgrade get a mark on top of their item because across many cards a
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

## Decisions and rejected alternatives

- An `unsupported` project (older than `MIN_JIG_VERSION`) is not counted: Jig UI does not know the
  machine's version for it, and its card already says to run `jig upgrade`.
- `release-available` (the machine's own Jig is outdated) is not a project mark: it is about the
  machine, not a project.
- Running the upgrade from the page is the next roadmap item (upgrade from the page), not this
  mark.
