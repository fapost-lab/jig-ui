# Roadmap — Jig UI

Destination: a person with several Jig projects opens one local page, sees every task and epic of
every project, orders and prioritises them, and files new tasks — and Jig works exactly as before
when that page is not installed.

External dependency: Jig's spec `contract-extensions` (fapost-lab/jig, `.ai/specs/contract-extensions/`).
Phase 0 reads nothing of Jig and does not wait. No task of Phase 1 here starts before its Phase 1 (machine-readable Jig) is in a Jig release; no
task of Phase 2 here starts before its Phase 2 (queue and requests) is. That half moved to Jig's
spec `contract-queue`, released in Jig 0.31.0: Phase 2 here starts on Jig 0.31.0.

## Phase 0 — Package and release

Goal: every merge reaches the maintainer's machine. Done when a merge to the default branch
publishes a prerelease that `npx @fapost/jig-ui@next` starts, and a `v*` tag publishes a stable
version. Nothing here reads Jig, so it waits for no Jig contract.

- [x] `release-pipeline` — package and release pipeline — the `@fapost/jig-ui` package with a CLI that checks Node 24+ and serves a placeholder page on 127.0.0.1; CI runs typecheck, tests and the build on Linux, macOS and Windows; a merge to the default branch publishes `<version>-next.<n>` under the `next` tag, a `v*` tag publishes `latest`, both through npm trusted publishing with provenance

## Phase 1 — Read-only UI

Goal: the page exists and tells the truth. Done when a person runs `npx @fapost/jig-ui`, connects
two projects, sees both on the workspace page and on a board per project, edits a task through an
agent, and the page follows without a reload; stopping the UI changes nothing in either project.

Every item updates the pages in `docs/` it changes.

- [x] `walking-skeleton` — walking skeleton — `npx @fapost/jig-ui` starts one instance on 127.0.0.1 with a per-start token and the `Host`/`Origin` guard, opens the browser on the Vue page, and a second start opens the running one once it answers (after: package and release pipeline — it extends that package and ships through it)
- [x] `project-registry` — project registry and connect — connect by path, a clone's main checkout only (a worktree path is refused and named), slug rules, disconnect; a project below Jig's minimum version is shown as such, not read (after: walking skeleton — the registry lives in its config directory and its page)
- [x] `live-updates` — live updates — watcher with a periodic rescan per connected project, the whole `.ai/`, debounced into "project changed" over SSE; the page re-fetches and keeps the last good read when one fails; the cost is measured with several agents in several projects (after: project registry — it watches what is connected)
- [x] `workspace-dashboard` — workspace dashboard — every connected project with its counts and what needs the person, from Jig's attention items (after: project registry — it lists connected projects)
- [x] `project-board` — project board — columns derived from Jig's task state, never stored; light cards (after: project registry — one board per connected project)
- [x] `task-details` — task details — status, stage, gate, artifacts, pull request, dependencies, attention, opened from a card (after: project board — a card opens it)
- [x] `design-system` — design system and canvas — shadcn-vue on Tailwind v4 with light and dark themes and a look chosen from prototypes; vue-router; `#/canvas` showing every component in every variant and state; the Vue conventions written into knowledge; the workspace, the board and task details rebuilt on the components (after: task details — it rebuilds the three screens that exist)
- [x] `specs-and-epics` — specs and epics — each spec with its phases, progress and epic branch beside the board, from Jig's spec list (after: project board — shown on the project's page; design system and canvas — built on its components)
- [x] `npx-connect` — connect by running in the project — `npx @fapost/jig-ui` in a Jig project's folder (or a worktree of it) connects its main checkout, through the running instance when there is one, and opens its board; anywhere else it starts as before (after: project registry — it connects through the registry)

## Phase 2 — Planning from the UI

Goal: the page changes things, only through Jig. Done when a drag, a priority change and a new
task all land through Jig commands, and a concurrent change by an agent shows as a conflict
instead of being overwritten.

- [x] `queue-reorder` — reorder and prioritise by drag (after: project board; Jig queue — writes go through Jig's queue command with the revision: `jig queue move` and `jig queue set --priority` with `--revision <n> --json`, read with `jig queue list --json`)
- [x] `pause-request` — pause and resume as a request — a drop on the paused column writes a sticky request through Jig; the card shows "requested" with its age and a cancel until Jig's state changes; a drop out of it resumes directly (after: project board; Jig legal actions and requests — they say when a pause is offered: `jig queue request|cancel task:<id> pause`, the task's `pause_request` and the `request-pause` / `cancel-pause-request` / `resume` actions in `jig task list --json`)
- [x] `file-backlog-task` — file a minimal backlog task from the page (after: project board — through `jig task new <id> --goal <text> --json`, refused as `already-exists` when the id is taken)
- [x] `conflict-display` — conflict display (after: reorder and prioritise by drag — the refusal of a stale revision is what it shows: `error.code` `stale-revision`)
- [x] `finished-list` — finished tasks from the board's count — the count of finished tasks opens the list of those Jig still keeps, with status and pull request (after: project board — the count is on its header; Jig — `jig task list --all --json`, which keeps a finished task only until housekeeping moves its workspace to trash)

## Phase 3 — Further

- [x] `resume-from-page` — resume from the page — a drop out of Paused onto the column the task will be in, or the card's menu, resumes the task through `jig task resume <id> --revision <n> --json`; below Jig 0.35.0 a paused card names `jig task resume <id>` (after: pause and resume as a request — its other half; Jig — `jig task resume` with `--revision <n> --json` and refusals as codes, fapost-lab/jig#295)
- [x] `projects-to-upgrade` — projects to upgrade — the workspace marks each connected project whose installed Jig is older than the machine's, with both versions, and counts them (after: workspace dashboard — it is one more thing a project needs from the person; Jig — an `upgrade-available` attention item in `jig status --json`, task `status-json-upgrade-available` in fapost-lab/jig)
- [x] `upgrade-from-page` — upgrade from the page — for one project at a time: run the upgrade through Jig (`jig upgrade --json`) and show its outcome — the branch and pull request it made, merged or not by the project's `agent.git`, or why it stopped and what to do; or copy the request for an agent ("Upgrade Jig in <project>"), for a release whose upgrade asks for steps by hand (after: projects to upgrade — it acts on the marked projects; Jig — `jig upgrade --json`, task `upgrade-json`, and the agent's upgrade path, task `agent-runs-the-upgrade`, in fapost-lab/jig)
- [x] `epic-order` — order and prioritise epics — the project's specs with an open epic are shown in the queue's order, and a person drags one, or uses its ⋯ menu, to move it among the top level of the queue and set its priority P0–P5, through `jig queue move epic:<id>` and `jig queue set epic:<id> --priority`, with the revision of the read the person saw (after: reorder and prioritise by drag — the same writes and refusals on another ref; specs and epics — the epics are shown there)
- [x] `spec-agent-request` — a request for the agent on a spec — a spec offers a request to copy for the person's agent: file the tasks of a phase that has items with no task, or continue the spec while it has fog items (after: specs and epics — it sits on a spec's row)
- [ ] fog: hosted and self-hosted Jig UI — a connector on the machine with the projects behind the ProjectSource port; first form is a read-only snapshot with a revision; accounts and file access rules are not stated
- [x] `install-without-node` — install without Node.js — one line in Git Bash on Windows, or a terminal on macOS and Linux (`curl -fsSL https://github.com/fapost-lab/jig-ui/releases/latest/download/install.sh | bash`), puts the official Node.js 24, checked against nodejs.org's checksums, in Jig UI's own folder unless Node.js 24 or later is already there, and adds a `jig-ui` command that runs `npx @fapost/jig-ui` with it; the Release workflow attaches the script to each stable release, and the requirements and installation pages give both ways (after: package and release pipeline — the script ships with a release)
- [ ] editing a roadmap from the page — on a spec's row a person adds an item to a phase, moves an item within its phase or to another, and files an item's task (`jig task new <id> --goal`, then the item names it and `jig spec link` links it), each with the revision of the read they saw; the edit is committed on `spec/<id>` or the epic without moving the person's checkout, shipped as far as `agent.git` allows, and shown waiting in its pull request until it lands (after: specs and epics — it sits on a spec's row; Jig — roadmap writes with a revision and an item handle, fapost-lab/jig#362)

## Phase 4 — Daily work from the page

From a colleague's use of 0.5.0 (2026-10-30, 2026-10-31). Goal: a person finds the task they need on a
full board and the project they need among many, reads and changes their own Jig settings, decides the
knowledge waiting for them, and learns when Jig UI itself is out of date, without a terminal. Done when
each of those is a click on the page, or a line on it, and each write is a Jig command.

- [x] `board-sort-filter` — sort and filter the board — one bar above Board and List, for every column at once: sort by the queue's order (the default), by priority or by class; filter by class, by priority and by text in a task's id or goal; kept in the page's address, so a reload or a shared link shows the same view; while sorted by anything but the queue's order a drop within a column is not offered, a drop on another column still is (after: project board — it orders and filters that board's cards; reorder and prioritise by drag — a sorted view must not offer a reorder it cannot mean)
- [x] `project-card-actions` — project card actions — the project's name on its card opens its board; the card's corner keeps Board and a ⋯ menu with Settings and Disconnect (after: workspace dashboard — the card is there)
- [ ] settings — a dialog from the project card's ⋯ menu, in two parts: the project's settings, from `.ai/config.yaml`, shared through git and shown read-only; and the person's own in this clone, from `.ai/config.local.yaml`, changed through `jig config set|unset --local` — a checkbox for a yes/no key, a choice for a key with a fixed set of values, a field for the rest, each with Jig's description and where its value comes from; a secret (the Telegram token) is never shown, only set or cleared (after: project card actions — opened from its menu; Jig — every key as JSON with its value, source, allowed values and description, and `config set` refusals as codes, fapost-lab/jig#363)
- [ ] knowledge decisions — on a project's page, the knowledge waiting for a person: each proposed document shown as written, each linked source that changed since it was approved shown as a diff; Accept or Reject a proposal, Keep or Drop a changed source, through `jig knowledge accept|reject|reviewed`, the decision committed without moving the person's checkout and shipped as far as `agent.git` allows (after: task details — a document is shown as a task's documents are; Jig — proposals and changed sources as JSON, and the decision committed on a branch of its own, fapost-lab/jig#364)
- [ ] a close checked by Jig — the ready card's close (task `close-ready-task`) passes the revision of the read the person saw to Jig and reads its refusal by code, instead of checking the revision by a read of its own first (after: Jig — the close with `--revision <n> --json` and refusals as codes, fapost-lab/jig#365)
- [ ] projects inside a project — Find projects walks into a repository too, so a Jig project kept inside another project, or inside any repository, is found; hidden folders, `node_modules` and symbolic links stay passed over, and the limits of 5 folders deep and 20 000 folders stay; a submodule, whose `.git` is a file, stays passed over (after: find projects — the walk it changes)
- [ ] projects by name — the list of connected projects on the Projects page, and the dropdown in the header, in their ids' order A–Z instead of the order they were connected; the card shown first stays the first project that needs the person (after: workspace dashboard — the list it orders)
- [ ] a newer Jig UI — Jig UI asks npm's registry for its own latest version at most once a day, and the page's header says when a newer one is out, with the line that updates it for the way it was installed — through npx, or without Node.js; offline, or on any failure, it says nothing; a build of the development channel compares with that channel (after: install without Node.js — both ways to update are named)

## Waves

1. package and release pipeline
2. walking skeleton
3. project registry and connect
4. live updates; workspace dashboard; project board
5. task details
6. design system and canvas
7. specs and epics
8. connect by running in the project
9. reorder and prioritise by drag; pause and resume as a request; file a minimal backlog task from the page
10. conflict display
11. finished tasks from the board's count
12. resume from the page
13. projects to upgrade
14. upgrade from the page
15. order and prioritise epics; a request for the agent on a spec
16. install without Node.js
17. editing a roadmap from the page
18. sort and filter the board; project card actions; projects inside a project; projects by name; a newer Jig UI
19. settings; knowledge decisions; a close checked by Jig

<!--
Rules (jig-idea §8):
- An item is a finished slice that makes the product noticeably better, never a layer.
- A dependency without a one-line reason is not a dependency.
- A `task-id` appears when the item's task is filed; `[x]` is set when that task is closed.
- `fog:` items are not split or sized; they become real items once the fog lifts.
- No dates, no point estimates: order is the priority.
-->
