<script setup lang="ts">
  import type { ReadyDetails } from '@/api';
  import CopyButton from './CopyButton.vue';
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
    <TaskFacts v-else :details="details" />
    <!-- What Jig offers is on the full page: on the card, what decides its place comes first. -->
    <div class="flex items-center gap-3">
      <RouterLink
        :to="`/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(task)}`"
        class="whitespace-nowrap underline underline-offset-2"
      >
        Open full details
      </RouterLink>
      <CopyButton :text="task" label="copy id" />
    </div>
  </div>
</template>
