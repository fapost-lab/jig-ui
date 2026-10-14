---
id: adr-20261014-jig-ui-is-an-optional-layer-over-jig
type: adr
status: accepted
date: 2026-10-14
domains: []
paths:
  - "server/**"
summary: Jig UI is optional, keeps only its registry and settings, and reads and writes Jig only through Jig's released contracts
---
# Jig UI is an optional layer over Jig that keeps no task state of its own

## Context

A person running several agents across several projects cannot see in one place what runs, what
waits for them and in what order work goes. Jig already keeps every task in its own files and
works with nothing but bash and git. Spec `jig-ui` (`.ai/specs/jig-ui/spec.md`, decided with the
maintainer on 2026-10-14).

## Decision

- Jig UI is a separate, optional package (`fapost-lab/jig-ui`); Jig works exactly as before
  without it, and stopping Jig UI changes nothing in any project.
- Jig's files are the source of truth. Jig UI stores only its registry of connected projects and
  its interface settings.
- Jig UI reads and changes projects only through the machine-readable contracts of Jig's
  `contract-extensions` spec, and runs no agents. A phase of Jig UI starts only once the Jig
  contracts it needs are in a Jig release. Work that reads nothing of Jig — the package and its
  release pipeline — does not wait (maintainer, 2026-10-14).

## Alternatives

- Widening `jig status --html` — serverless and per clone; it cannot be an interactive
  multi-project board.
- A UI-side store of priority and order — state that exists nowhere else, invisible to agents and
  unreviewable in git (aif-handoff's largest cost).
- Parsing Jig's `state` files until the contracts land — ties the UI to a format Jig never
  promised; the adapter would be thrown away.
- Running agents from the UI — out of scope; aif-handoff's README warns it may breach
  subscription terms.

## Consequences

- Development waits on Jig's releases; gaps in a contract are raised in Jig's spec, not worked
  around here.
- Every read and write goes through one module that knows Jig (see
  adr-20261014-project-source-port-keeps-hosting-open).
