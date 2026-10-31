---
id: adr-20261031-jig-ui-asks-npm-for-a-newer-release
type: adr
status: accepted
date: 2026-10-31
domains: []
paths:
  - server/release.ts
summary: "Jig UI's one request of its own to the internet: npm's dist-tags for @fapost/jig-ui, once a day at most, so the header can say a newer release is out with the stop command for how it was started; silent offline, off with NO_UPDATE_NOTIFIER"
reviewed_at: 2026-10-31
---
# Jig UI asks npm's registry, once a day at most, whether a newer Jig UI is out, and the header says so

## Context

Nothing told a person a newer Jig UI was out, and a running Jig UI keeps running when it is started
again — `npx @fapost/jig-ui` only opens it — so a person could stay on an old one for weeks. A
colleague asked for a check (2026-10-31); the maintainer chose a notice with the command over updating
from the page (spec `jig-ui`, Phase 4, item "a newer Jig UI"; task `newer-jig-ui`). Until then Jig UI
made no request of its own to the internet: Jig does, the installer does, the running server did not.

## Decision

- The running instance — a start in the foreground, or `serve` in the background — asks
  `https://registry.npmjs.org/-/package/@fapost/jig-ui/dist-tags` (`server/release.ts`), the first
  time the page reads `GET /api/instance/newer` and again once a day has passed; the answer, whatever
  it was, is kept in memory for the day. `createApp` asks nothing unless `main.ts` gives it the check,
  so no test reaches the network.
- `GET /api/instance` stays as it was, `{ version }` at once: it is how the CLI tells a running
  instance (`up`, `gone`, `silent` after 1 s or 3 s), and a registry that hangs must not make
  `jig-ui stop` or a second start take Jig UI for silent (the review of task `newer-jig-ui`).
- A build of the development channel (`x.y.z-next.n`) compares with the `next` tag, any other with
  `latest`; by release numbers, then by build — a version that is only different is not newer.
- `GET /api/instance/newer` answers `newer: { version, stop } | null`. `stop` is `jig-ui stop` when
  Jig UI runs on the Node.js `install.sh` downloaded — `process.execPath` inside `jig-ui/node` of the
  data folder the script uses — which puts no npx on PATH; else `npx @fapost/jig-ui stop`, which works
  wherever the machine has a Node.js, through the script's command too. The page reads it after the
  version and shows one line under the header: the version, and that command followed by "then start
  Jig UI again" — again the way the person started it, which covers a background instance and the
  development channel without the page guessing.
- 3 s at most; a failure of any kind — no network, a refusal, an answer it cannot read — is `null`, and
  the page says nothing. `NO_UPDATE_NOTIFIER` set turns the request off.
- The request carries the package's name only: nothing about the person, the machine's projects or
  their paths.

## Alternatives

- Updating Jig UI from the page — the server would replace and restart itself, for what is one line
  in a terminal (the maintainer).
- The package's own registry document — every version's manifest, hundreds of kilobytes over time,
  for two version numbers.
- GitHub's releases API — 60 requests an hour unauthenticated per address, and no `next` builds.
- The page asking the registry itself — each open tab would ask, and the page, which talks only to
  its own server, would reach outside it.
- A check on every read of the instance — traffic for an answer that moves a few times a month.
- "Different from the running version" as newer — a build ahead of the release (a development build,
  a version raised before publishing) would be offered an older one.

## Consequences

- A machine with Jig UI running sends one small request to npm a day; `NO_UPDATE_NOTIFIER` is the
  way to stop it, and the docs say so (`docs/installation.mdx`, Updating).
- A page left open for days learns of a release only when it is reloaded: the header reads the
  instance once.
- Telling the downloaded Node.js by its path needs nothing from `install.sh`, so a `jig-ui` command
  an earlier script wrote is told `jig-ui stop` too. Rejected for it: a variable the launcher sets —
  old launchers lack it, and it is one more thing the installer's tests must hold. If `install.sh`
  moves its Node.js, `ownNode` in `server/release.ts` moves with it.
- A hosted Jig UI asks from its own machine; what it shows is the hosted one's version, not the
  person's.
