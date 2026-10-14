---
id: adr-20261014-board-columns-are-derived-from-jig-state
type: adr
status: accepted
date: 2026-10-14
domains: []
paths:
  - "server/board/**"
  - "web/**"
summary: Board columns are computed from Jig's state; a drop is a sticky request shown with its age
---
# Board columns are derived from Jig's state and a drop on another column is a request

## Context

A kanban board invites a stored column. Jig already holds everything a column would say —
status, gate, autopilot state, pull request, housekeeping flags — and agents change it while the
page is open. Spec `jig-ui`, decided with the maintainer on 2026-10-14.

## Decision

- A card's column is computed from Jig's state on every read and never stored.
- A drop on another column is a request, not a state change: the card stays where Jig says it is,
  shows "requested" with its age and a cancel, and moves only when Jig's state changes.
- A request is sticky: it holds until honoured or cancelled, whatever stage the task reached in
  between.
- Which drops are offered comes from the legal actions Jig reports for the state; the UI keeps no
  copy of that table.

## Alternatives

- A stored board column — a second truth the agent would have to keep in step with Jig.

## Consequences

- The board can never disagree with Jig, but a drag does not move a card at once; the request
  badge is what the person sees.
- Untested: that a derived column is always enough. If use shows otherwise, this ADR is replaced,
  not bent.
