<script setup lang="ts">
  import { columnAccent } from '@/lib/tones';

  defineProps<{
    id: string;
    title: string;
    count: number;
  }>();
</script>

<template>
  <span class="flex w-full items-center gap-2 font-semibold">
    <span class="size-2 shrink-0 rounded-full" :class="columnAccent[id] ?? 'bg-border'" aria-hidden="true" />
    {{ title }}
    <span class="font-normal text-muted-foreground tabular-nums" :aria-label="`${count} ${count === 1 ? 'task' : 'tasks'}`">{{
      count
    }}</span>
  </span>
</template>
