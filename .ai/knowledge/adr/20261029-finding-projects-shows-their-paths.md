---
id: adr-20261029-finding-projects-shows-their-paths
type: adr
status: accepted
date: 2026-10-29
domains: []
paths:
  - server/source/scan.ts
  - server/source/local.ts
  - server/http/app.ts
  - web/components/FoundProjects.vue
  - web/lib/scan.ts
  - server/source/project-source.ts
  - web/api.ts
  - web/views/WorkspaceView.vue
  - web/components/ConnectForm.vue
summary: "Find projects: a scan of a folder (home by default) reading listings only, never into a repo, hidden folder or node_modules, skipping macOS-guarded home folders; its findings are shown by path in ~/ form — amends the no-path rule of adr-20261014-project-source-port-keeps-hosting-open"
reviewed_at: 2026-10-30
---
# Finding projects shows the folders it found by path, and runs nothing in them

## Context

Connecting a project needs its path typed, or `npx @fapost/jig-ui` run in it — one step per project.
A colleague asked for a button that finds every Jig project on the machine (2026-10-29). Spec
`jig-ui` had rejected a scan "for now… the way to go if one command per project proves too much".
The findings are folders the person has not connected, so they have no id yet, and RULES held that
no path reaches `web/` (adr-20261014-project-source-port-keeps-hosting-open: "Projects are named by
id in the API and on the page, never by path"). Task `scan-projects`, design approved by the
maintainer on 2026-10-29.

## Decision

- **Find projects** on the Projects page looks through the folder typed in the connect field, or the
  home folder when it is empty: `POST /api/scan {folder?}` → `ProjectSource.scan(folder)`, walked by
  `server/source/scan.ts` in the local adapter. A path that is not a folder is refused
  `422 not-a-folder`.
- A project found is a folder with a `.git` **directory** and Jig's script (`hasJig`). The walk reads
  folder listings only — no Jig, no git, no file opened, nothing written — never walks into a
  repository, a hidden folder, `node_modules` or a symbolic link, goes 5 folders deep and through at
  most 20 000, and says when that limit stopped it.
- In the home folder it passes over Desktop, Documents, Downloads, Movies, Music and Pictures on
  macOS — macOS asks before an app reads them — and names them in its answer; Library on macOS and
  AppData on Windows without a word. A folder the person types is looked through even so.
- **Amends** adr-20261014-project-source-port-keeps-hosting-open, for this one answer: the scan names
  the folder it looked through and what it found there by path, with `~` for the home folder — a
  form the connect field takes — and only under the folder the person named. Connected projects stay
  named by id everywhere; the connected ones a scan meets are only counted.
- Connect on a found one posts its path to the existing `POST /api/projects`: a found project and a
  typed one go through one check and one refusal.

## Alternatives

- Opaque handles, no path on the page: the page would show the id a project would get — its folder
  name, which says nothing of where it is — and two `api` folders could not be told apart.
- Connecting everything found: it would run Jig in projects nobody chose; connecting is the consent
  to run a project's Jig (`docs/projects.mdx`).
- `git rev-parse` per candidate, as connect does: exact for odd layouts (a `--separate-git-dir`
  clone, found by its `.git` file, is passed over), but it runs git in folders nobody chose yet;
  connect still checks each one picked.
- A separate form, or a dialog, with its own folder field: one more field for the same path.

## Consequences

- A hosted adapter scans on the projects' machine, or has no scan; paths then leave that machine only
  for the person who asked.
- A project in a folder macOS asks about, or deeper than 5, is found only when its folder is typed.
- The walk measured 48 ms over a home folder of 105 folders (macOS, 2026-10-29); the limit of
  20 000 folders bounds a larger one.
