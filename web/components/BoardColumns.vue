<script setup lang="ts">
  import type { Column, ReadyDetails } from '@/api';
  import ColumnHeader from './ColumnHeader.vue';
  import TaskCard from './TaskCard.vue';

  /** The board side by side; `selected` is the card expanded into its `details`. */
  defineProps<{
    project: string;
    columns: Column[];
    selected?: string;
    details?: ReadyDetails | 'unavailable';
  }>();

  defineEmits<{
    toggle: [task: string];
  }>();
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[repeat(5,minmax(14rem,1fr))] divide-x overflow-auto">
    <section v-for="column in columns" :key="column.id" :aria-labelledby="`column-${column.id}`">
      <h2 :id="`column-${column.id}`" class="sticky top-0 z-10 border-b bg-background px-3 py-2">
        <ColumnHeader :id="column.id" :title="column.title" :count="column.cards.length" />
      </h2>
      <ul class="flex flex-col gap-2 p-2">
        <li v-for="task in column.cards" :key="task.id">
          <TaskCard
            :project="project"
            :task="task"
            :open="selected === task.id"
            :details="selected === task.id ? details : undefined"
            @toggle="$emit('toggle', task.id)"
          />
        </li>
        <li v-if="column.cards.length === 0" class="p-3 text-center text-muted-foreground">— empty —</li>
      </ul>
    </section>
  </div>
</template>
