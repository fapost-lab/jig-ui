---
id: convention-jig-client
type: convention
status: active
domains: []
paths:
  - "server/jig/**"
summary: JigClient alone runs jig (execFile, bash on Windows) and validates its JSON; never reads Jig's files
reviewed_at: 2026-10-22
---
# JigClient — the only module that knows Jig

## Practice

```
JigClient (server/jig/)

MAY:      run `jig` in a project's main checkout; parse and validate its JSON; check the
          project's Jig version
MUST:     use execFile without a shell — on Windows Git's bash running .ai/scripts/jig, never
          jig.cmd; validate every response against the shape its contract test pins; turn a
          refusal into Jig's failure code
MUST NOT: read or write Jig's files directly (`state`, roadmaps, the queue file); call the
          network; let a shape of Jig's output leak past its own types
Why:      a change of Jig's contract must be a change here and in its contract tests only, and
          Jig's files are not a contract Jig promised.
```

The minimum Jig the package reads is `MIN_JIG_VERSION` in `server/jig/client.ts` — 0.31.0, the
first Jig with a queue (0.29.0 was the first that prints JSON). `jig` runs as `bash .ai/scripts/jig`; on Windows the bash is Git's,
found from `git --exec-path` (`<git>/mingw64/libexec/git-core` → `<git>/bin/bash.exe`), never a
`bash` on PATH, which may be WSL's. It is asked once per process; a failed ask is not kept.

Each shape of Jig's output is one zod schema, written as Jig prints it and turned into Jig UI's
camelCase by its `.transform`; the exported types are its `z.output`
(adr-20261018-jig-answers-checked-by-zod-schemas). Keys Jig adds without raising `schema` are
dropped by `z.object`, so nothing Jig UI does not read gets past `server/jig/`.

## Example

A task-list read runs Jig's JSON task listing, checks the envelope, then `data` through the
`TaskList` schema — the status among Jig's own words — and returns typed tasks. Jig's refusal throws `JigRefusal` with its code
(an unknown code is `failed`); an envelope of another shape throws `JigShapeError`, which the
project shows as `incompatible` ("update Jig UI"), never half-parsed. Each read has a contract
test over a fixture in `server/jig/fixtures/`.

A write — `moveInQueue`, `setPriority`, `requestPause`, `cancelPause` — names a task as
`task:<id>`, passes `--revision <n>` and `--json`, and goes through the same envelope check:
`stale-revision`, `not-found`, `usage`, `already-exists` and `failed` come back as `JigRefusal`
codes. Its success answer carries the revision before
the write, so the caller reads again; a test pins each command's arguments and a refusal.

## Rationale

adr-20261014-jig-ui-is-an-optional-layer-over-jig, adr-20261014-stack-vue-hono-sse-on-node.
