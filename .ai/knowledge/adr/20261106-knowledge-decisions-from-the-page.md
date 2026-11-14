---
id: adr-20261106-knowledge-decisions-from-the-page
type: adr
status: accepted
date: 2026-11-06
domains: []
paths:
  - server/source/local.ts
  - server/http/app.ts
  - server/jig/client.ts
  - web/components/KnowledgeView.vue
  - web/lib/knowledge.ts
summary: Knowledge waiting for a decision is decided on the project's Knowledge view with jig knowledge accept|reject|reviewed and the knowledge's revision, checked against a fresh read (not-on-branch for Jig's not-found); no Drop and no document text until Jig gives them; its paths relative to the project and a source's diff reach the page (amends the RULES path invariant)
reviewed_at: 2026-11-14
---
# Knowledge is decided from the page with Jig's commands, and its paths reach the page

## Context

Phase 4 of spec `jig-ui` lets a person decide, on a project's page, the knowledge that waits for
them (task `knowledge-decisions`): the documents proposed and nobody agreed to yet, and the approved
stubs whose linked file changed since it was approved. Jig 0.40.0 carries it (fapost-lab/jig#364):
`jig knowledge proposed --json` and `jig knowledge sources --json` list them with a revision,
`jig knowledge sources --diff <id> --json` gives a linked file's diff since approval, and
`jig knowledge accept|reject|reviewed <id> --revision <n> --json` commits a decision on the branch
`knowledge/decisions`, cut from `origin/<base>`, in a tree of its own, and goes as far as `agent.git`
allows. Decided with the maintainer at the design gate, 2026-11-06.

Discovery found three gaps in Jig 0.40.0: it gives no document's text (fapost-lab/jig#391); its
`reject` refuses an active stub (`not-proposed`), so a changed source's link cannot be dropped; and a
proposal in the checkout but not on `origin/<base>` is listed, yet a decision on it is refused
`not-found` (both fapost-lab/jig#392).

## Decision

- A fourth view of the project's page, **Knowledge**, read on demand — only while it is shown, and
  again on the project's change signal — through the port's `knowledge(id)`; a diff only when a person
  opens it, `knowledgeDiff(id, doc)`. Below `KNOWLEDGE_JIG_VERSION` (0.40.0) the view says which Jig
  the project runs.
- **Accept** and **Reject** on a proposal run `jig knowledge accept|reject`; **Keep** on a changed or
  unrecorded source runs `jig knowledge reviewed`. Each carries the revision of the knowledge the
  person saw (adr-20261022-writes-carry-the-revision-of-their-read) — never left out, since without
  it Jig decides unchecked. A missing source has no button: its link is moved in the project
  (`jig-accept`).
- The adapter checks a decision against a knowledge read made at that moment — not, as
  adr-20261022-writes-carry-the-revision-of-their-read words it, the last read it showed, since no
  held read lists knowledge — and runs Jig only for an id Jig itself lists open to it: a proposal, or
  a source not `missing`, with no decision waiting. Anything else is `refused: not-found` without
  Jig. Only ids Jig listed reach Jig's arguments, as that ADR asks.
- Jig's `not-found` on such an id becomes **`not-on-branch`**, a code of Jig UI's own, not Jig's: the
  page says the document is not on `knowledge/decisions`, which starts from origin's default branch.
  It is part of the port's contract — a hosted adapter answers it too — until fapost-lab/jig#392
  makes Jig say so itself; then it goes.
- A decision waiting on `knowledge/decisions` is shown on its document ("Accepted, waiting"), with a
  line saying where the decisions wait — the pull request, "pushed, no pull request yet", or
  "committed in this clone, not pushed".
- **No Drop**: the view says, beside Keep, that dropping a link has no Jig command yet
  (fapost-lab/jig#392). **No text**: each proposal names the file to read before deciding
  (fapost-lab/jig#391).
- **Paths reach the page.** The knowledge documents' paths relative to the project — `path`,
  `source`, the `paths` globs — and a source's diff as Jig prints it, as file content. This amends
  the RULES invariant "no path reaches `web/` but …" and convention-project-source's MUST NOT, as the
  spec's Phase 4 decision said it would. Jig's refusal messages still go through `withoutPaths`
  (`branch-checked-out` names the clone's absolute path).

## Alternatives

- **Knowledge in the project's held read** — two more Jig runs on every change under `.ai/`, for a
  view opened rarely. Settings and task documents are already read on demand.
- **A dialog from the workspace card, as Settings** — the roadmap item says "on a project's page",
  and a diff wants room. The card's attention items link to the view instead.
- **Several ids as one decision** — accepting in bulk what nobody looked at is what `jig-accept`
  warns against; Jig takes several ids, and the API can later. *Amended by adr-20261114-knowledge-decisions-are-queued-on-the-page:* several
  presses, each on one document, share a write; there is still no Accept all.
- **Waiting for jig#391** — the maintainer chose to build now and add the text later.
- **Cutting paths with `withoutPaths`** — the paths are the documents' names; a diff is file
  content, and cutting it breaks it (adr-20261030-a-task-document-is-shown-as-written).
- **Dropping a link by editing the stub** — Jig UI writes no file in a project (RULES).

## Consequences

- A decision never moves the person's checkout; it waits on `knowledge/decisions` until its pull
  request lands, and the view shows it waiting there. A rejected pull request is closed in the forge;
  Jig UI keeps nothing.
- A hosted adapter would show these paths to whoever it lets in, as a task's documents.
- With `knowledge/decisions` checked out in the person's clone, every decision is refused
  `branch-checked-out` until they switch away.
- When jig#391 or jig#392 lands, the text and Drop are small tasks on this view; a `decidable` mark
  in the read would let the view say "push it first" before Accept rather than after.
