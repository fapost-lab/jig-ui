<script setup lang="ts">
  import { ArrowLeft } from '@lucide/vue';
  import { computed, onUnmounted, ref } from 'vue';
  import { describe, onChange, readTask, type TaskDetails } from '@/api';
  import ActionList from '@/components/ActionList.vue';
  import AttentionItem from '@/components/AttentionItem.vue';
  import CopyButton from '@/components/CopyButton.vue';
  import TaskFacts from '@/components/TaskFacts.vue';
  import { Badge } from '@/components/ui/badge';
  import { lastWins } from '@/lib/last-wins';
  import { toneRule } from '@/lib/tones';
  import { waits } from '@/lib/waits';

  const props = defineProps<{
    project: string;
    task: string;
  }>();

  const details = ref<TaskDetails | 'not-connected' | 'not-found'>();

  const load = lastWins(
    () => readTask(props.project, props.task),
    (read) => (details.value = read),
  );

  const note = computed(() => (typeof details.value === 'object' && details.value.state === 'ready' ? waits(details.value) : undefined));

  onUnmounted(onChange((project) => (project === undefined || project === props.project) && void load()));
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4">
    <RouterLink
      :to="`/projects/${encodeURIComponent(project)}`"
      class="inline-flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="size-3" />board of {{ project }}
    </RouterLink>
    <div class="flex items-center gap-3">
      <h1 class="text-sm font-bold break-all">{{ task }}</h1>
      <CopyButton :text="task" label="copy id" />
      <Badge v-if="typeof details === 'object' && details.state === 'ready' && details.class" variant="outline">{{ details.class }}</Badge>
    </div>
    <p v-if="details === undefined" class="text-muted-foreground">Reading the task…</p>
    <p v-else-if="details === 'not-connected'" role="alert" class="text-destructive">No connected project is called {{ project }}.</p>
    <p v-else-if="details === 'not-found'" role="alert" class="text-destructive">
      {{ project }} has no live task called {{ task }}. A finished task is not shown.
    </p>
    <p v-else-if="details.state !== 'ready'">{{ describe(details) }}</p>
    <template v-else>
      <p v-if="details.goal">{{ details.goal }}</p>
      <p v-if="note" :class="toneRule[note.tone]">{{ note.text }}</p>
      <TaskFacts :details="details" class="border-y py-3" />

      <section v-if="details.attention.length > 0" aria-labelledby="needs-you" class="flex flex-col gap-3">
        <h2 id="needs-you" class="font-semibold tracking-wider uppercase">Needs you</h2>
        <AttentionItem v-for="(item, i) in details.attention" :key="i" :item="item" />
      </section>

      <section v-if="details.housekeepingFlags.length > 0" aria-labelledby="flags" class="flex flex-col gap-2">
        <h2 id="flags" class="font-semibold tracking-wider uppercase">Housekeeping flags</h2>
        <ul class="flex flex-wrap gap-2">
          <li v-for="flag in details.housekeepingFlags" :key="flag">
            <Badge variant="secondary">{{ flag }}</Badge>
          </li>
        </ul>
      </section>

      <section aria-labelledby="actions" class="flex flex-col gap-2">
        <h2 id="actions" class="font-semibold tracking-wider uppercase">What Jig offers now</h2>
        <ActionList :actions="details.actions" />
        <p class="text-muted-foreground">Run a command in the project; this page follows what changes.</p>
      </section>
    </template>
  </div>
</template>
