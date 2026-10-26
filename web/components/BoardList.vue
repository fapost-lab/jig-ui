<script setup lang="ts">
  import { ChevronDown, ChevronRight } from '@lucide/vue';
  import { computed, ref } from 'vue';
  import type { Column, Place, ReadyDetails } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { useDrop } from '@/lib/drop';
  import ColumnHeader from './ColumnHeader.vue';
  import TaskBrief from './TaskBrief.vue';
  import TaskRow from './TaskRow.vue';

  /**
   * The board as folding groups of rows; `selected` is the row whose `details` the pane shows. A row is moved in Jig's
   * queue by dragging it within its group, or from its menu; `pending` is the one whose change is on its way.
   */
  const props = defineProps<{
    project: string;
    columns: Column[];
    selected?: string;
    details?: ReadyDetails | 'unavailable';
    pending?: string;
    changed?: string[];
  }>();

  const emit = defineEmits<{
    select: [task: string];
    move: [task: string, place: Place];
    prioritise: [task: string, priority: number | null];
    pause: [task: string, ask: boolean];
    resume: [task: string];
  }>();

  const drag = useDrop(
    (task, place) => emit('move', task, place),
    (task) => emit('pause', task, true),
    (task) => emit('resume', task),
  );

  const { gap } = drag;

  const picked = computed(() => props.columns.flatMap((c) => c.cards).find((t) => t.id === props.selected));

  /** Columns folded away; all open to begin with. */
  const folded = ref(new Set<string>());
  function fold(id: string, open: boolean): void {
    if (open) folded.value.delete(id);
    else folded.value.add(id);
  }
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <div class="min-w-0 flex-1 overflow-y-auto">
      <Collapsible
        v-for="column in columns"
        :key="column.id"
        :open="!folded.has(column.id)"
        :class="gap?.list === column.id && gap.index < 0 && 'bg-muted'"
        @update:open="(open: boolean) => fold(column.id, open)"
        @dragover="(e: DragEvent) => drag.over(e, column.id, column.cards)"
        @drop.prevent="drag.drop(column.id)"
      >
        <h2>
          <CollapsibleTrigger class="flex w-full items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
            <ChevronRight v-if="folded.has(column.id)" class="size-3 shrink-0" />
            <ChevronDown v-else class="size-3 shrink-0" />
            <ColumnHeader :id="column.id" :title="column.title" :count="column.cards.length" />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent class="relative">
          <div
            v-for="(task, i) in column.cards"
            :key="task.id"
            data-card
            :draggable="pending === undefined"
            class="relative"
            @dragstart="(e) => drag.start(e, column.id, task)"
            @dragend="drag.end()"
          >
            <span v-if="gap?.list === column.id && gap.index === i" class="absolute inset-x-0 top-0 h-0.5 bg-primary" aria-hidden="true" />
            <TaskRow
              :task="task"
              :selected="selected === task.id"
              :cards="column.cards"
              :busy="pending === task.id"
              :changed="changed?.includes(task.id)"
              @select="$emit('select', task.id)"
              @move="(place) => $emit('move', task.id, place)"
              @prioritise="(p) => $emit('prioritise', task.id, p)"
              @pause="(ask) => $emit('pause', task.id, ask)"
              @resume="$emit('resume', task.id)"
            />
            <span
              v-if="gap?.list === column.id && gap.index === column.cards.length && i === column.cards.length - 1"
              class="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
              aria-hidden="true"
            />
          </div>
          <p v-if="column.cards.length === 0" class="border-b px-3 py-2 text-muted-foreground">— empty —</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
    <aside class="w-96 shrink-0 overflow-y-auto border-l" aria-label="Task">
      <template v-if="picked">
        <div class="flex items-center gap-2 border-b px-4 py-2">
          <span class="font-semibold break-all">{{ picked.id }}</span>
          <Badge v-if="picked.class" variant="outline">{{ picked.class }}</Badge>
        </div>
        <div class="flex flex-col gap-3 p-4">
          <p v-if="picked.goal" class="text-muted-foreground">{{ picked.goal }}</p>
          <TaskBrief :project="project" :task="picked.id" :details="details" />
        </div>
      </template>
      <p v-else class="p-4 text-muted-foreground">Pick a task to see its details.</p>
    </aside>
  </div>
</template>
