<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import type { Column, ReadyDetails } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ColumnHeader from './ColumnHeader.vue';
import TaskBrief from './TaskBrief.vue';
import TaskRow from './TaskRow.vue';

/** The board as folding groups of rows; `selected` is the row whose `details` the pane shows. */
const props = defineProps<{ project: string; columns: Column[]; selected?: string; details?: ReadyDetails | 'unavailable' }>();
defineEmits<{ select: [task: string] }>();

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
        @update:open="(open: boolean) => fold(column.id, open)"
      >
        <h2>
          <CollapsibleTrigger class="flex w-full items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
            <ChevronRight v-if="folded.has(column.id)" class="size-3 shrink-0" />
            <ChevronDown v-else class="size-3 shrink-0" />
            <ColumnHeader :id="column.id" :title="column.title" :count="column.cards.length" />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <TaskRow
            v-for="task in column.cards"
            :key="task.id"
            :task="task"
            :selected="selected === task.id"
            @select="$emit('select', task.id)"
          />
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
