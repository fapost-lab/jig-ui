<script setup lang="ts">
  import { computed } from 'vue';
  import type { Place, Task } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { toneText } from '@/lib/tones';
  import { minute } from '@/lib/clock';
  import { requested, waits } from '@/lib/waits';
  import QueueMenu from './QueueMenu.vue';

  const props = defineProps<{
    task: Task;
    selected: boolean;
    /** The task's column, for its queue menu; without it the row has none. */
    cards?: Task[];
    /** A change of its place, priority or pause is on its way to Jig. */
    busy?: boolean;
    /** It changed between the board a refused change was made on and the board read after it. */
    changed?: boolean;
  }>();

  defineEmits<{
    select: [];
    move: [place: Place];
    prioritise: [priority: number | null];
    pause: [ask: boolean];
  }>();

  const note = computed(() => waits(props.task));
  const request = computed(() => requested(props.task, minute.value.getTime()));
</script>

<template>
  <div class="flex items-center border-b pr-2 hover:bg-muted/50" :class="[selected && 'bg-muted', busy && 'opacity-60']">
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
      :aria-pressed="selected"
      @click="$emit('select')"
    >
      <span class="w-40 shrink-0 truncate font-semibold" :title="task.id">{{ task.id }}</span>
      <Badge v-if="task.class" variant="outline" class="shrink-0">{{ task.class }}</Badge>
      <span v-else class="w-7 shrink-0" />
      <span class="w-6 shrink-0 text-muted-foreground" :title="task.priority === null ? undefined : `Priority ${task.priority}`">
        {{ task.priority === null ? '' : `P${task.priority}` }}
      </span>
      <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ task.goal }}</span>
      <span v-if="changed" class="shrink-0" :class="toneText.attention">changed</span>
      <span v-if="busy" class="shrink-0 text-muted-foreground" role="status">sending to Jig…</span>
      <span v-else-if="note" class="shrink-0" :class="toneText[note.tone]">{{ note.text }}</span>
      <span v-if="request && !busy" class="shrink-0" :class="toneText.quiet">{{ request }}</span>
    </button>
    <QueueMenu
      v-if="cards"
      :task="task"
      :cards="cards"
      :disabled="busy"
      @move="(place) => $emit('move', place)"
      @prioritise="(p) => $emit('prioritise', p)"
      @pause="(ask) => $emit('pause', ask)"
    />
  </div>
</template>
