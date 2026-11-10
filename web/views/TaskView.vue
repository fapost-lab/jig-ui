<script setup lang="ts">
  import { ArrowLeft } from '@lucide/vue';
  import { computed, onUnmounted, ref } from 'vue';
  import {
    type ArtifactKind,
    onChange,
    readAgain,
    readArtifact,
    readArtifacts,
    readTask,
    type TaskArtifact,
    type TaskArtifacts,
    type TaskDetails,
  } from '@/api';
  import ActionList from '@/components/ActionList.vue';
  import AttentionItem from '@/components/AttentionItem.vue';
  import CopyButton from '@/components/CopyButton.vue';
  import GroupPanel from '@/components/GroupPanel.vue';
  import StateLine from '@/components/StateLine.vue';
  import TaskDocuments from '@/components/TaskDocuments.vue';
  import TaskFacts from '@/components/TaskFacts.vue';
  import { Badge } from '@/components/ui/badge';
  import { lastWins } from '@/lib/last-wins';
  import { columnAccent, toneRule } from '@/lib/tones';
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

  /** Read again is under way. */
  const reading = ref(false);

  async function reread(): Promise<void> {
    reading.value = true;
    const read = await readAgain(props.project);
    reading.value = false;
    if (read) await load();
  }

  /** The task's documents Jig lists, and each one open: being read, read, or gone. */
  const documents = ref<TaskArtifacts | 'not-connected' | 'not-found'>();
  const open = ref<Partial<Record<ArtifactKind, TaskArtifact | 'reading' | 'not-found'>>>({});
  const listing = ref(false);

  const list = lastWins(
    () => readArtifacts(props.project, props.task),
    (read) => (documents.value = read),
  );

  /** Each open document's reads, the latest landing: a change can start one while another is under way. */
  const reads = new Map<ArtifactKind, () => Promise<unknown>>();
  function readDocument(kind: ArtifactKind): Promise<unknown> {
    let read = reads.get(kind);
    if (!read) {
      read = lastWins(
        () => readArtifact(props.project, props.task, kind),
        (answer) => kind in open.value && (open.value[kind] = answer),
      );

      reads.set(kind, read);
    }
    return read();
  }

  async function toggle(kind: ArtifactKind, opened: boolean): Promise<void> {
    if (!opened) {
      delete open.value[kind];
      return;
    }
    open.value[kind] = 'reading';
    await readDocument(kind);
  }

  async function relist(): Promise<void> {
    listing.value = true;
    await list();
    listing.value = false;
  }

  const note = computed(() => (typeof details.value === 'object' && details.value.state === 'ready' ? waits(details.value) : undefined));

  onUnmounted(
    onChange((project) => {
      if (project !== undefined && project !== props.project) return;
      void load();
      void list();
      for (const kind of Object.keys(open.value) as ArtifactKind[]) void readDocument(kind);
    }),
  );
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
    <RouterLink
      :to="`/projects/${encodeURIComponent(project)}`"
      class="inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="size-3" />board of {{ project }}
    </RouterLink>
    <div class="flex items-center gap-3">
      <h1 class="font-mono text-lg font-semibold break-all">{{ task }}</h1>
      <CopyButton :text="task" label="copy id" />
      <Badge v-if="typeof details === 'object' && details.state === 'ready' && details.class" variant="outline">{{ details.class }}</Badge>
    </div>
    <p v-if="details === undefined" class="text-muted-foreground">Reading the task…</p>
    <p v-else-if="details === 'not-connected'" role="alert" class="text-destructive">No connected project is called {{ project }}.</p>
    <p v-else-if="details === 'not-found'" role="alert" class="text-destructive">
      {{ project }} has no live task called {{ task }}. A finished task is not shown.
    </p>
    <p v-else-if="details.state !== 'ready'"><StateLine :project="details" :reading="reading" @read-again="reread" /></p>
    <template v-else>
      <p v-if="details.goal" class="text-base">{{ details.goal }}</p>
      <p v-if="note" :class="toneRule[note.tone]">{{ note.text }}</p>
      <GroupPanel><TaskFacts :details="details" class="px-4 py-3" /></GroupPanel>

      <TaskDocuments
        v-if="documents !== 'not-connected' && documents !== 'not-found'"
        :documents="documents"
        :open="open"
        :reading="listing"
        @toggle="toggle"
        @read-again="relist"
      />

      <GroupPanel v-if="details.attention.length > 0" :accent="columnAccent['needs-you']" aria-labelledby="needs-you">
        <template #head><h2 id="needs-you" class="px-4 pt-3 pb-2 text-[15px] font-semibold">Needs you</h2></template>
        <div class="flex flex-col gap-3 px-4 pb-4">
          <AttentionItem v-for="(item, i) in details.attention" :key="i" :item="item" />
        </div>
      </GroupPanel>

      <GroupPanel v-if="details.housekeepingFlags.length > 0" aria-labelledby="flags">
        <template #head><h2 id="flags" class="px-4 pt-3 pb-2 text-[15px] font-semibold">Housekeeping flags</h2></template>
        <ul class="flex flex-wrap gap-2 px-4 pb-4">
          <li v-for="flag in details.housekeepingFlags" :key="flag">
            <Badge variant="outline" class="bg-card">{{ flag }}</Badge>
          </li>
        </ul>
      </GroupPanel>

      <GroupPanel aria-labelledby="actions">
        <template #head><h2 id="actions" class="px-4 pt-3 pb-2 text-[15px] font-semibold">What Jig offers now</h2></template>
        <div class="flex flex-col gap-2 px-4 pb-4">
          <ActionList :actions="details.actions" />
          <p class="text-[13px] text-muted-foreground">Run a command in the project; this page follows what changes.</p>
        </div>
      </GroupPanel>
    </template>
  </div>
</template>
