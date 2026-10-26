<script setup lang="ts">
  import { ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import type { Place, ReadyDetails, Task } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Card } from '@/components/ui/card';
  import { toneRule } from '@/lib/tones';
  import { minute } from '@/lib/clock';
  import { requested, waits } from '@/lib/waits';
  import QueueMenu from './QueueMenu.vue';
  import TaskBrief from './TaskBrief.vue';

  const props = defineProps<{
    project: string;
    task: Task;
    open: boolean;
    details?: ReadyDetails | 'unavailable';
    /** The task's column, for its queue menu; without it the card has none. */
    cards?: Task[];
    /** A change of its place, priority or pause is on its way to Jig. */
    busy?: boolean;
    /** It changed between the board a refused change was made on and the board read after it. */
    changed?: boolean;
  }>();

  defineEmits<{
    toggle: [];
    move: [place: Place];
    prioritise: [priority: number | null];
    pause: [ask: boolean];
    resume: [];
  }>();

  const note = computed(() => waits(props.task));
  const request = computed(() => requested(props.task, minute.value.getTime()));
</script>

<template>
  <Card class="gap-2 px-3 py-3" :class="[open && 'ring-foreground', busy && 'opacity-60']">
    <div class="flex items-start gap-1">
      <button type="button" class="flex min-w-0 flex-1 flex-col gap-2 text-left" :aria-expanded="open" @click="$emit('toggle')">
        <span class="flex w-full items-center gap-2">
          <span class="font-semibold break-all">{{ task.id }}</span>
          <Badge v-if="task.priority !== null" variant="secondary" class="ml-auto" :title="`Priority ${task.priority}`">
            P{{ task.priority }}
          </Badge>
          <Badge v-if="task.class" variant="outline" :class="task.priority === null && 'ml-auto'">{{ task.class }}</Badge>
        </span>
        <span v-if="task.goal" class="text-muted-foreground" :class="!open && 'line-clamp-2'">{{ task.goal }}</span>
      </button>
      <QueueMenu
        v-if="cards"
        :task="task"
        :cards="cards"
        :disabled="busy"
        @move="(place) => $emit('move', place)"
        @prioritise="(p) => $emit('prioritise', p)"
        @pause="(ask) => $emit('pause', ask)"
        @resume="$emit('resume')"
      />
    </div>
    <p v-if="busy" class="text-muted-foreground" role="status">sending to Jig…</p>
    <p v-if="changed" :class="toneRule.attention">Changed while you acted</p>
    <p v-if="note" :class="toneRule[note.tone]">
      {{ note.text }}
      <a
        v-if="note.url"
        :href="note.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 underline underline-offset-2"
      >
        open<ExternalLink class="size-3" />
      </a>
    </p>
    <p v-if="request && !busy" :class="toneRule.quiet">
      {{ request }}
      <button
        type="button"
        class="underline underline-offset-2"
        :aria-label="`Cancel the pause request of ${task.id}`"
        @click="$emit('pause', false)"
      >
        cancel
      </button>
    </p>
    <TaskBrief v-if="open" :project="project" :task="task.id" :details="details" class="mt-1 border-t pt-2" />
  </Card>
</template>
