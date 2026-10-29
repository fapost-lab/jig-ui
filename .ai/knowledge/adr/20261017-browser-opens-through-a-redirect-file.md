---
id: adr-20261017-browser-opens-through-a-redirect-file
type: adr
status: accepted
date: 2026-10-17
domains: []
paths:
  - server/open-browser.ts
  - "server/registry/**"
summary: The token reaches the browser through open.html in the config dir, never as a process argument
reviewed_at: 2026-10-17
---
# The browser is opened through a redirect file in the config directory, never with the token in a command line

## Context

The start command opens the browser on a link that carries the access token
(adr-20261014-local-server-access-guard). Handing that link to `open`, `xdg-open` or
`explorer.exe` puts the token in a process's arguments, and `ps` shows every user of the machine
the arguments of every process on Linux and macOS — while the ADR says another user must not reach
the server. Task `walking-skeleton`, decided with the maintainer on 2026-10-17.

## Decision

- The opener writes `open.html` — a page that sends the browser on to the link (`meta refresh` and
  `location.replace`) — into the config directory, atomically, 0600 inside the 0700 directory, and
  runs the system opener (`open` / `xdg-open` / `explorer.exe`) with `execFile` on that file path.
  The token is in the file, never in an argument.
- There is one `open.html`; each opening overwrites it. The process that opened the browser does
  not remove it — a second start exits at once, maybe before the browser read the file. The running
  instance removes it together with `instance.json` when it stops, and only while `instance.json`
  still holds its token.
- When no browser can be started, or with `--no-open`, the link is printed instead; the terminal
  is the user's own.

## Alternatives

- The link with the token as the opener's argument — simplest; any user's `ps` shows the token.
- The `open` package — the same argument problem, plus a dependency for three commands.
- The redirect file in a fresh `os.tmpdir()` directory, removed by a timer — files with a live
  token piled up after every second start, outside the config directory (review finding F1).
- A second start that waits a few seconds and then removes the file — the terminal hangs, and a
  browser started cold may still miss the file.

## Consequences

- After a crash (`kill -9`) `open.html` stays with a dead token, like `instance.json`. The next
  start overwrites `instance.json`; `open.html` is overwritten by the next start that opens a
  browser and removed by the next normal stop.
- `open.html` is one more file Jig UI keeps in the config directory; RULES names it.
- A browser that sends `Origin: null` on the redirect would be refused by the `Origin` check;
  Chrome does not (checked 2026-10-17). If one does, the fix is allowing `null` on `GET /?token=`
  only.
