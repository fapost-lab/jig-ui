<script setup lang="ts">
  import type { Column, Place, ReadyDetails } from '@/api';
  import { useDrop } from '@/lib/drop';
  import ColumnHeader from './ColumnHeader.vue';
  import TaskCard from './TaskCard.vue';

  /**
   * The board side by side; `selected` is the card expanded into its `details`. A card is moved in Jig's queue by
   * dragging it within its column, or from its menu; `pending` is the one whose change is on its way.
   */
  defineProps<{
    project: string;
    columns: Column[];
    selected?: string;
    details?: ReadyDetails | 'unavailable';
    pending?: string;
    changed?: string[];
    /** Sorted other than by Jig's queue: a card moves neither by a drop within its column nor from its menu. */
    sorted?: boolean;
    /** A filter hides some cards: a card moves among those shown, and to either end of its column. */
    filtered?: boolean;
  }>();

  const emit = defineEmits<{
    toggle: [task: string];
    move: [task: string, place: Place];
    prioritise: [task: string, priority: number | null];
    pause: [task: string, ask: boolean];
    resume: [task: string];
    close: [task: string];
  }>();

  const drag = useDrop(
    (task, place) => emit('move', task, place),
    (task) => emit('pause', task, true),
    (task) => emit('resume', task),
  );

  const { gap } = drag;
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[repeat(5,minmax(14rem,1fr))] divide-x overflow-auto">
    <section
      v-for="column in columns"
      :key="column.id"
      :aria-labelledby="`column-${column.id}`"
      :class="gap?.list === column.id && gap.index < 0 && 'bg-muted'"
      @dragover="(e) => drag.over(e, column.id, sorted ? undefined : column.cards)"
      @drop.prevent="drag.drop(column.id)"
    >
      <h2 :id="`column-${column.id}`" class="sticky top-0 z-10 border-b bg-background px-3 py-2">
        <ColumnHeader :id="column.id" :title="column.title" :count="column.cards.length" />
      </h2>
      <ul class="relative flex flex-col gap-2 p-2">
        <li
          v-for="(task, i) in column.cards"
          :key="task.id"
          data-card
          :draggable="pending === undefined"
          class="relative"
          @dragstart="(e) => drag.start(e, column.id, task)"
          @dragend="drag.end()"
        >
          <span v-if="gap?.list === column.id && gap.index === i" class="absolute inset-x-0 -top-1.5 h-0.5 bg-primary" aria-hidden="true" />
          <TaskCard
            :project="project"
            :task="task"
            :open="selected === task.id"
            :details="selected === task.id ? details : undefined"
            :cards="column.cards"
            :sorted="sorted"
            :filtered="filtered"
            :busy="pending === task.id"
            :changed="changed?.includes(task.id)"
            @toggle="$emit('toggle', task.id)"
            @move="(place) => $emit('move', task.id, place)"
            @prioritise="(p) => $emit('prioritise', task.id, p)"
            @pause="(ask) => $emit('pause', task.id, ask)"
            @resume="$emit('resume', task.id)"
            @close="$emit('close', task.id)"
          />
          <span
            v-if="gap?.list === column.id && gap.index === column.cards.length && i === column.cards.length - 1"
            class="absolute inset-x-0 -bottom-1.5 h-0.5 bg-primary"
            aria-hidden="true"
          />
        </li>
        <li v-if="column.cards.length === 0" class="p-3 text-center text-muted-foreground">— empty —</li>
      </ul>
    </section>
  </div>
</template>
