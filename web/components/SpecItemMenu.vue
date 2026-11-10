<script setup lang="ts">
  import { ArrowDown, ArrowUp, Ellipsis, FilePlus, MoveRight } from '@lucide/vue';
  import { computed } from 'vue';
  import type { ItemPlace, SpecItem } from '@/api';
  import { Button } from '@/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { itemWords, laneStep } from '@/lib/specs';

  /** A roadmap item's moves among its lane's cards and to another phase, and the filing of its task, as Jig's `spec item` makes them. */
  const props = defineProps<{
    /** The items of its phase, in the roadmap's order. */
    items: SpecItem[];
    index: number;
    /** Its phase's number, `null` before the first phase heading. */
    phase: number | null;
    /** The numbers of the roadmap's phases. */
    phases: number[];
    disabled?: boolean;
  }>();

  const emit = defineEmits<{
    move: [place: ItemPlace];
    file: [];
  }>();

  const item = computed(() => props.items[props.index] as SpecItem);
  const up = computed(() => laneStep(props.items, props.index, -1));
  const down = computed(() => laneStep(props.items, props.index, 1));
  const others = computed(() => props.phases.filter((n) => n !== props.phase));
  const fileable = computed(() => !item.value.checked && item.value.task === null);
  const label = computed(
    () =>
      `Move or file: ${itemWords(item.value)
        .words.map((run) => run.text)
        .join('')}`,
  );
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-xs" :disabled="disabled" :aria-label="label">
        <Ellipsis />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <DropdownMenuItem :disabled="!up" @select="up && emit('move', up)"><ArrowUp />Up</DropdownMenuItem>
      <DropdownMenuItem :disabled="!down" @select="down && emit('move', down)"><ArrowDown />Down</DropdownMenuItem>
      <template v-if="others.length > 0">
        <DropdownMenuSeparator />
        <DropdownMenuItem v-for="n in others" :key="n" @select="emit('move', { phase: n })"><MoveRight />To Phase {{ n }}</DropdownMenuItem>
      </template>
      <template v-if="fileable">
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="emit('file')"><FilePlus />File task…</DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
