<script setup lang="ts">
  /**
   * A group of the page — a board column, a List group, a spec's lane, a section — as a tinted panel its cards stand
   * out on. `accent`: the stripe along its top, a column's or lane's colour from lib/tones.ts; `sticky`: its head stays in
   * view while the page around it scrolls.
   */
  defineProps<{
    accent?: string;
    sticky?: boolean;
  }>();
</script>

<template>
  <section class="flex flex-col overflow-clip rounded-xl bg-foreground/5">
    <!-- A sticky head is opaque, the page's background under the panel's tint, so cards scroll under it unseen. -->
    <div :class="sticky && 'sticky top-0 z-10 bg-background'">
      <div :class="sticky && 'bg-foreground/5'">
        <div v-if="accent" class="h-1" :class="accent" aria-hidden="true" />
        <slot name="head" />
      </div>
    </div>
    <slot />
  </section>
</template>
