---
id: feature-knowledge
type: feature
status: active
domains: []
paths:
  - web/components/KnowledgeView.vue
  - web/lib/knowledge.ts
  - "server/jig/fixtures/knowledge-*.json"
summary: "The Knowledge view of a project's page: proposals to accept or reject and changed linked files to keep after their diff, read on demand from Jig 0.40.0, decisions waiting on knowledge/decisions marked; linked from the workspace card's attention items"
reviewed_at: 2026-11-06
---
# Deciding knowledge

## What

The fourth view of a project's page, **Knowledge** (`web/components/KnowledgeView.vue`, its words in
`web/lib/knowledge.ts`), shows what waits for the person in the project's knowledge, as Jig 0.40.0
lists it (`readKnowledge` in `server/jig/client.ts`: `jig knowledge proposed --json` and
`jig knowledge sources --json`, at the lower of their revisions), served by
`GET /api/projects/:id/knowledge` from `ProjectSource.knowledge(id)`:

- **Proposed** — each document nobody agreed to yet, in Jig's order: its id, type, summary and file;
  the paths and domains it would bind agents to; for a stub, the file it links and its size, or that
  the file is gone; the file to read before deciding; **Accept** and **Reject**.
- **Changed sources** — each approved stub whose linked file is `changed`, `unrecorded` (no approved
  text kept) or `missing`. A changed one's **Diff since approved** opens Jig's unified diff
  (`GET /api/projects/:id/knowledge/:doc/diff`, `jig knowledge sources --diff`), plain text in a
  `<pre>`, each line toned by its first character; **Keep** (`jig knowledge reviewed`) on changed
  and unrecorded; a missing one has no button.

A decision is `POST /api/projects/:id/knowledge/decide` `{doc, decision, revision}`, Jig's
`jig knowledge accept|reject|reviewed` (adr-20261106-knowledge-decisions-from-the-page). A decided
document stays listed — Jig lists it until `knowledge/decisions` lands — marked "Accepted, waiting",
"Rejected, waiting" or "Kept, waiting", under a line saying where the decisions wait. The workspace
card's attention items `knowledge-proposed` and `sources-changed` link to the view
(`#/projects/<id>?view=knowledge`; the board drops `view` from the address once shown).

## Why

`jig-accept` asks a person to decide proposed knowledge one document at a time, in an agent
session. A proposal nobody decides is invisible to `jig context`: knowledge written and never agreed
to reaches no agent. The page shows what waits and decides it with Jig's own commands, so the
decision is the same one an agent session would commit.

## Constraints

- **Read on demand.** Two Jig runs per read, only while the view is shown and on the project's change
  signal; never part of the held read the board serves (convention-project-source).
- **Only what Jig listed reaches Jig.** A diff runs for an id the sources read just before lists as
  `changed`; a decision for an id the knowledge read just before lists open to it, with no decision
  waiting. Anything else is `not-found` without Jig.
- **Paths are shown as Jig gives them**, relative to the project; Jig's refusal messages lose theirs
  (adr-20261106-knowledge-decisions-from-the-page).
- **One decision at a time**: while one is on its way, every button in the view is disabled.

## Decisions and rejected alternatives

Task `knowledge-decisions` (2026-11-06), decided with the maintainer at the design gate.

- **No document text yet**: Jig 0.40.0 gives none (fapost-lab/jig#391); each proposal names the file
  to read. Built now, the text added in a small task once Jig gives it.
- **No Drop**: Jig 0.40.0's `reject` refuses an active stub (`not-proposed`); the view says so beside
  Keep (fapost-lab/jig#392).
- **A proposal not on `origin/<base>`** is listed but refused `not-found` by Jig; the adapter turns it
  into `not-on-branch` and the page says to push the commit that proposed it, or let the decisions
  waiting land (fapost-lab/jig#392 asks Jig to say so in the read).
- **A view, not a dialog**; **one id per decision**, not Accept all — see the ADR.
