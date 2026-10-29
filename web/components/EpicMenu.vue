<script setup lang="ts">
  import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Ellipsis } from '@lucide/vue';
  import { computed } from 'vue';
  import type { Place, Spec } from '@/api';
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
  import { epicStep } from '@/lib/epics';

  /**
   * An open epic's place in Jig's queue and its priority. To top and To bottom are the whole queue's, tasks with no epic
   * too, which the page does not show: they are always offered, where an epic first among the epics may still be below a task.
   */
  const props = defineProps<{
    spec: Spec;
    /** The project's specs, in the order the page shows them. */
    specs: Spec[];
    disabled?: boolean;
  }>();

  const emit = defineEmits<{
    move: [place: Place];
    prioritise: [priority: number | null];
  }>();

  const up = computed(() => epicStep(props.specs, props.spec.id, -1));
  const down = computed(() => epicStep(props.specs, props.spec.id, 1));

  const PRIORITIES = [0, 1, 2, 3, 4, 5] as const;
  const priority = computed(() => (props.spec.queue?.priority == null ? 'none' : String(props.spec.queue.priority)));
  function choose(value: unknown): void {
    if (value === priority.value || typeof value !== 'string') return;
    emit('prioritise', value === 'none' ? null : Number(value));
  }
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-xs" :disabled="disabled" :aria-label="`Queue and priority of epic ${spec.id}`">
        <Ellipsis />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-44">
      <DropdownMenuItem @select="emit('move', 'top')"><ArrowUpToLine />To top</DropdownMenuItem>
      <DropdownMenuItem :disabled="!up" @select="up && emit('move', up)"><ArrowUp />Up</DropdownMenuItem>
      <DropdownMenuItem :disabled="!down" @select="down && emit('move', down)"><ArrowDown />Down</DropdownMenuItem>
      <DropdownMenuItem @select="emit('move', 'bottom')"><ArrowDownToLine />To bottom</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Priority</DropdownMenuLabel>
      <DropdownMenuRadioGroup :model-value="priority" @update:model-value="choose">
        <DropdownMenuRadioItem v-for="p in PRIORITIES" :key="p" :value="String(p)">P{{ p }}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
