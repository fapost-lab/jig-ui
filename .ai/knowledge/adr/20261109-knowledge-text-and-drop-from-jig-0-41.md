---
id: adr-20261109-knowledge-text-and-drop-from-jig-0-41
type: adr
status: accepted
date: 2026-11-09
domains: []
paths:
  - server/source/local.ts
  - server/http/app.ts
  - server/jig/client.ts
  - web/components/KnowledgeView.vue
  - web/lib/knowledge.ts
  - web/lib/markdown.ts
reviewed_at: 2026-11-09
summary: From Jig 0.41.0 the Knowledge view shows a proposed document's text and drops a linked file's link; Jig's decidable is said above the buttons, Jig judges what is sent, and rendered() shows raw HTML and relative links as text
---
# From Jig 0.41.0 the Knowledge view shows a proposal's text and drops a changed link, and Jig judges what can be decided

## Context

adr-20261106-knowledge-decisions-from-the-page built the Knowledge view on Jig 0.40.0, without a
document's text (fapost-lab/jig#391) and without Drop (fapost-lab/jig#392), and turned Jig's
`not-found` on a document missing from `knowledge/decisions` into Jig UI's own `not-on-branch`. Jig
0.41.0 closes both issues (task `knowledge-drop-and-text`, found on a scratch project with a bare
origin, 2026-11-09):

- `jig knowledge read <id> --json` gives a document's whole file, frontmatter included, and for a stub
  the file it links as it is now (`source`, `null` when the file is gone), each with `lossy`.
- `jig knowledge reject` drops the link of an approved stub whose file is `changed`, `unrecorded` or
  `missing`; the source then reads `waiting.decision: "rejected"`.
- Every record of `knowledge proposed|sources --json` carries `decidable`, `reason` (`not-on-base`,
  `not-on-branch`) and `lossy`. `decidable` is judged as of the last fetch.
- New refusals: `not-on-base`, `not-on-branch` and `write-still-waits`, each with a message saying
  what to do.

## Decision

- **One version for all of it**, `KNOWLEDGE_TEXT_JIG_VERSION` (0.41.0): the three came in one
  release. The knowledge read answers `canRead` and `canDrop`; below 0.41.0 both are false and the
  view is as the 2026-11-06 ADR has it.
- **A proposal's text** is read when the person opens its **Document**, through
  `knowledgeText(id, doc)` and `GET /api/projects/:id/knowledge/:doc/text`, and again with each read
  of the list while it stays open. Jig runs only for an id the proposals read just before lists. The
  page cuts the frontmatter, whose fields it shows above the text. A stub shows its own text and the
  file it links. A Markdown file (`.md`, `.mdx`, `.markdown`) goes through `rendered()`; any other
  file is shown as it is in a `<pre>`.
- **`rendered()` shows raw HTML as written.** Jig's templates hold placeholders such as
  `# <Title of the linked source>`, which marked passed on as a `<title>` tag: a browser reads all
  that follows as the title's text, and DOMPurify took the whole stub out. Raw HTML is now escaped;
  a comment stays a comment, unseen. A relative link (a stub's `../../../docs/rules.md`) would lead to
  the page's own address, where no such file is: it shows as its text. DOMPurify still cleans what
  marked gives. This applies to a task's documents too
  (adr-20261030-a-task-document-is-shown-as-written).
- **Drop** beside Keep, and alone on a missing file: `reject` on a source the read lists with no
  decision waiting. It reads "Dropped, waiting" until `knowledge/decisions` lands.
- **`decidable: false` is said above the buttons, which stay**: push the commit, or decide once the
  decisions waiting have landed. Nothing on the page fetches, and the read's `decidable` is as of
  the last fetch; Jig's write fetches first, so a decision sent after the push goes through. The
  adapter does not refuse such a decision itself either: Jig judges what is sent, and a refusal
  comes back with Jig's code and line.
- **Jig's codes come through.** `not-on-base`, `not-on-branch` and `write-still-waits` are Jig
  codes, carried with Jig's line as reasons. Jig UI's own `not-found` → `not-on-branch` mapping stays
  only below 0.41.0, where Jig cannot say it. From 0.41.0, Jig's `not-found` means what it says.
- **`lossy`** is said on a text ("Jig dropped bytes of it that are not UTF-8"), and on a record,
  whose file name may then be another file's.
- **Paths reach the page further**: a proposed document's whole text and the file a stub links, as
  file content. This amends the RULES path invariant again, as the 2026-11-06 ADR did for the paths
  and a diff. Jig's refusal lines still lose their paths (`withoutPaths`).

## Alternatives

- **The adapter refusing `decidable: false` without Jig** — planned first, dropped while
  implementing. A record read before someone pushed or landed the decisions would stay refused,
  though Jig, fetching first, would take the decision.
- **`decidable: false` hiding the buttons** — first built so. Nothing on the page fetches, so a
  person who pushed would see no button until some later fetch updated the read.
- **A version constant each for text, Drop and `decidable`** — they came in one Jig.
- **The frontmatter shown as it is** — its fields are on the record above the text, in words.
- **Raw HTML through to DOMPurify, as before** — every stub Jig writes then shows empty. **An
  allowlist of tags** shown as HTML — more code for documents that rarely carry HTML.
- **A changed source's whole file** too — its diff is there, and an `unrecorded` one is read in the
  project; the roadmap item named proposed documents.

## Consequences

- adr-20261106-knowledge-decisions-from-the-page still holds below Jig 0.41.0. Its "no Drop", "no
  text" and `not-on-branch` mapping hold only there.
- Each open text costs three Jig runs, read again with each read of the list, as an open diff does.
- A task's document shows its placeholders (`<id>`) and any raw HTML as text, and a relative link
  as its text.
- `write-still-waits` reaches a roadmap edit by its code too, not as `failed`; the page's line, Jig's
  own words, is unchanged.
