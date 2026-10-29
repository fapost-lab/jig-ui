<script setup lang="ts">
  import type { Project } from '@/api';
  import { attentionFill, badFill } from '@/lib/tones';

  /** Beside a project's name in a list: how many things need the person there, or `!` when it cannot be read; nothing else. */
  defineProps<{
    project: Project;
  }>();
</script>

<template>
  <span
    v-if="project.state === 'ready' && project.attention.length > 0"
    :class="attentionFill"
    class="px-1"
    :aria-label="`${project.attention.length} need you`"
  >
    {{ project.attention.length }}
  </span>
  <span v-else-if="project.state !== 'ready'" :class="badFill" class="px-1" aria-label="not readable">!</span>
</template>
