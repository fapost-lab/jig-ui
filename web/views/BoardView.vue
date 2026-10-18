<script setup lang="ts">
  import { Columns3, Milestone, Rows3 } from '@lucide/vue';
  import { computed, onUnmounted, ref, watch } from 'vue';
  import { type Board, call, client, describe, onChange, readTask, type ReadyDetails, type Specs } from '@/api';
  import BoardColumns from '@/components/BoardColumns.vue';
  import BoardList from '@/components/BoardList.vue';
  import SpecCard from '@/components/SpecCard.vue';
  import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
  import { lastWins } from '@/lib/last-wins';

  const props = defineProps<{
    id: string;
  }>();

  const board = ref<Board | 'not-connected'>();

  const param = { id: encodeURIComponent(props.id) };

  const load = lastWins(
    async () => {
      const res = await call(() => client.api.projects[':id'].board.$get({ param }));
      return res && (res.status === 404 ? ('not-connected' as const) : (await res.json()).board);
    },
    (read) => (board.value = read),
  );

  const specs = ref<Specs | 'not-connected'>();
  const loadSpecs = lastWins(
    async () => {
      const res = await call(() => client.api.projects[':id'].specs.$get({ param }));
      return res && (res.status === 404 ? ('not-connected' as const) : (await res.json()).specs);
    },
    (read) => (specs.value = read),
  );

  /** Board, List or Specs, remembered by this browser only; storage that throws leaves the board. */
  const VIEW = 'jig-ui.board-view';
  const VIEWS = ['board', 'list', 'specs'] as const;
  type View = (typeof VIEWS)[number];
  const isView = (v: unknown): v is View => VIEWS.includes(v as View);
  function storedView(): View {
    try {
      const stored = localStorage.getItem(VIEW);
      return isView(stored) ? stored : 'board';
    } catch {
      return 'board';
    }
  }
  const view = ref(storedView());
  function show(next: unknown): void {
    if (!isView(next)) return; // a press on the pressed item asks for none
    view.value = next;
    try {
      localStorage.setItem(VIEW, next);
    } catch {
      // Storage refused: the choice holds until the page closes.
    }
  }

  /** The task whose details are open: expanded on the board, in the pane of the list. Its details are read on demand. */
  const selected = ref<string>();
  const details = ref<ReadyDetails | 'unavailable'>();
  // A run with nothing selected lands nothing, yet still keeps an older read from landing.
  const readSelected = lastWins(
    async () => {
      if (selected.value === undefined) return undefined;
      const read = await readTask(props.id, selected.value);
      return typeof read === 'object' && read.state === 'ready' ? read : ('unavailable' as const);
    },
    (read) => (details.value = read),
  );

  watch(selected, () => {
    details.value = undefined;
    void readSelected();
  });

  const cards = computed(() =>
    board.value !== undefined && board.value !== 'not-connected' && board.value.state === 'ready'
      ? board.value.columns.flatMap((c) => c.cards)
      : [],
  );

  const liveIds = computed(() => cards.value.map((t) => t.id));

  onUnmounted(
    onChange((project) => {
      if (project !== undefined && project !== props.id) return;
      void load();
      void loadSpecs();
      void readSelected();
    }),
  );
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-3 border-b px-3 py-1.5">
      <h1 class="font-semibold">{{ id }}</h1>
      <span v-if="typeof board === 'object' && board.state === 'ready' && board.finished > 0" class="text-muted-foreground">
        {{ board.finished }} finished {{ board.finished === 1 ? 'task is' : 'tasks are' }} not shown
      </span>
      <ToggleGroup
        v-if="typeof board === 'object' && board.state === 'ready'"
        type="single"
        variant="outline"
        size="sm"
        class="ml-auto"
        aria-label="View"
        :model-value="view"
        @update:model-value="show"
      >
        <ToggleGroupItem value="board"><Columns3 />Board</ToggleGroupItem>
        <ToggleGroupItem value="list"><Rows3 />List</ToggleGroupItem>
        <ToggleGroupItem value="specs"><Milestone />Specs</ToggleGroupItem>
      </ToggleGroup>
    </div>

    <p v-if="board === undefined" class="p-3 text-muted-foreground">Reading the board…</p>
    <p v-else-if="board === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
    <p v-else-if="board.state !== 'ready'" class="p-3">{{ describe(board) }}</p>

    <BoardColumns
      v-else-if="view === 'board'"
      :project="id"
      :columns="board.columns"
      :selected="selected"
      :details="details"
      @toggle="(task) => (selected = selected === task ? undefined : task)"
    />

    <div v-else-if="view === 'specs'" class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="specs === undefined" class="p-3 text-muted-foreground">Reading the specs…</p>
      <p v-else-if="specs === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
      <p v-else-if="specs.state !== 'ready'" class="p-3">{{ describe(specs) }}</p>
      <p v-else-if="specs.specs.length === 0" class="p-3 text-muted-foreground">
        No specs in this project. A spec is written with the <code>jig-idea</code> skill and kept in <code>.ai/specs/</code>.
      </p>
      <div v-else class="flex flex-col gap-3 p-3">
        <SpecCard v-for="spec in specs.specs" :key="spec.id" :spec="spec" :project="id" :live="liveIds" />
      </div>
    </div>

    <BoardList
      v-else
      :project="id"
      :columns="board.columns"
      :selected="selected"
      :details="details"
      @select="(task) => (selected = task)"
    />
  </div>
</template>
