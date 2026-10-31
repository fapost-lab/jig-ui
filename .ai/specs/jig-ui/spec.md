# Jig UI — a local control center for Jig projects

Depth: normal — the shape was set by the concept; the irreversible decisions (where planning data
lives, columns as derived state) were taken with the maintainer.

Origin: this specification was split out of the Jig repository (fapost-lab/jig, PR #232) on
2026-10-14. What Jig itself has to provide moved into Jig's own spec `contract-extensions`; what
is built here depends on it.

## Idea

From the concept document (`jig-ui-concept.md`, written by the maintainer, translated):

Jig UI is a separate repository and installable package. Frontend and backend are one local
application: the backend reads projects and serves an API, the frontend shows them in a
browser. Jig Core stays an independent shell framework that works without the UI. One Jig UI
instance connects many local projects and shows both one project's state and the whole
workspace. First version is local-first. The goal is to make the state, order and progress of
Jig tasks visible in one interface.

Later, from the maintainer: a full kanban board with all the information in one place across all
projects; setting priority and order of tasks and epics; possibly filing new tasks; later, a
hosted version to manage tasks remotely. It is a different level, an add-on; it is optional, and
Jig works as usual without it.

Principles stated in the concept:

- Task files and artifacts are the source of truth; the UI keeps no parallel task database.
- The UI keeps only a registry of connected projects and interface settings.
- Changes go through Jig's commands.
- Priority (importance) and rank (order inside a queue) are visible to agents through project
  files.
- `jig init` optionally and idempotently registers the project in an installed UI; a UI
  failure never fails `init`.
- Starting hypotheses: Node.js + Vue, SSE for updates. Screens: workspace dashboard, project
  dashboard, project kanban, task details, activity/attention.

## Goal and problem

- Who is worse off without this, and how: a person running several agents across several
  projects cannot see, in one place, what is running, what waits for them and in what order
  work should go. `jig status` is a text report per clone and `jig status --html` a read-only
  page per clone.
- What is true when the work is done: one local page shows every task and epic of every
  connected project, lets a person order and prioritise them and file new tasks, and stopping
  it changes nothing in any project.

## Stress test

Findings from checking the concept against Jig 0.26.0:

- **The status page is a neighbour, not a rival.** `jig status --html` is a read-only,
  serverless, per-clone page. Jig UI is many projects, an interactive board, ordering and task
  creation. The UI may take its "needs you" signals from Jig as data instead of recomputing them.
- **One clone, one place for its tasks.** A task started in a worktree borrows its task
  directory from the main checkout by link (Jig ADR-0029), so the main checkout lists every task
  of the clone. The registry points at a clone's main checkout, never at a worktree.
- **Jig had no machine-readable output and no planning fields.** Jig 0.29.0 made it readable
  (`contract-extensions`: `--json` in one envelope with a clone revision); Jig 0.31.0 adds the
  planning contract (`contract-queue`: the queue, pause requests, `jig task new --json`).
- **Board state can already be derived** from a task's status, gate, autopilot state, pull
  request and housekeeping flags.
- **The audience.** Jig itself needs only git, and is aimed partly at non-developers on Windows.
  "Install Node, run a server, open a port" is the opposite of zero-config for them.
- **Specs and epics** are tracked by Jig with phased roadmaps; a board that ignores them
  duplicates them by hand.
- Weakest point: the UI cannot be more than a prototype until Jig's contracts exist.

Independent failure hunt (2026-10-14), against the decisions in `stack.md` and
`architecture.md`; the sharpest findings, ranked by likelihood times cost:

- **Lost updates.** Jig writes `state` last-write-wins (Jig ADR-0008). A UI write and an agent's
  write to the same task race; the loser's change vanishes silently. Holds only if every UI write
  goes through a Jig command that checks a revision — Jig's queue (`contract-queue`, Jig 0.31.0)
  does: every `jig queue` write takes `--revision <n>` and refuses a stale one as
  `stale-revision`; a write to `state` would not.
- **Windows writes.** `execFile` of `jig.cmd` fails since Node's fix for CVE-2024-27980; fixed in
  `stack.md` by running Jig through Git's bash.
- **Remote state is not under `.ai/`.** A pull request merged or CI failed on GitHub fires no
  file event; only the rescan sees it, and a rescan that calls `gh` in every project runs into
  rate limits.
- **Process churn.** Every change, debounced, runs a bash `jig` per project; with several agents
  in several projects that is near-constant forking, slowest on Windows.
- **Torn reads.** `jig` may read a file mid-write by an agent and return a partial answer; the page
  must show the last good read, not an error, for one refresh.
- **Sticky requests ignored.** A request that no agent reads piles up with a growing age.
- **The token does not keep out the user's own processes**; corrected in `stack.md`.
- **Stale instance file** after a crash; the second start now checks the instance answers.
- **Contract shape.** The SSE signal and stale-write guard assume Jig reports a revision per
  project; if it does not, the UI would invent one from mtimes — the parsing this spec rejected.

## Scope and non-goals

- In scope: registry and connection of local projects; workspace dashboard; project board;
  task details; live updates; ordering, priority and dependencies through Jig; pause and resume
  requests; filing a minimal task.
- Not doing in the first version: remote or hosted access, running agents from the UI, desktop
  packaging, automatic next-task selection.

## Decisions

- Jig UI is a separate, optional package on top of Jig; Jig works exactly as before without it
  (maintainer, 2026-10-14). Rejected: widening `jig status --html`, which cannot be an
  interactive multi-project board without a server.
- Everything the UI shows or changes lives in Jig; the UI stores only the project registry and
  interface settings (maintainer, 2026-10-14). Rejected: a UI-side store of priority and order.
  The data contract is designed in Jig's `contract-extensions` spec, not here.
- Board columns are derived from Jig's state and never stored (maintainer, 2026-10-14). A drop
  on another column is a request, not a state change: the card stays where Jig says it is, shows
  "requested" with its age and a cancel, and moves when Jig's state changes. A request is sticky:
  it holds until honoured or cancelled, whatever stage the task reached in between. Which drops
  are offered comes from the legal actions Jig reports for that state. Rejected: a stored board
  column the agent has to keep in step.
- Resume is not a request (Jig's `contract-queue` decision, 2026-10-19): while a task is paused no
  agent works on it, so a drop out of the paused column calls `jig task resume` directly, a legal
  action Jig already offers. Only a pause is written as a request.
- The UI never runs agents; it reads and writes through Jig's commands (from research.md: running
  agents from the UI is aif-handoff's largest cost).
- The repository is `fapost-lab/jig-ui` (maintainer, 2026-10-14).
- The first version is for a developer with a terminal. Node.js installed on the machine is a
  documented requirement, not something Jig UI bundles (maintainer, 2026-10-14). Rejected for
  now: a single self-contained binary for people without a development environment — it was
  the Phase 3 fog item on installation, lifted below (2026-10-29).
- Installing and starting Jig UI is one command, `npx @fapost/jig-ui`; what matters is that
  installation is very simple, not that a separate installer exists (maintainer, 2026-10-14).
  The package is scoped because `jig-ui` on npm belongs to an unrelated project; the `@fapost`
  scope is the maintainer's, and `@jig` is held by someone else (checked 2026-10-14). Rejected: a
  git-clone installer like Jig's own, which builds on the user's machine and adds a script to
  maintain on two platforms; it comes back only if `npx` proves not simple enough.
- A person without Node.js installs Jig UI with one line in a terminal — Git Bash on Windows,
  which Jig needs anyway — that puts the official Node.js in Jig UI's own folder, no system
  install and no administrator, and a `jig-ui` command that starts Jig UI with it (maintainer,
  2026-10-29). What stops that person is Node.js alone: they already run Jig, from Git Bash or
  through an agent, and can paste a line, but do not install a runtime for one page. Rejected: one
  executable built with Node's SEA — ~90 MB per platform, a code-signing certificate or
  SmartScreen's "Windows protected your PC", Apple's notarization on macOS, and an update path of
  its own. Rejected: a documentation page with `winget install` or a request for the agent —
  Node.js still lands system-wide, behind an administrator prompt, so the barrier stays.
  The shape (maintainer, 2026-10-29): `jig-ui` runs `npx @fapost/jig-ui` with that Node.js, so Jig
  UI updates as it does for everyone, and running the line again updates Node.js — rejected: a
  pinned Jig UI in the folder, a second update path to keep. A Node.js 24 or later already on the
  machine is used and nothing is downloaded — rejected: a portable copy always, ~30 MB for nothing.
  The line takes the script from the latest stable release
  (`https://github.com/fapost-lab/jig-ui/releases/latest/download/install.sh`), so what people run
  changes with a release, as `latest` on npm does — rejected: the script on `main`, changed by every
  merge. One bash script serves Windows (Git Bash), checked first, and macOS and Linux.
- Jig UI reads and writes Jig only through the contracts of Jig's `contract-extensions` spec,
  and development does not start before those contracts are in a Jig release (maintainer,
  2026-10-14). The wait is per phase: Phase 1 here starts once Phase 1 of `contract-extensions`
  (machine-readable Jig) is released, Phase 2 here once its Phase 2 (queue and requests) is.
  Jig moved that second half into its own spec, `contract-queue`, released in Jig 0.31.0
  (2026-10-21): Phase 2 here starts on Jig 0.31.0.
  Work that reads nothing of Jig — the package and its release pipeline — does not wait
  (maintainer, 2026-10-14): every merge should reach the maintainer's machine from the start.
- Every merge to the default branch publishes a prerelease under npm's `next` tag, started with
  `npx @fapost/jig-ui@next`; a `v*` tag publishes a stable version under `latest`. Publishing
  runs only in CI, through npm trusted publishing (no token in secrets) with provenance
  (maintainer, 2026-10-14). Rejected: publishing on tags only — a person is needed for every
  version the maintainer wants to try. Rejected: parsing Jig's `state` files behind an adapter until the contracts land
  — it ties the UI to a format Jig never promised, and the adapter would be thrown away.
- Each phase is released on its own from the default branch; there is no epic branch
  (maintainer, 2026-10-14). Phase 1 alone — a read-only board — is worth a release.
- Jig UI may later be hosted or self-hosted; Phase 1 builds none of it but keeps four seams open,
  listed in `architecture.md` (maintainer, 2026-10-14).
- Stack: Vue 3 + Vite + TypeScript in the browser, Hono on Node.js with Server-Sent Events for
  live updates, one process serving both the API and the built page (maintainer, 2026-10-14).
  Details and rejected options are in `stack.md`.
- Running `npx @fapost/jig-ui` inside a Jig project connects that project and opens its board;
  run anywhere else, it starts as before. Run from a worktree, it connects the clone's main
  checkout and says so in the terminal. Disconnecting stays on the page; the command has no
  `disconnect` (maintainer, 2026-10-18). Rejected: an explicit `connect [path]` subcommand — a
  second word for the common case, when the folder already says which project is meant.
  Rejected: refusing a worktree as the page does — the terminal can name the main checkout itself,
  and the page's refusal exists because a pasted path may be a mistake. This covers most of the
  `jig init` fog item without a hook on Jig's side.
- A project is registered by running `npx @fapost/jig-ui` in its folder, or by connecting its path
  on the page; `jig init` knows nothing of Jig UI, and the Phase 1 fog item on registration by
  `jig init` is closed (maintainer, on the agent's recommendation, 2026-10-28). A project
  initialised while Jig UI is closed is on the page after that one command. Rejected: an `init`
  hook in Jig with a `--connect-only` mode of Jig UI — a feature of Jig's own (`project-hooks`)
  for a rare moment, a second process writing the registry, `npx` and its network on every
  `init`, and it helps only new projects, not the ones already on the disk. Rejected for now:
  Jig UI finding the Jig projects under a folder the person names and offering each to connect —
  a setting, a scan wider than the registry and a screen; it is the way to go if one command per
  project proves too much, since it covers the projects already there and needs nothing of Jig.
- Planning epics and specs from the page is cut by what Jig's contract already carries
  (maintainer, 2026-10-28). Epics are ordered and prioritised through the queue, which holds them
  beside tasks (`epic:<spec-id>`) with the same writes and revision; filing a phase's tasks and
  continuing a spec go to the person's agent as a request to copy, as an upgrade's steps by hand
  do; editing a roadmap from the page stays a fog item until Jig has a command for it, lifted
  below (2026-10-30). Rejected:
  Jig UI editing `roadmap.md` itself — RULES let it write nothing in a project, and a spec lives
  on a branch of its own. Rejected: dropping the fog item — the maintainer keeps it for when Jig
  can carry it.
- Editing a roadmap from the page asks Jig for three writes (maintainer, 2026-10-30): add an item to
  a phase, move an item within its phase or to another, and file an item's task — `jig task new <id>
  --goal`, as the page already files a backlog task, after which the item names the task and
  `jig spec link` links it; the task is filed with no class, which the person's agent gives it. Each
  write carries the revision of the read the person saw, and names the item by a handle that
  `jig spec list --json` gives it, since an item has none today. The edit is committed on the spec's
  branch — `spec/<id>`, or the epic — in a tree of Jig's own, never moving the person's checkout, and
  shipped as far as `agent.git` allows, as `jig spec ship` does; edits in a row share one pull
  request, and until it reaches the default branch the spec shows the edit waiting in it. Asked of
  Jig in fapost-lab/jig#362. Rejected: adding and moving only, filing left to the agent's request —
  the fog item names all three, and Jig decides how to cut them. Rejected: filing only — adding an
  item is what a person thinks of while looking at the plan. Rejected: an edit only when the checkout
  is on the spec's branch — from the page it would refuse almost every time, the main checkout being
  on the default branch or a task's. Rejected: an uncommitted edit in the working tree — a dirty tree
  stops `jig task start`, and the edit is easily lost.
- Public documentation lives in `docs/` of this repository and is published with Mintlify
  (maintainer, 2026-10-14). The requirements page states the Node.js requirement the installer
  checks.
- Phase 4 comes from a colleague's use of 0.5.0, relayed by the maintainer (2026-10-30): sorting and
  filters, a settings dialog, deciding knowledge from the page, and the project card's buttons; the
  maintainer added search on the agent's proposal. The task documents the colleague also asked for
  shipped in 0.5.0. Phase 4 was cut at depth easy: the agent
  took the reversible decisions below as assumptions, and the maintainer accepted them.
- Sorting and filtering the board are a view: they change nothing in Jig and keep nothing but the
  page's address. The queue's order stays the default, being the order agents follow. Rejected: a sort
  written to the queue — the order is a person's decision, a sort is a look at it. Rejected: a sort
  per column — the colleague asked for one for all. Rejected (maintainer, 2026-10-30, task
  `board-sort-filter`): a "needs me" filter, which the agent proposed — the board's first column,
  Needs you, is that already, read from a task's state; from Jig's attention items, as first written
  here, a ready task would sit there whenever `agent.git` is `none`, the reason feature-board gives.
- Settings are read and written only through `jig config`. The project's part, `.ai/config.yaml`, is
  committed and shared, so it is read-only until Jig can change it the way fapost-lab/jig#362 asks for
  a roadmap — committed on a branch of its own, never in the person's checkout; the person's part,
  `.ai/config.local.yaml`, is theirs alone and gitignored, and changes in place, as `jig-setup` does.
  Both are per clone, as Jig keeps them. A secret is never sent to the page. Rejected: Jig UI writing
  either file — RULES let it write nothing in a project.
- Knowledge reaches the page as written, as a task's documents do
  (adr-20261030-a-task-document-is-shown-as-written); the invariant naming what reaches `web/` gains
  knowledge documents in that item's task, by an ADR. A decision is Jig's command; Jig UI never edits
  a document's frontmatter.
- Closing a task from the page was proposed by the agent for Phase 4 and found built already: a ready
  card's ✕ (task `close-ready-task`, adr-20261029-close-a-ready-task-from-the-board), which checks the
  revision by a read before Jig's `task set`. The item narrows to passing the revision to Jig once
  fapost-lab/jig#365 is released (maintainer, 2026-10-30).
- The project's name on its card opens its board, and what a person does rarely — Settings,
  Disconnect — moves into a ⋯ menu (the colleague, 2026-10-30, who left the exact place open "to
  play with"); the Board button stays, as the action people look for.
- Three more Phase 4 items came from the same colleague (2026-10-31): Find projects missed a project
  kept inside another; the list of projects needs an order; nothing said a newer Jig UI was out. The
  maintainer's answers: walk into repositories; the list always by name, A–Z; a notice with the
  command. Rejected: a switch between by name and "needs you" first, the agent's proposal — one order
  is enough for the list, and the card shown first already goes to what needs the person. Rejected:
  updating Jig UI from the page — the server would replace and restart itself, for what is one line
  in a terminal.
- Find projects walks into a repository too; the "never walks into a repository" of
  adr-20261029-finding-projects-shows-their-paths is amended in that item's task. Typing the outer
  project's folder did not help either: the walk stopped at its `.git`. A submodule stays passed
  over: telling its `.git` file from a worktree's means opening the file, which the walk does not.
- The notice of a newer Jig UI is Jig UI's first request of its own to the internet: npm's registry,
  for one public version number, at most once a day, carrying nothing about the person or their
  projects; offline or refused, the page says nothing. It gets an ADR in that item's task. A running
  Jig UI keeps running when `npx @fapost/jig-ui` is run again — it opens the page — so without the
  notice a person may stay on an old version without knowing.

## Open questions

The first three were raised in Jig's `contract-extensions` spec (fapost-lab/jig#242) and are
answered by Jig 0.29.0 and 0.31.0 as noted; they stay here until this spec's next session moves
them to Decisions.

- Answered (Jig 0.29.0: a `--json` read never touches the network; housekeeping caches pull
  request and CI state with `fetched_at`). For Jig's `contract-extensions`: does reading Jig's JSON stay offline, with pull request and CI
  state refreshed by housekeeping, so a rescan never calls the network? Decides the rescan
  interval and whether the board can show remote state live.
- Answered (Jig 0.29.0: every `--json` envelope carries the clone `revision`; Jig 0.31.0: every
  queue write checks it). For Jig's `contract-extensions`: a revision per project in every read, which the SSE signal and
  every write carry. Without it the UI has no stale-write guard of its own.
- Answered (Jig 0.31.0: `jig queue move <ref> --before|--after <ref> | --top | --bottom` moves
  one item and respaces a level inside the same write only when no gap is left). For Jig's
  `contract-extensions`: a reorder is one command that moves one item (sparse position),
  never a renumbering the UI issues as several commands.
- For Jig, asked in fapost-lab/jig#362 (2026-10-30): roadmap writes — add an item, move it, file
  its task — with a revision and an item handle, committed on the spec's branch without moving the
  checkout. The roadmap item on editing a roadmap from the page waits for the commands Jig ships,
  and is shaped by them.
- For Jig, asked 2026-10-30, each shaping a Phase 4 item: settings as JSON — every key with its value,
  where it comes from, its allowed values and a description, and `config set` refusals as codes
  (fapost-lab/jig#363); knowledge proposals and changed linked sources as JSON, and a decision
  committed on a branch of its own without moving the checkout (fapost-lab/jig#364); closing a
  task with `--revision <n> --json` and its refusals as codes, as `jig task resume` has
  (fapost-lab/jig#365).

- Raised by Jig's maintainer (2026-10-25): a person with many projects does not follow each Jig
  upgrade by hand. Should the workspace show which projects run an older Jig than the machine's,
  and offer the upgrade — run through `jig upgrade --json`, or handed to an agent as a request to
  copy, since running agents from the UI is a non-goal? Jig's side is filed as three tasks in
  fapost-lab/jig: `status-json-upgrade-available` (the attention item), `upgrade-json` (the
  command's result as JSON) and `agent-runs-the-upgrade` (the agent's path, including the steps a
  release asks for by hand). The two roadmap items in Phase 3 wait for them. Open for this
  spec's maintainer: whether a batch "upgrade every marked project" belongs in the first form,
  and whether an upgrade that stopped is shown as attention or only in the result.

## Assumptions left untested

- That a file watcher over many repositories, and a `jig` run per change, stay cheap in one
  process — measured by the live updates item, with several agents in several projects.
- That a derived column is enough and no stored board column is ever needed — tested by use.
- That Git Bash on Windows can unpack Node.js's `.zip` (its `unzip`, or Windows' own `tar.exe`),
  and that a `jig-ui` in `~/bin` is on the PATH of Git Bash and of an agent's shell — checked by
  the installation item, on a Windows machine without Node.js.
- That a P0 under a P3 in Backlog asked for a sort by priority, not for a queue that orders itself by
  priority — tested by the colleague using the sort.
- That the colleague's project inside another is a clone of its own, with a `.git` folder, not a
  submodule: the item finds the first and passes over the second — checked by the colleague with
  Find projects once it ships.
- That a check once a day is soon enough to learn of a release — tested by use.
