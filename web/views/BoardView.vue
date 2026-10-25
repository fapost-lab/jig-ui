<script setup lang="ts">
  import { Columns3, Milestone, Plus, Rows3 } from '@lucide/vue';
  import { computed, onUnmounted, ref, watch } from 'vue';
  import { type Board, call, client, describe, onChange, type Place, readTask, type ReadyDetails, type Specs, type Written } from '@/api';
  import BoardColumns from '@/components/BoardColumns.vue';
  import BoardList from '@/components/BoardList.vue';
  import FinishedList from '@/components/FinishedList.vue';
  import NewTaskForm from '@/components/NewTaskForm.vue';
  import SpecCard from '@/components/SpecCard.vue';
  import { Button } from '@/components/ui/button';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { Toggle } from '@/components/ui/toggle';
  import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
  import { conflict } from '@/lib/conflict';
  import { lastWins } from '@/lib/last-wins';
  import { toneText } from '@/lib/tones';

  const props = defineProps<{
    id: string;
  }>();

  const board = ref<Board | 'not-connected'>();

  const param = { id: encodeURIComponent(props.id) };

  /** The finished tasks Jig still keeps, shown under the header only when the person asks; hidden on every visit. */
  const finished = computed(() => (typeof board.value === 'object' && board.value.state === 'ready' ? board.value.finished : []));
  const showFinished = ref(false);
  // With the last one gone the toggle goes too; the next one to finish is not shown unasked.
  watch(
    () => finished.value.length === 0,
    (none) => none && (showFinished.value = false),
  );

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

  /**
   * The task whose change is on its way to Jig, and what the last change came to when Jig refused it — with the cards
   * that changed since it was made, when the refusal was a stale revision. Dismissing it, or the next change, clears both.
   */
  const pending = ref<string>();
  const notice = ref<{
    text: string;
    changed: string[];
  }>();

  /**
   * Sends one change with the revision of the board it was made on, then reads the board again whatever came of it:
   * the card moves when Jig's order does, never before.
   */
  async function write(task: string, doing: string, send: (revision: number) => Promise<Written>): Promise<void> {
    const shown = board.value;
    if (typeof shown !== 'object' || shown.state !== 'ready' || pending.value !== undefined) return;
    pending.value = task;
    notice.value = undefined;
    const res = await call(() => send(shown.revision));
    const code = res && res.status !== 200 ? (await res.json()).error.code : undefined;
    // The read this change started, not what the board shows: a read started after it may land in its place.
    const read = await load();
    if (code === 'stale-revision') {
      const seen = typeof read === 'object' && read.state === 'ready' ? conflict(shown.columns, read.columns, task) : undefined;
      notice.value = {
        text: `The project changed while you were ${doing} ${task}${seen ? ` — ${seen.said}` : ''}. Try again on the board as it is now.`,
        changed: seen?.changed ?? [],
      };
    } else if (code !== undefined) notice.value = { text: `Jig refused ${doing} ${task} (${code}).`, changed: [] };
    pending.value = undefined;
  }

  const move = (task: string, place: Place) =>
    write(task, 'moving', (revision) => client.api.projects[':id'].queue.move.$post({ param, json: { task, place, revision } }));

  const pause = (task: string, ask: boolean) =>
    ask
      ? write(task, 'asking to pause', (revision) => client.api.projects[':id'].queue.pause.$post({ param, json: { task, revision } }))
      : write(task, 'taking back the pause request of', (revision) =>
          client.api.projects[':id'].queue.pause.cancel.$post({ param, json: { task, revision } }),
        );

  /** The new-task form: open, its request on its way, and why the last one was refused. */
  const filing = ref(false);
  const filingBusy = ref(false);
  const filingRefusal = ref<{
    code: string;
    text: string;
  }>();

  /** Files a task — no revision: it writes nothing that exists — then reads the board, where it shows in Backlog. */
  async function file(task: string, goal: string): Promise<void> {
    if (filingBusy.value) return;
    filingBusy.value = true;
    filingRefusal.value = undefined;
    const res = await call(() => client.api.projects[':id'].tasks.$post({ param, json: { task, goal } }));
    if (res?.status === 200) filing.value = false;
    else if (res) {
      const { code } = (await res.json()).error;
      const text =
        code === 'already-exists'
          ? `The project has a task called ${task} already, maybe a finished one. Choose another id.`
          : code === 'usage'
            ? 'Jig does not take this id or goal: one line of goal, not starting with #.'
            : `Jig refused to file ${task} (${code}).`;

      filingRefusal.value = { code, text };
    }
    filingBusy.value = false;
    await load();
  }

  const prioritise = (task: string, priority: number | null) =>
    write(task, 'setting the priority of', (revision) =>
      client.api.projects[':id'].queue.priority.$post({ param, json: { task, priority, revision } }),
    );

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
    <Collapsible v-model:open="filing" class="shrink-0" @update:open="filingRefusal = undefined">
      <div class="flex shrink-0 items-center gap-3 border-b px-3 py-1.5">
        <h1 class="font-semibold">{{ id }}</h1>
        <Toggle v-if="finished.length > 0" v-model="showFinished" variant="outline" size="sm">
          {{ finished.length }} finished {{ finished.length === 1 ? 'task' : 'tasks' }}
        </Toggle>
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
        <CollapsibleTrigger v-if="typeof board === 'object' && board.state === 'ready'" as-child>
          <Button variant="outline" size="sm"><Plus />New task</Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent class="border-b px-3 py-2">
        <NewTaskForm :busy="filingBusy" :refusal="filingRefusal?.text" :taken="filingRefusal?.code === 'already-exists'" @file="file" />
      </CollapsibleContent>
    </Collapsible>

    <FinishedList v-if="showFinished && finished.length > 0" :tasks="finished" class="max-h-48 shrink-0 overflow-y-auto border-b" />

    <p v-if="notice" role="status" class="flex shrink-0 items-center gap-2 border-b px-3 py-1.5" :class="toneText.attention">
      {{ notice.text }}
      <button type="button" class="ml-auto underline underline-offset-2" @click="notice = undefined">dismiss</button>
    </p>

    <p v-if="board === undefined" class="p-3 text-muted-foreground">Reading the board…</p>
    <p v-else-if="board === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
    <p v-else-if="board.state !== 'ready'" class="p-3">{{ describe(board) }}</p>

    <BoardColumns
      v-else-if="view === 'board'"
      :project="id"
      :columns="board.columns"
      :selected="selected"
      :details="details"
      :pending="pending"
      :changed="notice?.changed"
      @toggle="(task) => (selected = selected === task ? undefined : task)"
      @move="move"
      @prioritise="prioritise"
      @pause="pause"
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
      :pending="pending"
      :changed="notice?.changed"
      @select="(task) => (selected = task)"
      @move="move"
      @prioritise="prioritise"
      @pause="pause"
    />
  </div>
</template>
