<script setup lang="ts">
  import type { Listed } from '@/lib/projects';
  import { attentionFill, badFill } from '@/lib/tones';

  /** Beside a project's name in a list: how many things need the person there, `!` when it cannot be read, `…` while it is read; nothing else. */
  defineProps<{
    project: Listed;
  }>();
</script>

<template>
  <span
    v-if="project.state === 'ready' && project.attention.length > 0"
    :class="attentionFill"
    class="min-w-5 rounded-full px-1.5 text-center text-xs font-medium tabular-nums"
    :aria-label="`${project.attention.length} need you`"
  >
    {{ project.attention.length }}
  </span>
  <span v-else-if="project.state === 'reading'" class="px-1 text-muted-foreground" aria-label="being read">…</span>
  <span
    v-else-if="project.state !== 'ready'"
    :class="badFill"
    class="min-w-5 rounded-full px-1.5 text-center text-xs font-medium"
    aria-label="not readable"
    >!</span
  >
</template>
