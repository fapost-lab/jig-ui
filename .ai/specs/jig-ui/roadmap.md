# Roadmap — Jig UI

Destination: a person with several Jig projects opens one local page, sees every task and epic of
every project, orders and prioritises them, and files new tasks — and Jig works exactly as before
when that page is not installed.

External dependency: Jig's spec `contract-extensions` (fapost-lab/jig, `.ai/specs/contract-extensions/`).
Its Phase 1 (machine-readable Jig) comes before Phase 1 here goes past a prototype; its Phase 2
(queue and requests) comes before Phase 2 here.

## Phase 1 — Read-only UI

Goal: the page exists and tells the truth. Done when a person connects two projects, sees both on
a workspace page and on a board per project, edits a task through an agent, and the page follows
without a reload; stopping the UI changes nothing in either project.

- [ ] prototype and stack choice — one local command, no native dependencies; checks Node + Vue and SSE against a real clone before the choice is recorded
- [ ] project registry and connect — manual connect, path and slug rules, a clone's main checkout only (after: prototype — the registry is its first part)
- [ ] workspace dashboard and project board — columns derived from Jig status, no stored board column (after: registry — boards are per connected project)
- [ ] task details — status, stage, gate, artifacts, dependencies, attention (after: board — opened from a card)
- [ ] file watching with a periodic rescan — the whole `.ai/workspace`, not a few files (after: prototype — the watcher is part of the backend it picks)
- [ ] fog: registration by `jig init` — needs a hook on Jig's side that keeps the UI optional

## Phase 2 — Planning from the UI

Goal: the page changes things, only through Jig. Done when a drag, a priority change and a new
task all land through Jig commands, and a concurrent change by an agent shows as a conflict
instead of being overwritten.

- [ ] reorder and prioritise by drag (after: board; Jig queue — writes go through Jig's queue command with the revision)
- [ ] pause and resume as a request — a drop on the paused column writes a sticky request through Jig; the card shows "requested" with its age and a cancel until Jig's state changes (after: Jig legal actions and requests — they say when a pause is offered)
- [ ] file a minimal backlog task from the page (after: board — through `jig task new` with a short description)
- [ ] conflict display (after: reorder — the refusal of a stale revision is what it shows)

## Phase 3 — Further

- [ ] fog: remote access and a hosted view — first form is a read-only snapshot with a revision; authentication and file access rules are not stated
- [ ] fog: installation for people without a development environment, Windows first
- [ ] fog: epic and spec planning from the page

## Waves

1. prototype and stack choice
2. project registry and connect; file watching with a periodic rescan
3. workspace dashboard and project board; task details
4. reorder and prioritise by drag; pause and resume as a request; file a minimal backlog task from the page
5. conflict display

<!--
Rules (jig-idea §8):
- An item is a finished slice that makes the product noticeably better, never a layer.
- A dependency without a one-line reason is not a dependency.
- A `task-id` appears when the item's task is filed; `[x]` is set when that task is closed.
- `fog:` items are not split or sized; they become real items once the fog lifts.
- No dates, no point estimates: order is the priority.
-->
