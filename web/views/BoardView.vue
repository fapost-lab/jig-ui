<script setup lang="ts">
import { ChevronDown, ChevronRight, Columns3, Milestone, Rows3 } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api, type Board, describe, onChange, readTask, type ReadyDetails, type Specs } from '@/api';
import ColumnHeader from '@/components/ColumnHeader.vue';
import SpecCard from '@/components/SpecCard.vue';
import TaskBrief from '@/components/TaskBrief.vue';
import TaskCard from '@/components/TaskCard.vue';
import TaskRow from '@/components/TaskRow.vue';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const props = defineProps<{ id: string }>();
const board = ref<Board | 'not-connected'>();

let latest = 0;

async function load(): Promise<void> {
  const mine = ++latest;
  const res = await api(`/api/projects/${encodeURIComponent(props.id)}/board`);
  if (!res) return;
  const read = res.status === 404 ? 'not-connected' : ((await res.json()) as { board: Board }).board;
  // A newer load may have started meanwhile: an older answer must not overwrite it.
  if (mine === latest) board.value = read;
}

const specs = ref<Specs | 'not-connected'>();
let latestSpecs = 0;

async function loadSpecs(): Promise<void> {
  const mine = ++latestSpecs;
  const res = await api(`/api/projects/${encodeURIComponent(props.id)}/specs`);
  if (!res) return;
  const read = res.status === 404 ? 'not-connected' : ((await res.json()) as { specs: Specs }).specs;
  if (mine === latestSpecs) specs.value = read;
}

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
let reading = 0;

async function readSelected(): Promise<void> {
  const mine = ++reading;
  const task = selected.value;
  if (task === undefined) return;
  const read = await readTask(props.id, task);
  if (mine === reading) details.value = typeof read === 'object' && read.state === 'ready' ? read : 'unavailable';
}

watch(selected, () => {
  details.value = undefined;
  void readSelected();
});

const cards = computed(() =>
  board.value !== undefined && board.value !== 'not-connected' && board.value.state === 'ready'
    ? board.value.columns.flatMap((c) => c.cards)
    : [],
);
const picked = computed(() => cards.value.find((t) => t.id === selected.value));

/** Columns folded away in the list; all open to begin with. */
const folded = ref(new Set<string>());
function fold(id: string, open: boolean): void {
  if (open) folded.value.delete(id);
  else folded.value.add(id);
}

onMounted(() => {
  void load();
  void loadSpecs();
});
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

    <div v-else-if="view === 'board'" class="grid min-h-0 flex-1 grid-cols-[repeat(5,minmax(14rem,1fr))] divide-x overflow-auto">
      <section v-for="column in board.columns" :key="column.id" :aria-labelledby="`column-${column.id}`">
        <h2 :id="`column-${column.id}`" class="sticky top-0 z-10 border-b bg-background px-3 py-2">
          <ColumnHeader :id="column.id" :title="column.title" :count="column.cards.length" />
        </h2>
        <ul class="flex flex-col gap-2 p-2">
          <li v-for="task in column.cards" :key="task.id">
            <TaskCard
              :project="id"
              :task="task"
              :open="selected === task.id"
              :details="selected === task.id ? details : undefined"
              @toggle="selected = selected === task.id ? undefined : task.id"
            />
          </li>
          <li v-if="column.cards.length === 0" class="p-3 text-center text-muted-foreground">— empty —</li>
        </ul>
      </section>
    </div>

    <div v-else-if="view === 'specs'" class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="specs === undefined" class="p-3 text-muted-foreground">Reading the specs…</p>
      <p v-else-if="specs === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
      <p v-else-if="specs.state !== 'ready'" class="p-3">{{ describe(specs) }}</p>
      <p v-else-if="specs.specs.length === 0" class="p-3 text-muted-foreground">
        No specs in this project. A spec is written with the <code>jig-idea</code> skill and kept in <code>.ai/specs/</code>.
      </p>
      <div v-else class="flex flex-col gap-3 p-3">
        <SpecCard v-for="spec in specs.specs" :key="spec.id" :spec="spec" :project="id" :live="cards.map((t) => t.id)" />
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1">
      <div class="min-w-0 flex-1 overflow-y-auto">
        <Collapsible
          v-for="column in board.columns"
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
              @select="selected = task.id"
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
            <TaskBrief :project="id" :task="picked.id" :details="details" />
          </div>
        </template>
        <p v-else class="p-4 text-muted-foreground">Pick a task to see its details.</p>
      </aside>
    </div>
  </div>
</template>
