---
id: feature-settings
type: feature
status: active
domains: []
paths:
  - web/components/SettingsDialog.vue
  - web/lib/settings.ts
  - "server/jig/fixtures/config-*.json"
summary: "The settings dialog from a project card's menu: the project's Jig settings read-only, the person's own changed through jig config set|unset --local; why the token is only cleared and every change ends in a read"
reviewed_at: 2026-11-06
---
# Settings — a project's Jig settings in a dialog

## What

**Settings…** in a ready project's ⋯ menu on its card (`web/components/ProjectCard.vue`) opens a
dialog (`web/components/SettingsDialog.vue`, held by `web/views/WorkspaceView.vue`) with every key
`jig config keys --json` lists, in Jig's order, in two parts (`parts` in `web/lib/settings.ts`):

- **Yours, in this clone** — the keys whose `scope` is `local` or `local only`: the clone's
  gitignored `.ai/config.local.yaml` may answer them, and its value wins. Each is changed in place
  (`control`): a checkbox for a `boolean`, a choice for a `choice` with its `allowed` values, a field
  with **Save** for the rest; **Unset** (`jig config unset <key> --local`) on a key the clone's file
  answers, so the project's value or Jig's default answers again.
- **The project's, shared through git** — the keys only `.ai/config.yaml` answers (`scope:
  project`), shown and never changed.

Each key carries Jig's description and where its value comes from (`sourceLine`). The server side is
`GET /api/projects/:id/settings`, `POST …/settings` (`{key, value, revision}`) and
`POST …/settings/unset` (`{key, revision}`), through the port's `settings`, `setSetting` and
`unsetSetting` (convention-project-source) and JigClient's config calls (convention-jig-client).

## Why

- A person's Jig settings were a terminal and a YAML file away; the dialog shows them all with Jig's
  own words for each, and changes the person's own with a click (spec `jig-ui`, Phase 4).
- Changes go through `jig config set|unset --local`, so Jig checks each value and the revision, as
  for every write (RULES: every change is a `jig` command). The page sends any text; what Jig
  refuses comes back as Jig's reason (`settingRefusal`), the key named once.

## Constraints

- **The project's keys are read-only.** `.ai/config.yaml` is committed: a change made from the page
  would sit uncommitted in the main checkout, for everyone working on the project, and Jig 0.40.0
  itself calls that file "edited by hand" (its `not-local` refusal).
- **The Telegram token is only cleared.** Jig refuses it on a command line (`secret-key`: ps, the
  shell history and a transcript would keep it); the page names `jig notify setup` instead. Its
  value never reaches the server: Jig prints a secret only as set or not.
- **The key and the value are a person's text**, not ids Jig returned — as for filing a task
  (adr-20261022-filing-a-task-carries-no-revision). `server/http/` takes a key of Jig's grammar
  (`a.b`, lower case) and a value of one line, at most 500 characters; JigClient passes each as one
  argument, without a shell; Jig refuses the rest (`unknown-key`, `invalid-value`, and `usage` for a
  value that is one of its flags). No value takes `--local` off the command or reaches
  `.ai/config.yaml` (Jig 0.40.0's `config set`, read at the review).
- **A list is shown, not edited:** no key of the person's own takes one in Jig 0.40.0.
- **Every change ends in a new read.** Refused, stale or written, the dialog reads the settings
  again and shows what is now true; a stale revision is said ("The settings changed since they were
  shown…"), never retried. A field's unsaved text is dropped with that read; the notice quotes the
  refused value.
- The notice stays at the dialog's top edge while it scrolls: a change is made deep in a long list,
  and a notice at the top of the content went unseen (browser check, task `settings-dialog`).
- A key with no value reads `not set`, never `none`: `none` is one of `agent.git`'s levels.
- A choice with no value is given `null`, never `undefined`: given `undefined`, Reka's Select keeps
  a value of its own and went on showing a pick Jig had refused (review of task `settings-dialog`).
- A value comes without its absolute paths (`withoutPaths`, convention-jig-client): a key such as
  `run.path` may show `…`, and is set again by typing it whole, or in a terminal.
- Needs Jig 0.40.0 (`SETTINGS_JIG_VERSION`). Below it **Settings…** is still offered and the dialog
  says which Jig the project runs, as a task's documents do below 0.39.0: the page compares no
  versions itself.

## Decisions and rejected alternatives

- Editing the project's keys through `jig config set` without `--local` — rejected: the constraint
  above.
- Setting the token from the page, as the roadmap item first said ("set or cleared") — dropped:
  Jig 0.40.0 refuses it on a command line, and the item now says "only cleared".
