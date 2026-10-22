---
id: adr-20261022-native-drag-and-drop-with-a-card-menu
type: adr
status: accepted
date: 2026-10-22
domains: []
paths:
  - web/lib/drop.ts
  - web/lib/placement.ts
  - web/components/QueueMenu.vue
  - server/board/columns.ts
summary: Queue order by native HTML5 drag and drop, drops only where one jig queue move lands, and a card menu as the one-press alternative; the page copies Jig's level order
reviewed_at: 2026-10-22
---
# The page drags with the browser's own drag and drop, and a card menu is its one-press alternative

## Context

Ordering the queue by drag (task `queue-reorder`) needed a drag-and-drop mechanism, which Reka UI
does not provide (adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas left it to this
task). A card must stay where Jig says until Jig's order changes, and WCAG 2.5.7 asks for a
single-pointer alternative to every drag. Decided at the design gate, 2026-10-22.

## Decision

- Native HTML5 drag and drop (`web/lib/drop.ts`), no dependency; Board and List share it, as
  both are vertical lists of cards.
- A drop is allowed only where one `jig queue move` can put the card (`web/lib/placement.ts`):
  after the nearest queued card of the same level above the gap, `top` with none queued above,
  `bottom` among unqueued cards; never inside another level's run. A drop on another column does
  nothing until pause requests are built.
- Every card has a "⋯" menu (Reka `DropdownMenu`): To top, Up, Down, To bottom, and the priority
  P0–P5 or none. Up and Down are computed by the same placement rule.

## Alternatives

- SortableJS (`vue-draggable-plus`) — it reorders the DOM itself on drop, while a card must stay
  where Jig says.
- dnd-kit — the best keyboard drag, but made for React; its Vue ports are young.
- Moving buttons only in the task details — one has to open the details to move a task.
- Keyboard drag (Space, arrows, a live region) — about a hundred lines and screen-reader tests;
  built only if the menu proves awkward.
- If native drag and drop fails in some browser: Pragmatic drag and drop (Atlassian), a thin layer
  over the same native API, without changing `useDrop`.

## Consequences

- The page copies two of Jig's queue rules: the order of levels (the top level first, then
  epics by name) in `server/board/columns.ts` and `web/lib/placement.ts`, and "an anchor must
  be queued and on the same level" in `placement.ts`. A change of either rule in Jig is a change
  in both places.
