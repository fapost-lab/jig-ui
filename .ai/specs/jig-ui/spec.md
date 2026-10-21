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
  now: a single self-contained binary for people without a development environment — it stays
  the Phase 3 fog item on installation.
- Installing and starting Jig UI is one command, `npx @fapost/jig-ui`; what matters is that
  installation is very simple, not that a separate installer exists (maintainer, 2026-10-14).
  The package is scoped because `jig-ui` on npm belongs to an unrelated project; the `@fapost`
  scope is the maintainer's, and `@jig` is held by someone else (checked 2026-10-14). Rejected: a
  git-clone installer like Jig's own, which builds on the user's machine and adds a script to
  maintain on two platforms; it comes back only if `npx` proves not simple enough.
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
  `jig init` fog item without a hook on Jig's side; the fog item stays for registering a project
  without running Jig UI.
- Public documentation lives in `docs/` of this repository and is published with Mintlify
  (maintainer, 2026-10-14). The requirements page states the Node.js requirement the installer
  checks.

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
- How `jig init` registers a project in an installed UI without making the UI a dependency of
  Jig — needs a small hook on Jig's side, not designed yet (on Jig's side a fog item of its
  `project-hooks` spec since 2026-10-20).

## Assumptions left untested

- That a file watcher over many repositories, and a `jig` run per change, stay cheap in one
  process — measured by the live updates item, with several agents in several projects.
- That a derived column is enough and no stored board column is ever needed — tested by use.
