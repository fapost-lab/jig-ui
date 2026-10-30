---
id: adr-20261030-a-task-document-is-shown-as-written
type: adr
status: accepted
date: 2026-10-30
domains: []
paths:
  - server/jig/client.ts
  - server/source/local.ts
  - server/http/app.ts
  - web/components/TaskDocuments.vue
  - web/lib/markdown.ts
summary: "A task's documents on its full details page: read through Jig 0.39.0 on demand, shown as written, paths included, rendered with marked and cleaned by DOMPurify before v-html — amends the no-path rule of adr-20261014-project-source-port-keeps-hosting-open"
reviewed_at: 2026-10-30
---
# A task's documents are shown as their authors wrote them, rendered from Markdown and cleaned of anything that runs

## Context

A colleague asked to see a task's documents — task, discovery, design, plan, review… — from its
full details page (2026-10-29, task `card-fields-and-artifacts`, split into `task-artifacts`). Jig
0.39.0 lists them and reads one as JSON (`jig task artifacts <id> --json`,
`jig task artifact read <id> <kind> --json`, fapost-lab/jig#347), from wherever the task's workspace
is, a worktree's included. A document is free text agents and people wrote, and nothing stops one
naming an absolute path; RULES held that no path reaches `web/` but Find projects' answer
(adr-20261014-project-source-port-keeps-hosting-open, amended by
adr-20261029-finding-projects-shows-their-paths), and feature-task-details drops an action's
`reason` for that rule. Task `task-artifacts`, design approved by the maintainer on 2026-10-30.

## Decision

- The full details page lists a task's documents that are there, and a click reads one through the
  project's Jig (0.39.0) — `GET /api/projects/:id/tasks/:task/artifacts[/:kind]` →
  `ProjectSource.artifacts` / `artifact` → `readArtifacts` / `readArtifact` in `server/jig/`. Read on
  demand, never kept with the board's read; nothing is written.
- **Amends** adr-20261014-project-source-port-keeps-hosting-open, for this one answer: a document's
  content reaches the page as its authors wrote it, a path in it included. The API names no path of
  its own: a document's kind, time and size, and Jig's fixed word for one it cannot read.
- The page renders the Markdown in the browser (`web/lib/markdown.ts`): `marked`, GitHub-flavoured,
  then DOMPurify, which takes out scripts, event handlers and frames, and forms and their controls
  besides; only that function's output goes to `v-html`. The API carries the text as Jig gave it.

## Alternatives

- Cutting every absolute path with `withoutPaths`, as Jig's refusals are: it also cuts routes such
  as `/api/projects` — a design document would read as a row of `…`.
- Replacing only the home folder and the project's root: any other absolute path still passes, so
  the rule needs this amendment anyway.
- Plain text, no dependency and no `v-html`: proposed first; set aside by the maintainer at the gate,
  as a document read raw.
- Rendering on the server: the API would carry HTML, and DOMPurify would need a DOM there (jsdom).
- `@tailwindcss/typography` for the rendered document: a third dependency for a dozen rules; the
  component styles Markdown's elements with Tailwind's arbitrary variants.

## Consequences

- Two dependencies of the page, `marked` and `dompurify` — devDependencies, as the page ships built.
  A DOMPurify update is a security fix to take.
- A path an agent wrote into a plan is shown to whoever opens it; a hosted adapter would show it to
  the people that adapter lets in, as their editor would.
- A project on a Jig older than 0.39.0 says so in the section instead of listing documents.
- The documents are not in the board's read: each list and each open document is a Jig run when the
  page asks, for a task live in the last read only — an id the address made up, or a finished
  task's, reaches no Jig — and none while the project upgrades
  (adr-20261027-upgrading-a-project-runs-in-the-background).
