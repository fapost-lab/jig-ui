<script setup lang="ts">
  import { doneFill } from '@/lib/tones';

  defineProps<{
    done: number;
    total: number;
  }>();
</script>

<template>
  <span class="flex items-center gap-2">
    <span
      class="h-1.5 w-24 shrink-0 bg-muted"
      role="progressbar"
      aria-valuemin="0"
      :aria-valuemax="total"
      :aria-valuenow="done"
      :aria-label="`${done} of ${total} done`"
    >
      <span class="block h-full" :class="doneFill" :style="{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }" />
    </span>
    <span class="text-muted-foreground tabular-nums">{{ done }}/{{ total }}</span>
  </span>
</template>
