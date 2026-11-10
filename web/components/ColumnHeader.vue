<script setup lang="ts">
  /** A column's title and its count; its colour is the stripe of the panel it heads. */
  defineProps<{
    title: string;
    count: number;
  }>();
</script>

<template>
  <span class="flex w-full items-center gap-2 font-semibold">
    {{ title }}
    <span class="font-normal text-muted-foreground tabular-nums" :aria-label="`${count} ${count === 1 ? 'task' : 'tasks'}`">{{
      count
    }}</span>
  </span>
</template>
