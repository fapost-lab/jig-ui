# Roadmap — Jig UI

Destination: a person with several Jig projects opens one local page, sees every task and epic of
every project, orders and prioritises them, and files new tasks — and Jig works exactly as before
when that page is not installed.

External dependency: Jig's spec `contract-extensions` (fapost-lab/jig, `.ai/specs/contract-extensions/`).
No task of Phase 1 here starts before its Phase 1 (machine-readable Jig) is in a Jig release; no
task of Phase 2 here starts before its Phase 2 (queue and requests) is.

## Phase 1 — Read-only UI

Goal: the page exists and tells the truth. Done when a person runs `npx @fapost/jig-ui`, connects
two projects, sees both on the workspace page and on a board per project, edits a task through an
agent, and the page follows without a reload; stopping the UI changes nothing in either project.

Every item updates the pages in `docs/` it changes.

- [ ] walking skeleton — `npx @fapost/jig-ui` checks Node 24+, starts one instance on 127.0.0.1 with a per-start token, opens the browser on an empty page, and a second start opens the running one once it answers; CI runs Vitest and the build, and a tag publishes the package to npm
- [ ] project registry and connect — connect by path, a clone's main checkout only (a worktree path is refused and named), slug rules, disconnect; a project below Jig's minimum version is shown as such, not read (after: walking skeleton — the registry lives in its config directory and its page)
- [ ] live updates — watcher with a periodic rescan per connected project, the whole `.ai/`, debounced into "project changed" over SSE; the page re-fetches and keeps the last good read when one fails; the cost is measured with several agents in several projects (after: project registry — it watches what is connected)
- [ ] workspace dashboard — every connected project with its counts and what needs the person, from Jig's attention items (after: project registry — it lists connected projects)
- [ ] project board — columns derived from Jig's task state, never stored; light cards (after: project registry — one board per connected project)
- [ ] task details — status, stage, gate, artifacts, pull request, dependencies, attention, opened from a card (after: project board — a card opens it)
- [ ] specs and epics — each spec with its phases, progress and epic branch beside the board, from Jig's spec list (after: project board — shown on the project's page)
- [ ] fog: registration by `jig init` — needs a hook on Jig's side that keeps the UI optional

## Phase 2 — Planning from the UI

Goal: the page changes things, only through Jig. Done when a drag, a priority change and a new
task all land through Jig commands, and a concurrent change by an agent shows as a conflict
instead of being overwritten.

- [ ] reorder and prioritise by drag (after: project board; Jig queue — writes go through Jig's queue command with the revision)
- [ ] pause and resume as a request — a drop on the paused column writes a sticky request through Jig; the card shows "requested" with its age and a cancel until Jig's state changes (after: project board; Jig legal actions and requests — they say when a pause is offered)
- [ ] file a minimal backlog task from the page (after: project board — through `jig task new` with a short description)
- [ ] conflict display (after: reorder and prioritise by drag — the refusal of a stale revision is what it shows)

## Phase 3 — Further

- [ ] fog: hosted and self-hosted Jig UI — a connector on the machine with the projects behind the ProjectSource port; first form is a read-only snapshot with a revision; accounts and file access rules are not stated
- [ ] fog: installation for people without a development environment, Windows first
- [ ] fog: epic and spec planning from the page

## Waves

1. walking skeleton
2. project registry and connect
3. live updates; workspace dashboard; project board
4. task details; specs and epics
5. reorder and prioritise by drag; pause and resume as a request; file a minimal backlog task from the page
6. conflict display

<!--
Rules (jig-idea §8):
- An item is a finished slice that makes the product noticeably better, never a layer.
- A dependency without a one-line reason is not a dependency.
- A `task-id` appears when the item's task is filed; `[x]` is set when that task is closed.
- `fog:` items are not split or sized; they become real items once the fog lifts.
- No dates, no point estimates: order is the priority.
-->
