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
    <div class="flex items-start pt-1.5 pr-2 hover:bg-muted/50" :class="[selected && 'bg-muted', busy && 'opacity-60']">
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5 text-left"
        :aria-pressed="selected"
        @click="$emit('select')"
      >
        <span class="flex items-center gap-2">
          <span class="min-w-0 font-mono text-xs break-words text-muted-foreground">{{ task.id }}</span>
          <Badge v-if="task.class" variant="outline">{{ task.class }}</Badge>
          <span v-if="task.priority !== null" class="text-xs text-muted-foreground tabular-nums" :title="`Priority ${task.priority}`"
            >P{{ task.priority }}</span
          >
        </span>
        <span v-if="task.goal" class="line-clamp-2">{{ task.goal }}</span>
        <span v-else class="text-muted-foreground">no goal yet</span>
        <span v-if="changed || busy || note || request" class="flex flex-wrap gap-x-3 text-[13px]">
          <span v-if="changed" :class="toneText.attention">changed</span>
          <span v-if="busy" class="text-muted-foreground" role="status">sending to Jig…</span>
          <span v-else-if="note" :class="toneText[note.tone]">{{ note.text }}</span>
          <span v-if="request && !busy" :class="toneText.quiet">{{ request }}</span>
        </span>
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
      class="mx-4 mb-2.5"
      @close="
        confirming = false;
        $emit('close');
      "
      @cancel="confirming = false"
    />
  </div>
</template>
