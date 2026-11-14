---
id: adr-20261114-knowledge-decisions-are-queued-on-the-page
type: adr
status: accepted
date: 2026-11-14
domains: []
paths:
  - web/lib/decisions.ts
  - web/components/KnowledgeView.vue
  - web/views/BoardView.vue
  - server/http/app.ts
  - server/source/local.ts
  - server/jig/client.ts
summary: Knowledge decisions are queued on the project's page and sent as one write as soon as none runs (jig knowledge decide from Jig 0.44.0, one a write below), with the revision of the read after the previous write; a refusal gives all back, naming the document Jig's line names (amends adr-20261106 and adr-20261022)
reviewed_at: 2026-11-14
---
# Knowledge decisions are queued on the page and sent together as one write

## Context

adr-20261106-knowledge-decisions-from-the-page decides knowledge from the page one document a write,
and the view disabled every button while a decision was on its way: each one cost a fetch, a commit
and a push, and the person waited for each. Phase 4 of spec `jig-ui` asks for decisions in the
background (task `decisions-in-background`): what is decided while a write runs waits for the next,
and can be taken back until its write starts. Jig 0.44.0 decides several documents of any kinds in
one write: `jig knowledge decide --accept|--reject|--reviewed <id>… --revision <n> --json`, which
refuses the whole call before anything is written. Decided with the maintainer at the design gate,
2026-11-14.

## Decision

- **A press queues its document at once** — "Accepted, queued" (Rejected, Kept, Dropped) with
  **Take back** in place of its buttons; every other document keeps its buttons. Whatever is queued
  goes as one write as soon as none runs, with no timer and no Send button; what is pressed while one
  runs goes as the next. While its write runs a document reads "…, sending…" and can no longer be
  taken back. The queue is `useDecisions` (`web/lib/decisions.ts`), held by the project's page.
- **The queue lives in the project's page** and ends with it: leaving it — for another project or a
  task's details, since the page is keyed by its path — or closing it drops what is queued; the write
  under way finishes.
- **The next write carries the revision of the read after the previous one.** A write raises the
  clone's revision, so the page reads the knowledge again after each and sends the next batch with
  that read's revision — the newer of it and the one shown, since a read the change signal started
  later may not have landed yet. Jig still checks every decision against a revision the page read;
  this amends adr-20261022-writes-carry-the-revision-of-their-read only in which read that is.
- **A refusal gives back everything** — the write's decisions and the ones queued behind it, since Jig
  wrote none of them and most refusals (`git-not-allowed`, `write-still-waits`, `branch-checked-out`)
  would refuse the rest too. `stale-revision` is not retried, as that ADR says.
- **From `DECIDE_JIG_VERSION` (0.44.0) one `jig knowledge decide`** carries the batch
  (`decideKnowledge` in `server/jig/client.ts`); below it the same queue sends one decision a write
  with `jig knowledge accept|reject|reviewed`, and the client refuses more than one `usage` without
  Jig. `ReadyKnowledge.canDecideMany` tells the page which.
- `POST /api/projects/:id/knowledge/decide` takes `{decisions: [{doc, decision}, …], revision}`, each
  document once and at least one; anything else is 422 `usage`. The adapter checks every document
  against one knowledge read made then, as before; one not open refuses them all `not-found` without
  Jig.
- **A refusal names the document it stopped at** as `doc`: the one the adapter found not open, else
  the first sent document Jig's line names as a word of its own (found in `server/jig/client.ts`, so
  knowledge of Jig's words stays there), else `null`, and the page says "them".

This amends adr-20261106-knowledge-decisions-from-the-page where it rejects several ids as one
decision: each document is still one press by a person who saw it; only the write is shared. The rest
of that ADR stands.

## Alternatives

- **Send after a quiet spell** (a few seconds with no press) — batches more and gives a longer
  take-back window, but holds every decision back behind a timer on purpose. A small change on top of
  this one if the first decision going alone proves wasteful.
- **A "Send N decisions" button** — adds a press, and leaves decisions unsent when the person walks
  away believing they decided.
- **The queue on the server** — would survive closing the page, but Jig UI keeps only its registry and
  interface settings (RULES), and "queued" and "take back" would need a channel back to the page.
- **On a refusal, give back only the refused write** — the queued ones would go next and, for most
  codes, be refused the same way.
- **Below 0.44.0, every button disabled while one decision runs**, as the roadmap item words it — a
  second mode of the view; the queue sending one a write is the same code, and the person still never
  waits. The maintainer took this at the gate.
- **Retry a `stale-revision` with a fresh read** — Jig's check exists so that a person decides on what
  they saw.
- **Not naming the document** — Jig gives no code for which id it stopped at, only its line.
  adr-20261110-a-taken-id-is-told-by-the-finished-tasks rejected acting on Jig's words; here the words
  only pick which of the sent ids the page puts in front of Jig's own line, which is always shown. A
  rewording in Jig makes it `null` and the page says "them"; nothing acts on it.

## Consequences

- Any number of decisions costs a fetch, a commit and a push or two, not one each. The first press
  still goes alone.
- A decision queued behind a running write is lost if the person leaves the page before it starts —
  seconds, the time of the write ahead of it.
- One refused document gives back every queued decision, the ones Jig never saw included; the person
  presses them again.
- A Jig line that names no sent id, or names it differently, leaves the page saying "them".
