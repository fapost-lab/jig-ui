<script setup lang="ts">
  import { ChevronDown, X } from '@lucide/vue';
  import { Button } from '@/components/ui/button';
  import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
  import { Input } from '@/components/ui/input';
  import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
  import { CLASSES, filtered, PRIORITIES, type Sift, SORTS } from '@/lib/sift';

  /** The board's sort and filters, for every column at once; `shown` of its `total` cards pass the filters. */
  defineProps<{
    shown: number;
    total: number;
  }>();

  const view = defineModel<Sift>({ required: true });

  const SORT_NAMES: Record<Sift['sort'], string> = { queue: 'Queue', priority: 'Priority', class: 'Class' };

  const FILTERS = [
    { key: 'classes', title: 'Class', labels: CLASSES },
    { key: 'priorities', title: 'Priority', labels: PRIORITIES },
  ] as const;

  function sortBy(next: unknown): void {
    const sort = SORTS.find((s) => s === next);
    if (sort) view.value = { ...view.value, sort }; // a press on the pressed item asks for none
  }

  /** Shows or hides the cards of one label, keeping the labels in their own order. */
  function choose(key: (typeof FILTERS)[number]['key'], labels: readonly string[], label: string, on: boolean): void {
    const chosen = new Set(view.value[key]);
    if (on) chosen.add(label);
    else chosen.delete(label);
    view.value = { ...view.value, [key]: labels.filter((l) => chosen.has(l)) };
  }

  const find = (text: string | number) => (view.value = { ...view.value, text: String(text) });

  const clear = () => (view.value = { ...view.value, classes: [], priorities: [], text: '' });
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
    <span class="text-muted-foreground" aria-hidden="true">Sort</span>
    <ToggleGroup type="single" variant="outline" size="sm" aria-label="Sort" :model-value="view.sort" @update:model-value="sortBy">
      <ToggleGroupItem v-for="sort in SORTS" :key="sort" :value="sort">{{ SORT_NAMES[sort] }}</ToggleGroupItem>
    </ToggleGroup>
    <DropdownMenu v-for="filter in FILTERS" :key="filter.key">
      <DropdownMenuTrigger as-child>
        <Button variant="outline" size="sm" :aria-label="`Filter by ${filter.title.toLowerCase()}`">
          {{ filter.title }}<template v-if="view[filter.key].length > 0">: {{ view[filter.key].join(', ') }}</template>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-32">
        <DropdownMenuCheckboxItem
          v-for="label in filter.labels"
          :key="label"
          :model-value="view[filter.key].includes(label)"
          @update:model-value="(on: boolean | 'indeterminate') => choose(filter.key, filter.labels, label, on === true)"
          @select.prevent
        >
          {{ label === 'none' ? 'None' : label }}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Input
      type="search"
      placeholder="Find a task…"
      aria-label="Find a task"
      class="h-7 w-48"
      :model-value="view.text"
      @update:model-value="find"
    />
    <template v-if="filtered(view)">
      <span class="ml-auto text-muted-foreground">{{ shown }} of {{ total }} {{ total === 1 ? 'task' : 'tasks' }}</span>
      <Button variant="ghost" size="sm" @click="clear"><X />Clear</Button>
    </template>
  </div>
</template>
