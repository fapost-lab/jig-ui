---
id: adr-20261018-jig-answers-checked-by-zod-schemas
type: adr
status: accepted
date: 2026-10-18
domains: []
paths:
  - server/jig/client.ts
  - package.json
summary: Each shape of Jig's JSON is one zod schema in server/jig/client.ts; its z.output is the exported type; unknown keys dropped
reviewed_at: 2026-10-18
---
# Jig's answers are checked by zod schemas

## Context

`server/jig/client.ts` checked every shape of Jig's JSON by hand: a guard per field, a type per
shape written beside it, and the mapping to camelCase in between — 412 lines where the type and the
check could drift apart. Task `review-fixes`, decided with the maintainer on 2026-10-18 ("zod
давай").

## Decision

- Each shape of Jig's output is one zod schema in `server/jig/client.ts`, written as Jig prints it
  (snake_case, every field Jig UI reads present, `null` where Jig has nothing) and turned into Jig
  UI's camelCase by its `.transform`. The exported types are `z.output` of the schemas, so the type
  and the check are one text.
- A schema that does not match throws `JigShapeError`, as the hand-written checks did: the project
  shows as `incompatible`, never half-parsed.
- `z.object` drops keys Jig adds without raising `schema`, so nothing Jig UI does not read — a
  worktree's path among them — reaches past `server/jig/`.
- `zod` `^4.6.7` is a runtime dependency of the package.

## Alternatives

- Hand-written guards (what was there) — no dependency; type and check kept in step by hand.
- valibot — smaller, tree-shaken; size matters little for a server package, and its API is less
  known.
- Standard Schema with a library chosen later — an indirection for one library.

## Consequences

- One more runtime dependency, plain JavaScript with none of its own (~6 MB unpacked, server only).
- A field Jig drops or renames fails the read and its contract test over the fixture, as before.
- `server/jig/client.ts` went from 412 to 308 lines.
