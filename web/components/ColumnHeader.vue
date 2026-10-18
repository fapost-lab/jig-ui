<script setup lang="ts">
import { columnAccent } from '@/lib/tones';

defineProps<{ id: string; title: string; count: number }>();
</script>

<template>
  <span class="flex w-full items-center gap-2 font-semibold tracking-wider uppercase">
    <span class="h-3 w-1 shrink-0" :class="columnAccent[id] ?? 'bg-border'" aria-hidden="true" />
    {{ title }}
    <span class="ml-auto font-normal text-muted-foreground" :aria-label="`${count} ${count === 1 ? 'task' : 'tasks'}`">[{{ count }}]</span>
  </span>
</template>
