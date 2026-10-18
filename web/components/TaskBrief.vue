<script setup lang="ts">
  import type { ReadyDetails } from '@/api';
  import ActionList from './ActionList.vue';
  import TaskFacts from './TaskFacts.vue';

  /** `details` is undefined while it is read, and 'unavailable' when the task or its project cannot be read. */
  defineProps<{
    project: string;
    task: string;
    details?: ReadyDetails | 'unavailable';
  }>();
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="details === undefined" class="text-muted-foreground">Reading the task…</p>
    <p v-else-if="details === 'unavailable'" class="text-muted-foreground">The details cannot be read right now.</p>
    <template v-else>
      <TaskFacts :details="details" />
      <p class="font-semibold tracking-wider uppercase">What Jig offers</p>
      <ActionList :actions="details.actions" />
    </template>
    <RouterLink
      :to="`/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(task)}`"
      class="self-start underline underline-offset-2"
    >
      Open full details
    </RouterLink>
  </div>
</template>
