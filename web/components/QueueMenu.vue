<script setup lang="ts">
  import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Ellipsis, Pause, Play, Undo2 } from '@lucide/vue';
  import { computed } from 'vue';
  import type { Place, Task } from '@/api';
  import { Button } from '@/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { ends, step } from '@/lib/placement';

  /** What a drag does, in one press: a task's place in Jig's queue within its column, its priority, a pause asked of it and a resume. */
  const props = defineProps<{
    task: Task;
    /** The task's column, in the order the board shows it; without it — a board sorted other than by Jig's queue — no move. */
    cards?: Task[];
    /** `cards` are only those a filter shows. */
    filtered?: boolean;
    disabled?: boolean;
  }>();

  const emit = defineEmits<{
    move: [place: Place];
    prioritise: [priority: number | null];
    /** Asks a pause (`true`) or takes the request back (`false`). */
    pause: [ask: boolean];
    resume: [];
  }>();

  const cards = computed(() => props.cards ?? []);
  const up = computed(() => step(cards.value, props.task.id, -1));
  const down = computed(() => step(cards.value, props.task.id, 1));
  const offered = computed(() => ends(cards.value, props.task, props.filtered));

  const PRIORITIES = [0, 1, 2, 3, 4, 5] as const;
  const priority = computed(() => (props.task.priority === null ? 'none' : String(props.task.priority)));
  function choose(value: unknown): void {
    if (value === priority.value || typeof value !== 'string') return;
    emit('prioritise', value === 'none' ? null : Number(value));
  }
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-xs" :disabled="disabled" :aria-label="`Queue and priority of ${task.id}`">
        <Ellipsis />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-44">
      <template v-if="props.cards">
        <DropdownMenuItem :disabled="!offered.top" @select="emit('move', 'top')"><ArrowUpToLine />To top</DropdownMenuItem>
        <DropdownMenuItem :disabled="!up" @select="up && emit('move', up)"><ArrowUp />Up</DropdownMenuItem>
        <DropdownMenuItem :disabled="!down" @select="down && emit('move', down)"><ArrowDown />Down</DropdownMenuItem>
        <DropdownMenuItem :disabled="!offered.bottom" @select="emit('move', 'bottom')"><ArrowDownToLine />To bottom</DropdownMenuItem>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuLabel>Priority</DropdownMenuLabel>
      <DropdownMenuRadioGroup :model-value="priority" @update:model-value="choose">
        <DropdownMenuRadioItem v-for="p in PRIORITIES" :key="p" :value="String(p)">P{{ p }}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem v-if="task.pauseRequest" @select="emit('pause', false)"><Undo2 />Cancel pause request</DropdownMenuItem>
      <DropdownMenuItem v-else-if="task.paused" :disabled="!task.resumable" @select="emit('resume')"><Play />Resume</DropdownMenuItem>
      <DropdownMenuItem v-else :disabled="!task.pauseRequestable" @select="emit('pause', true)"><Pause />Request pause</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
