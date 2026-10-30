# Jig UI

A local control center for [Jig](https://github.com/fapost-lab/jig) projects. One page shows every
task and epic of every connected project, so a person running several agents across several projects
sees what is running, what waits for them and in what order the work goes.

Jig UI is optional: Jig works exactly as before without it. Task files and artifacts stay the source
of truth, and every change Jig UI makes goes through Jig's own commands.

## What it does

- **Projects** — every connected project with what needs you: gates, pull requests waiting for
  review, stopped phases. Upgrade a project's Jig from its card, or all of them at once; an upgrade
  that ends in a pull request is brought in with **Check merge** once it is merged.
- **Board** — a project's tasks by stage. File a task, order the queue, pause, resume and close a task.
- **Task details** — where a task stands, its place in the queue, its pull request, what Jig offers
  to do next, and the documents its workspace holds.
- **Specs** — specifications and their roadmaps, epics in order, and a question for your agent about a
  spec.

## Requirements

- Node.js 24 or later — or none at all, see [Without Node.js](docs/installation.mdx#without-nodejs).
- git.
- Jig 0.31.0 or later in each project you connect. Some features need a newer Jig; see
  [Requirements](docs/requirements.mdx).

## Quick start

In a Jig project's folder:

```bash
npx @fapost/jig-ui
```

It starts a server on `127.0.0.1:4870`, connects the project and opens its board in your browser.
Connect your other projects from the page.

To keep it running without a terminal:

```bash
npx @fapost/jig-ui start
```

`stop`, `status`, `open` and `reset-token` manage it; `--port <n>` and `--no-open` change how it
starts. Every merge to `main` is published under the `next` tag: `npx @fapost/jig-ui@next`.

## Security

The server listens on `127.0.0.1` only and checks `Host` and `Origin`. The link it opens carries a
token kept in Jig UI's config folder, readable only by you; `jig-ui reset-token` makes a new one.

## Documentation

- [Requirements](docs/requirements.mdx)
- [Installation](docs/installation.mdx) — options, background mode, the token, the development channel
- [Projects](docs/projects.mdx) — connecting projects, upgrades, the board, tasks and specs
- [Changelog](docs/changelog.mdx)

## Development

```bash
npm ci
npm run dev        # build and watch the server and the page
npm test           # vitest
npm run typecheck
npm run lint
```

The server is Node.js with Hono (`server/`), the page is Vue (`web/`). Work in this repository goes
through Jig itself: see [AGENTS.md](AGENTS.md). How a release is cut is in [RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)
