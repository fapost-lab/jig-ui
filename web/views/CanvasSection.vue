<script setup lang="ts">
/** One canvas entry: the same specimens in a light and a dark panel, side by side. */
defineProps<{ title: string; note?: string }>();
</script>

<template>
  <section :aria-label="title" class="border-b">
    <h2 class="flex items-baseline gap-3 border-b bg-muted/50 px-4 py-2">
      <span class="font-semibold tracking-wider uppercase">{{ title }}</span>
      <span v-if="note" class="text-muted-foreground">{{ note }}</span>
    </h2>
    <div class="grid grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
      <div v-for="theme in ['light', 'dark']" :key="theme" :class="theme" class="flex flex-col gap-4 bg-background p-4 text-foreground">
        <slot />
      </div>
    </div>
  </section>
</template>
