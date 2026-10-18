---
id: convention-vue
type: convention
status: active
domains: []
paths:
  - "web/**"
summary: MAY/MUST/MUST NOT for web/ layers (views → components → components/ui), styling, lib decisions with tests, and the canvas
reviewed_at: 2026-10-18
---
# The page in Vue

## Practice

- `<script setup lang="ts">` everywhere; type-based `defineProps` / `defineEmits`, a line per
  member (convention-code-style); `defineModel` for a v-model.
- A view's reads go through `lastWins` (`lib/last-wins.ts`), so an older answer never lands over a
  newer one, and start from `onChange`, which runs them once the change stream is open — no read
  on mount (feature-live-updates).
- Layers point one way: `views/` → `components/` → `components/ui/`; `lib/` from any of them.

```
components/ui/ (shadcn-vue)
MAY:      hold any shadcn-vue component and change it
MUST:     merge a given `class` with cn() where the component styles its own element
MUST NOT: import api.ts, Jig UI's components or views

components/ (Jig UI's own)
MAY:      import Jig UI's types and pure helpers (describe, link) from api.ts, anything from
          components/ui/ and lib/
MUST:     take props and emit events
MUST NOT: call call(), client or onChange(), or read the address (writing a link is fine)

views/ and App.vue
MUST:     be the only callers of call(), client and onChange()
```

- Styling is Tailwind utilities and the theme's tokens (`bg-background`, `text-muted-foreground`…);
  no `<style>` blocks. A colour that means something comes from `lib/tones.ts` only.
- Variants go through class-variance-authority, as shadcn-vue's own do.
- An interactive widget (a toggle, a disclosure, a menu) is a Reka UI primitive, for its keyboard
  and ARIA, not a `<div>` with handlers.
- A decision about what to show — what a card says it waits for, and its tone — lives in
  `lib/*.ts` with a test, not in a template.
- A component in `components/`, or one of `components/ui/` the page uses directly, has a section
  in `views/CanvasView.vue` covering its variants and states (Toggle is shown through
  ToggleGroup).
- shadcn-vue components are added with `npx shadcn-vue@latest add <name>`, then moved to
  devDependencies if the CLI put anything under `dependencies`.
- A preference of one browser goes to `localStorage` under a `jig-ui.` key, every read and write
  in try/catch; a refusal keeps the default.

## Example

`TaskCard` takes a task, `open` and its details, and emits `toggle`; `BoardColumns` lays the cards
out and passes `toggle` up; `BoardView` holds which card is open and reads the details through
`readTask`. `waits()` in `lib/waits.ts` decides the card's note and tone, tested in
`lib/waits.test.ts`, held in a `computed`; `toneRule` paints it.

## Rationale

adr-20261018-page-built-from-shadcn-vue-with-router-and-canvas; approved in task `design-system`'s design, 2026-10-18.
