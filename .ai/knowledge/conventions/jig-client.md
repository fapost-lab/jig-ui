---
id: convention-jig-client
type: convention
status: active
domains: []
paths:
  - "server/jig/**"
summary: JigClient alone runs jig (execFile, bash on Windows) and validates its JSON; never reads Jig's files
reviewed_at: 2026-11-14
---
# JigClient — the only module that knows Jig

## Practice

```
JigClient (server/jig/)

MAY:      run `jig` in a project's main checkout; parse and validate its JSON; check the
          project's Jig version
MUST:     use execFile without a shell — on Windows Git's bash running .ai/scripts/jig, never
          jig.cmd, with the arguments in the environment, never on its command line; run it without
          the GitHub token variables of Jig UI's environment; validate every response against the shape its contract test pins; turn a
          refusal into Jig's failure code
MUST NOT: read or write Jig's files directly (`state`, roadmaps, the queue file); call the
          network; let a shape of Jig's output leak past its own types
Why:      a change of Jig's contract must be a change here and in its contract tests only, and
          Jig's files are not a contract Jig promised.
```

The minimum Jig the package reads is `MIN_JIG_VERSION` in `server/jig/client.ts` — 0.31.0, the
first Jig with a queue (0.29.0 was the first that prints JSON). A write a later Jig made possible
does not raise it: it carries a version of its own, checked by the local adapter against the
project's Jig before the page is offered the write — `RESUME_JIG_VERSION`, 0.35.0, for
`resumeTask`, `ARTIFACTS_JIG_VERSION`, 0.39.0, for a task's documents, `ROADMAP_JIG_VERSION`, 0.40.0, for a
roadmap's edits, `KNOWLEDGE_JIG_VERSION`, 0.40.0, for the knowledge waiting for a decision, `KNOWLEDGE_TEXT_JIG_VERSION`, 0.41.0, for a proposed document's text and a dropped link, `FILE_NEW_JIG_VERSION`, 0.41.0, for filing an item's new task in one write, `DECIDE_JIG_VERSION`, 0.44.0, for several knowledge decisions in one write, and `REFRESH_JIG_VERSION`, 0.45.0, for bringing the clone up to origin — so a project on an older Jig is still read, and only that write is missing. `CLOSE_JIG_VERSION`, 0.40.0, is the other kind: the close is offered on any Jig, and the version picks how `closeTask` checks it. `jig` runs as `bash .ai/scripts/jig`; on Windows the bash is Git's,
found from `git --exec-path` (`<git>/mingw64/libexec/git-core` → `<git>/bin/bash.exe`), never a
`bash` on PATH, which may be WSL's. It is asked once per process; a failed ask is not kept.

Each shape of Jig's output is one zod schema, written as Jig prints it and turned into Jig UI's
camelCase by its `.transform`; the exported types are its `z.output`
(adr-20261018-jig-answers-checked-by-zod-schemas). Keys Jig adds without raising `schema` are
dropped by `z.object`, so nothing Jig UI does not read gets past `server/jig/`.

Every field a schema reads is in Jig's output, `null` where Jig has nothing — except a few: an
attention item's `versions` (`{from, to}`, the project's Jig as its manifest says and the
machine's), which only `upgrade-available` carries, from Jig 0.34.0, and older Jig never printed on
any item. It reads as `null` when absent, and an `upgrade-available` item without it fails the read,
as a field Jig dropped does (task `projects-to-upgrade`). A roadmap item's `id` (Jig's handle) and a
spec's `waiting` (the edits on its write branch, with the roadmap there) are printed from Jig 0.40.0
only, and read as `null` when absent (task `roadmap-from-page`). A task's `staging` and `parked` are
printed on Jig 0.45.0's staging flow only, absent on any other; the schema reads them as `undefined`
when absent, and that absence is how the adapter tells the flow (task `tasks-on-staging`).

A test that runs real processes — a stand-in `jig` script that starts a child, leaves its process
group, or waits — waits for a marker file the process writes once it is where the test needs it,
never for a fixed delay: CI runners and a machine running several sessions are loaded enough that a
fixed 300 ms lost the race to `perl`'s `setsid` (task `stopjig-test-race`, Release run on `main`
after #80). The `stopJig` tests write `waiter.pid` and `left` for this.

Every Jig run gets Jig UI's environment without `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` and
`GITHUB_ENTERPRISE_TOKEN` (`withoutTokens` in `ran()`, on both paths; any case only on Windows, which names a variable in any case — elsewhere
`gh_token` is a variable of its own and reaches Jig). Jig puts such a token
before `github.account` and the accounts `gh` holds, so a token a direnv `.envrc` set in the folder Jig UI was started
in chose the account for every connected project: the maintainer met `must be a collaborator` on a knowledge decision,
2026-11-12 (spec `jig-ui`; task `clone-account`). Rejected: removing them from `process.env` at start-up — the
decision belongs where Jig is run, and Jig UI's own `git` runs need no account; removing every variable with `TOKEN`
in it — `GH_HOST`, `GH_CONFIG_DIR` and the like are the person's `gh` set-up, not an account. A refused pull request
comes back as Jig's `write.note` (or its refusal's lines), which ends with the sentence naming the account Jig asked
as and where it came from; it reaches the page whole, paths cut.

## Example

A task-list read runs Jig's JSON task listing, the live tasks only, checks the envelope, then `data` through the
`TaskList` schema — the status among Jig's own words — and returns typed tasks and the count of finished ones left out
(`hidden`, less `archived` from Jig 0.37.0, which counts those among the hidden). The finished tasks themselves are
`readFinishedTasks`: `--status` takes one status, so two runs, and either's failure fails the read. Jig's refusal throws `JigRefusal` with its code
(an unknown code is `failed`); an envelope of another shape throws `JigShapeError`, which the
project shows as `incompatible` ("update Jig UI"), never half-parsed. Each read has a contract
test over a fixture in `server/jig/fixtures/`. Each Jig run of a read, `--version` included, has
30 s (`TIMEOUT_MS`); a run Node stops at the limit throws `JigRefusal('timeout')`, not `failed`,
so the page can say Jig was slow rather than that it refused. 10 s ran out with several projects
read at once, each four Jig runs of about 1 s on an idle machine (task `read-timeout`).

A write — `moveInQueue`, `setPriority`, `requestPause`, `cancelPause` — names a task as
`task:<id>`, passes `--revision <n>` and `--json`, and goes through the same envelope check:
`stale-revision`, `not-found`, `usage`, `already-exists` and `failed` come back as `JigRefusal`
codes. `resumeTask` (`jig task resume <id>`) names the task by its bare id, as `jig task` does, and
adds `not-paused`, `wrong-checkout` and `stash-conflict`; its answer (how long the pause lasted, a
stash applied) is not read. `pauseTask` (`jig task pause <id> --revision <n> --json`, from Jig 0.45.0,
`PAUSE_JIG_VERSION`) names the task by its bare id too and adds `already-paused`. Its success answer carries the revision before
the write, so the caller reads again; a test pins each command's arguments and a refusal.
`fileTask` (`jig task new <id> --goal <text>`) takes no revision — Jig has none for it — and its
tests pin that a person's goal reaches Jig as one argument, unglobbed
(adr-20261022-filing-a-task-carries-no-revision). `closeTask` (`jig task set <id> status consolidated`) takes the
project's Jig version and runs with a longer timeout (Jig asks the forge). From `CLOSE_JIG_VERSION` it is a write like
the others, with `--revision <n>` and `--json`, and adds `not-closable`, Jig's reason as `reasons`; the closed task it
answers is not read. On an older Jig it is the one text write: it reads `queue list --json` first and refuses
`stale-revision` itself when the clone's revision is not the caller's; a refusal is `failed` with Jig's `jig: error:`
lines, through `withoutPaths`, as `reasons` (adr-20261029-close-a-ready-task-from-the-board). A refusal's `reasons` lose
the command's own name, of one word, two or three (`upgrade: `, `task set: `, `spec item file: `). On Windows the arguments do not go on Git bash's
command line, which it parses itself: it globbed a one-word goal `out*` that Node left unquoted,
and with `MSYS=noglob` it read `\"` as a backslash and a quote (both caught by the Windows CI leg).
They go in the environment as `JIG_UI_ARG_<n>`, and the fixed script
`. "$JIG_UI_ARG_0" "$JIG_UI_ARG_1" …` hands them to Jig unparsed. It sources Jig, which finds itself by
`BASH_SOURCE` and never reads `$0`: Git bash's `exec` starts a second bash and waits for it, and
every Jig run took about 1.6 times as long — a Windows CI timeout (task `conflict-display`).

`housekeeping` (`jig housekeeping`, 2 minutes: a fetch, the forge, branch deletions) prints no JSON either: its report
is answered a line each, as Jig printed it, through `withoutPaths` and with the project's `.ai/…` paths cut too — and
the trash day it deletes, which it names from `.ai/runtime/` (`delete trash/<date>`) —, and a failure is `failed` with Jig's `jig: error:` lines as `reasons`. Exit 3 is no failure: Jig finished and flags work left
for a person (a task to consolidate, a wrong base, an archive refused), so its report is answered as any other. Its
warnings on stderr (a task not archived, the queue not pruned) lead the report, which points up at them ("the reason is
above"); `ran` gives both streams (`Ran`), `jig` only stdout. Its tests run a stand-in over
`server/jig/fixtures/housekeeping.txt` (adr-20261110-housekeeping-runs-from-the-project-card).

`refresh` (`jig refresh --json`, Jig 0.45.0, 2 minutes: a fetch) answers JSON, but not all of it: `base.message` and
`fetch.message` are git's own lines and `checked_out_in` a worktree's path, so the schema keeps the outcomes, the base's
name and commits and the writes closed, and drops the rest. Its fixtures are one per way the base went, from a scratch
repository with a local bare origin, the worktree's path renamed (adr-20261113-refresh-brings-the-clone-up-from-the-card).

`planUpgrade` (`jig upgrade --dry-run --json`, 60 s) and `runUpgrade` (`jig upgrade --json`, 30 minutes:
at `agent.git: merge` Jig waits for CI) read one `Upgrade` schema; its `files` are not read. Jig's
human texts in it — `would_stop`, `manual_steps` — and the reasons of an `upgrade-blocked` refusal
(the `  - ` lines of its message, on `JigRefusal.reasons`) go through `withoutPaths`, which puts `…`
for an absolute path: Jig 0.35.0 names only relative ones, so the cut is a guard, tested on a real
reason with an absolute path put in (adr-20261027-upgrading-a-project-runs-in-the-background).

`withoutPaths` is a pattern, not a parser, and errs towards cutting. A slash starts a path wherever it
does not continue a word or a relative path (a letter, a digit, `.`, `~`, `*`, `-` or a slash before
it), so `=/x`, `[/x`, `>/x` and `PATH=/x:/y` are cut; an option at a word's start starts one
too, whatever follows it (`-I/x`, `-isystem/x`, `${X:-/x}`), so `-Isrc/x` loses its `/x`; a web
address's `//` is kept. **Accepted limit** (the maintainer, task `settings-dialog`): a path glued to a word,
`abc/Users/x`, reads as a relative one and is not cut — no pattern tells the two apart. Kept as not
a path (task `settings-dialog-nits`): a backslash after anything but a blank, a quote, `(`, `=` or `:`
(`[A-Z]+\.` in a pattern; a drive form `C:\x` is still a path), a slash after a word's `)` or a
`<placeholder>` (`$(pwd)/.env`, `<spec-id>/<n>`), and an option pair (`-f/--force`). A lookahead
for the slash comes first so that the look back over an option runs only where a path can start:
without it a long run of word characters took seconds (a test pins under a second for 100 000).

The settings — `readSettings` (`jig config keys --json`), `setSetting` and `unsetSetting`
(`jig config set <key> <value>` and `jig config unset <key>`, each `--local --revision <n> --json`) —
need `SETTINGS_JIG_VERSION`, 0.40.0, which the local adapter checks before running Jig. A key's
value, default and description go through `withoutPaths`; a secret's value and default are
dropped even if Jig prints them (Jig 0.40.0 prints none); a kind Jig adds later reads as `text`. Jig
checks every value itself: `invalid-value`, `unknown-key`, `not-local` (a key only the project's
`.ai/config.yaml` answers) and `secret-key` (the Telegram token, which Jig takes only in a terminal)
come back as codes, Jig's line as `reasons` with the command's name cut by `said` — one word
(`upgrade: `), two (`config set: `, `task set: `) or three (`spec item add: `). The write's answer is not read: the caller
reads the settings again.

A roadmap's edits — `addItem`, `moveItem` and `fileItem` (`jig spec item add|move|file <spec> …
--revision <n> --json`), and from Jig 0.41.0 `fileNewItem` (`jig spec item file <spec> <item> --new
<task> --goal <text>`, which files the task in the same write) — have 60 s each (`ROADMAP_TIMEOUT_MS`): Jig fetches, may push and ask the
forge. Of the answer only `write.note` is read — whose step is next, or a push that failed after the
commit — through `withoutPaths`. Their refusals add `git-not-allowed` (`agent.git: none`),
`not-linkable`, `epic-missing`, `write-busy`, `branch-checked-out` (its message names the checkout's
absolute path), `branch-diverged`, `branch-has-other-commits`, `base-not-on-origin`,
`tree-in-the-way`, `commit-refused` and, from Jig 0.41.0, `write-still-waits`, Jig's line as `reasons`,
its command cut by `said` — of one word, two or three (`spec item move: `)
(adr-20261106-editing-a-roadmap-from-the-page, adr-20261110-filing-an-items-task-in-one-write-from-jig-0-41).

The knowledge waiting for a decision — `readKnowledge` (`jig knowledge proposed --json` and
`jig knowledge sources --json`, at the lower of their revisions; of the sources only `changed`,
`unrecorded` and `missing` kept, a stub proposal's `bytes` taken from the sources read) and
`readSourceDiff` (`jig knowledge sources --diff <id> --json`) — keeps Jig's paths, relative to the
project, and the diff as Jig prints it (adr-20261106-knowledge-decisions-from-the-page). Each record's
`decidable`, `reason` and `lossy` (Jig 0.41.0) read `null` from an older Jig. `readKnowledgeText`
(`jig knowledge read <id> --json`, Jig 0.41.0) keeps the document's whole file and a stub's linked file
as Jig gives them, each with its `lossy` (adr-20261109-knowledge-text-and-drop-from-jig-0-41).
`decideKnowledge` (from `DECIDE_JIG_VERSION` one `jig knowledge decide --accept|--reject|--reviewed <id>…
--revision <n> --json` for every decision given, each id after its decision's flag, in the order given; below it
`jig knowledge accept|reject|reviewed <id> --revision <n> --json` for one, more refused `usage` without Jig; 60 s,
`KNOWLEDGE_TIMEOUT_MS`) always passes the revision — without it Jig decides unchecked — and reads only
`write.note`, through `withoutPaths`, with the roadmap edits' `WriteNote` schema. Its refusals add
`not-proposed` (decided already, or an active stub given to `reject` by Jig 0.40.0, or one whose file
is as approved) and `source-missing` (a stub whose linked file is gone); Jig 0.41.0's `not-on-base`,
`not-on-branch` and `write-still-waits` are Jig's codes, carried with its line as reasons. Jig names the document
it stopped at only in that line: the refusal carries as `doc` the first sent id the line names as a word of its own,
not as part of a longer id — the one place Jig UI reads Jig's words, and only to name, never to act (adr-20261114-knowledge-decisions-are-queued-on-the-page).

## Rationale

adr-20261014-jig-ui-is-an-optional-layer-over-jig, adr-20261014-stack-vue-hono-sse-on-node.
