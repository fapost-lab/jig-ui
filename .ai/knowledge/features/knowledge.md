---
id: feature-knowledge
type: feature
status: active
domains: []
paths:
  - web/components/KnowledgeView.vue
  - web/lib/knowledge.ts
  - "server/jig/fixtures/knowledge-*.json"
summary: "The Knowledge view of a project's page: proposals to accept or reject after reading their text, and changed linked files to keep or drop after their diff, read on demand from Jig 0.40.0 (text and Drop from 0.41.0), decisions waiting on knowledge/decisions marked; linked from the workspace card's attention items"
reviewed_at: 2026-11-09
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
  the file is gone; **Accept** and **Reject**. From Jig 0.41.0 its **Document** opens its text
  (`GET /api/projects/:id/knowledge/:doc/text`, `jig knowledge read`), the frontmatter cut, and for a
  stub the file it links as it is now: Markdown through `rendered()`, any other file in a `<pre>`.
  Below 0.41.0 the proposal names the file to read before deciding. A record Jig reads as not
  decidable as of the last fetch (`decidable: false`) says why above its buttons: push the commit,
  or decide once the decisions waiting have landed.
- **Changed sources** — each approved stub whose linked file is `changed`, `unrecorded` (no approved
  text kept) or `missing`. A changed one's **Diff since approved** opens Jig's unified diff
  (`GET /api/projects/:id/knowledge/:doc/diff`, `jig knowledge sources --diff`), plain text in a
  `<pre>`, each line toned by its first character; **Keep** (`jig knowledge reviewed`) on changed
  and unrecorded; from Jig 0.41.0 **Drop** (`jig knowledge reject`) on all three, which ends the
  link. Below 0.41.0 a missing one has no button.

A decision is `POST /api/projects/:id/knowledge/decide` `{doc, decision, revision}`, Jig's
`jig knowledge accept|reject|reviewed` (adr-20261106-knowledge-decisions-from-the-page). A decided
document stays listed — Jig lists it until `knowledge/decisions` lands — marked "Accepted, waiting",
"Rejected, waiting", "Kept, waiting" or "Dropped, waiting", under a line saying where the decisions
wait. Bytes Jig dropped as not UTF-8 are said, on a text and on a record whose file name may then be
another file's. The workspace
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
  `changed`, a text for an id the proposals read lists; a decision for an id the knowledge read just
  before lists open to it, with no decision waiting. Anything else is `not-found` without Jig.
- **Paths are shown as Jig gives them**, relative to the project; Jig's refusal messages lose theirs
  (adr-20261106-knowledge-decisions-from-the-page).
- **One decision at a time**: while one is on its way, every button in the view is disabled.

## Decisions and rejected alternatives

Task `knowledge-decisions` (2026-11-06), decided with the maintainer at the design gate.

- **On Jig 0.40.0, no document text and no Drop**: Jig gives no text (fapost-lab/jig#391), and its
  `reject` refuses an active stub (`not-proposed`); the view names the file to read and says Drop has
  no Jig command. A proposal not on `origin/<base>` is listed but refused `not-found`; the adapter
  turns it into `not-on-branch`.
- **From Jig 0.41.0** (task `knowledge-drop-and-text`, adr-20261109-knowledge-text-and-drop-from-jig-0-41): the text and Drop, one
  version for both; Jig's `decidable` puts its reason above the buttons, which stay, and the adapter
  sends what it is sent, since Jig fetches before it judges; Jig's own `not-on-base`, `not-on-branch` and `write-still-waits` come
  through with its line. A Jig template's placeholders (`<Title of the linked source>`) show as
  written: `rendered()` escapes raw HTML; a relative link, which would lead to the page's own
  address, shows as its text.
- **A view, not a dialog**; **one id per decision**, not Accept all — see the ADR.
