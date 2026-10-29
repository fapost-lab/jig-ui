---
id: convention-jig-client
type: convention
status: active
domains: []
paths:
  - "server/jig/**"
summary: JigClient alone runs jig (execFile, bash on Windows) and validates its JSON; never reads Jig's files
reviewed_at: 2026-10-29
---
# JigClient — the only module that knows Jig

## Practice

```
JigClient (server/jig/)

MAY:      run `jig` in a project's main checkout; parse and validate its JSON; check the
          project's Jig version
MUST:     use execFile without a shell — on Windows Git's bash running .ai/scripts/jig, never
          jig.cmd, with the arguments in the environment, never on its command line; validate every response against the shape its contract test pins; turn a
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
`resumeTask` — so a project on an older Jig is still read, and only that write is missing. `jig` runs as `bash .ai/scripts/jig`; on Windows the bash is Git's,
found from `git --exec-path` (`<git>/mingw64/libexec/git-core` → `<git>/bin/bash.exe`), never a
`bash` on PATH, which may be WSL's. It is asked once per process; a failed ask is not kept.

Each shape of Jig's output is one zod schema, written as Jig prints it and turned into Jig UI's
camelCase by its `.transform`; the exported types are its `z.output`
(adr-20261018-jig-answers-checked-by-zod-schemas). Keys Jig adds without raising `schema` are
dropped by `z.object`, so nothing Jig UI does not read gets past `server/jig/`.

Every field a schema reads is in Jig's output, `null` where Jig has nothing — except one: an
attention item's `versions` (`{from, to}`, the project's Jig as its manifest says and the
machine's), which only `upgrade-available` carries, from Jig 0.34.0, and older Jig never printed on
any item. It reads as `null` when absent, and an `upgrade-available` item without it fails the read,
as a field Jig dropped does (task `projects-to-upgrade`).

A test that runs real processes — a stand-in `jig` script that starts a child, leaves its process
group, or waits — waits for a marker file the process writes once it is where the test needs it,
never for a fixed delay: CI runners and a machine running several sessions are loaded enough that a
fixed 300 ms lost the race to `perl`'s `setsid` (task `stopjig-test-race`, Release run on `main`
after #80). The `stopJig` tests write `waiter.pid` and `left` for this.

## Example

A task-list read runs Jig's JSON task listing with `--all`, finished tasks included, checks the envelope, then `data` through the
`TaskList` schema — the status among Jig's own words — and returns typed tasks. Jig's refusal throws `JigRefusal` with its code
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
stash applied) is not read. Its success answer carries the revision before
the write, so the caller reads again; a test pins each command's arguments and a refusal.
`fileTask` (`jig task new <id> --goal <text>`) takes no revision — Jig has none for it — and its
tests pin that a person's goal reaches Jig as one argument, unglobbed
(adr-20261022-filing-a-task-carries-no-revision). `closeTask` (`jig task set <id> status consolidated`) is the
one text write: Jig takes no `--revision` and prints no JSON for it, so it reads `queue list --json` first and refuses
`stale-revision` itself when the clone's revision is not the caller's, then runs the command with a longer timeout (Jig
asks the forge); a refusal is `failed` with Jig's `jig: error:` lines, through `withoutPaths`, as `reasons`
(adr-20261029-close-a-ready-task-from-the-board). On Windows the arguments do not go on Git bash's
command line, which it parses itself: it globbed a one-word goal `out*` that Node left unquoted,
and with `MSYS=noglob` it read `\"` as a backslash and a quote (both caught by the Windows CI leg).
They go in the environment as `JIG_UI_ARG_<n>`, and the fixed script
`. "$JIG_UI_ARG_0" "$JIG_UI_ARG_1" …` hands them to Jig unparsed. It sources Jig, which finds itself by
`BASH_SOURCE` and never reads `$0`: Git bash's `exec` starts a second bash and waits for it, and
every Jig run took about 1.6 times as long — a Windows CI timeout (task `conflict-display`).

`planUpgrade` (`jig upgrade --dry-run --json`, 60 s) and `runUpgrade` (`jig upgrade --json`, 30 minutes:
at `agent.git: merge` Jig waits for CI) read one `Upgrade` schema; its `files` are not read. Jig's
human texts in it — `would_stop`, `manual_steps` — and the reasons of an `upgrade-blocked` refusal
(the `  - ` lines of its message, on `JigRefusal.reasons`) go through `withoutPaths`, which puts `…`
for an absolute path: Jig 0.35.0 names only relative ones, so the cut is a guard, tested on a real
reason with an absolute path put in (adr-20261027-upgrading-a-project-runs-in-the-background).

## Rationale

adr-20261014-jig-ui-is-an-optional-layer-over-jig, adr-20261014-stack-vue-hono-sse-on-node.
