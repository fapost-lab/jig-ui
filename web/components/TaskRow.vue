<script setup lang="ts">
  import { X } from '@lucide/vue';
  import { computed } from 'vue';
  import type { Place, Task } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { toneText } from '@/lib/tones';
  import { minute } from '@/lib/clock';
  import { requested, waits } from '@/lib/waits';
  import CloseConfirm from './CloseConfirm.vue';
  import QueueMenu from './QueueMenu.vue';

  const props = defineProps<{
    task: Task;
    selected: boolean;
    /** The task's column, for its queue menu; without it the row has none. */
    cards?: Task[];
    /** The board is sorted other than by Jig's queue: the menu offers no move. */
    sorted?: boolean;
    /** `cards` are only those a filter shows. */
    filtered?: boolean;
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
    resume: [];
    close: [];
  }>();

  /** The question before closing the task is open: one press asks, the question's button closes. */
  const confirming = defineModel<boolean>('confirming', { default: false });

  const note = computed(() => waits(props.task));
  const request = computed(() => requested(props.task, minute.value.getTime()));
</script>

<template>
  <div class="border-b">
    <div class="flex items-center pr-2 hover:bg-muted/50" :class="[selected && 'bg-muted', busy && 'opacity-60']">
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
        :cards="sorted ? undefined : cards"
        :filtered="filtered"
        :disabled="busy"
        @move="(place) => $emit('move', place)"
        @prioritise="(p) => $emit('prioritise', p)"
        @pause="(ask) => $emit('pause', ask)"
        @resume="$emit('resume')"
      />
      <Button
        v-if="task.closable"
        variant="ghost"
        size="icon-xs"
        :disabled="busy"
        :aria-label="`Close ${task.id} as done`"
        :aria-expanded="confirming"
        title="Close as done"
        @click="confirming = !confirming"
      >
        <X />
      </Button>
    </div>
    <CloseConfirm
      v-if="task.closable && confirming && !busy"
      :task="task.id"
      class="mx-3 mb-2"
      @close="
        confirming = false;
        $emit('close');
      "
      @cancel="confirming = false"
    />
  </div>
</template>
