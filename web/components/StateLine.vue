<script setup lang="ts">
  import { describe, type ProjectState } from '@/api';
  import { Button } from '@/components/ui/button';

  /** What a project's state means, and Read again where Jig could not be read; `reading` while that read runs. */
  defineProps<{
    project: ProjectState;
    reading?: boolean;
  }>();

  defineEmits<{
    readAgain: [];
  }>();
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
    <span>{{ describe(project) }}</span>
    <Button v-if="project.state === 'unreadable'" variant="outline" size="xs" :disabled="reading" @click="$emit('readAgain')">
      {{ reading ? 'Reading…' : 'Read again' }}
    </Button>
  </span>
</template>
