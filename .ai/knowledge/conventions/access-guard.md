---
id: convention-access-guard
type: convention
status: active
domains: []
paths:
  - "server/http/**"
summary: "MAY/MUST/MUST NOT for the replaceable access guard in server/http: every route, /api needs the token, no route decides access"
reviewed_at: 2026-10-18
---
# AccessGuard — who may use the server

## Practice

```
AccessGuard (server/http/access.ts)

MAY:      admit or refuse a request; exchange a credential for a session cookie;
          answer 401/403 itself
MUST:     run before every route, static files included; refuse every /api/* request it
          cannot attribute to the user; compare secrets in constant time
MUST NOT: read or log the credential anywhere but the comparison; let a route decide access
          itself; widen the bind address (that is main.ts's refusal, tied to which guard is in place)
Why:      a hosted Jig UI swaps the guard, not the routes; a route that checks access on its
          own survives the swap and keeps the old rule.
```

`secureHeaders` (no HSTS: the server is plain http on 127.0.0.1) runs before the guard so its
refusals carry the headers too; it sets headers and decides no access.

## Example

The local guard today is two middlewares applied to every route in `createApp`: `localOnly`
refuses a foreign `Host` or `Origin` (403); `tokenAccess` swaps `/?token=<t>` for a cookie named
`jig-ui-<port>` (HttpOnly, SameSite=Strict — browsers do not separate cookies by port) and
redirects to `/`, and answers 401 to any `/api/*` request without that cookie. The built page and
its assets need no token: they carry no data. A second start probes the running instance with the
same cookie, read from `instance.json`, rather than with a credential of its own.

There is no Vite dev server: its proxy rewrites `Host`, which the guard refuses, and a hole for it
would be a second rule. `npm run dev` rebuilds and restarts instead; the new token means opening
the freshly printed link.

## Rationale

adr-20261014-local-server-access-guard, adr-20261014-project-source-port-keeps-hosting-open;
the boundary was approved in task `walking-skeleton`'s design on 2026-10-17.
