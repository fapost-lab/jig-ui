<script setup lang="ts">
  import { BookCheck, Columns3, Milestone, Plus, Rows3 } from '@lucide/vue';
  import { computed, onUnmounted, type Ref, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import {
    type Board,
    call,
    client,
    type Decision,
    type DocumentText,
    type Edited,
    type Finished,
    type ItemPlace,
    type Knowledge,
    onChange,
    type Place,
    readAgain,
    readTask,
    type ReadyDetails,
    type SourceDiff,
    type SpecItem,
    type Specs,
    type Written,
  } from '@/api';
  import BoardColumns from '@/components/BoardColumns.vue';
  import BoardFilter from '@/components/BoardFilter.vue';
  import BoardList from '@/components/BoardList.vue';
  import EpicMenu from '@/components/EpicMenu.vue';
  import FileItemDialog from '@/components/FileItemDialog.vue';
  import FinishedList from '@/components/FinishedList.vue';
  import KnowledgeView from '@/components/KnowledgeView.vue';
  import NewTaskForm from '@/components/NewTaskForm.vue';
  import SpecBoard from '@/components/SpecBoard.vue';
  import StateLine from '@/components/StateLine.vue';
  import { Button } from '@/components/ui/button';
  import { Badge } from '@/components/ui/badge';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { Toggle } from '@/components/ui/toggle';
  import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
  import { conflict } from '@/lib/conflict';
  import { movable } from '@/lib/epics';
  import { settleFinished } from '@/lib/finished';
  import { knowledgeRefusal, noKnowledge } from '@/lib/knowledge';
  import { lastWins } from '@/lib/last-wins';
  import { closeRefusal, fileItemRefusal, refusal, roadmapRefusal } from '@/lib/refusal';
  import { filtered, fromQuery, reorders, sift, type Sift, toQuery } from '@/lib/sift';
  import { toneText } from '@/lib/tones';

  const props = defineProps<{
    id: string;
  }>();

  const board = ref<Board | 'not-connected'>();

  const param = { id: encodeURIComponent(props.id) };

  /** How many finished tasks Jig still keeps; the tasks are read only when the person asks, and hidden on every visit. */
  const finishedCount = computed(() => (typeof board.value === 'object' && board.value.state === 'ready' ? board.value.finishedCount : 0));
  const showFinished = ref(false);
  // With the last one gone the toggle goes too; the next one to finish is not shown unasked.
  watch(
    () => finishedCount.value === 0,
    (none) => none && (showFinished.value = false),
  );

  /** The finished tasks as last read; none while the first read since opening the list runs. */
  const finished = ref<Finished>();
  /** The shown list is a good one kept over a torn read; the next torn read in a row is believed. */
  let held = false;
  // A run with the list closed lands nothing, yet still keeps an older read from landing. Any failure is this list's, not the project's.
  // A refresh keeps a good list over one torn read (see settleFinished); a read made afresh is believed at once.
  const loadFinished = lastWins(
    async () => {
      if (!showFinished.value) return undefined;
      const res = await call(() => client.api.projects[':id'].finished.$get({ param }));
      return res?.status === 200 ? (await res.json()).finished : ({ id: props.id, state: 'unreadable', code: 'failed' } as const);
    },
    (read) => {
      const settled = settleFinished(finished.value, read, held);
      finished.value = settled.shown;
      held = settled.held;
    },
  );

  function readFinishedAfresh(): void {
    finished.value = undefined;
    held = false;
    void loadFinished();
  }
  watch(showFinished, readFinishedAfresh);

  const load = lastWins(
    async () => {
      const res = await call(() => client.api.projects[':id'].board.$get({ param }));
      return res && (res.status === 404 ? ('not-connected' as const) : (await res.json()).board);
    },
    (read) => (board.value = read),
  );

  /** Read again is under way. */
  const reading = ref(false);

  async function reread(): Promise<void> {
    reading.value = true;
    const read = await readAgain(props.id);
    reading.value = false;
    if (read) await Promise.all([load(), loadSpecs(), loadFinished()]);
  }

  const specs = ref<Specs | 'not-connected'>();
  const loadSpecs = lastWins(
    async () => {
      const res = await call(() => client.api.projects[':id'].specs.$get({ param }));
      return res && (res.status === 404 ? ('not-connected' as const) : (await res.json()).specs);
    },
    (read) => (specs.value = read),
  );

  const route = useRoute();
  const router = useRouter();

  /**
   * Board, List, Specs or Knowledge, remembered by this browser only; storage that throws leaves the board. A link that
   * names one (`?view=knowledge`, from the workspace card) opens it, and the address drops it.
   */
  const VIEW = 'jig-ui.board-view';
  const VIEWS = ['board', 'list', 'specs', 'knowledge'] as const;
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
  if (route.query.view !== undefined) {
    show(route.query.view);
    void router.replace({ query: { ...route.query, view: undefined } });
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

  /** Each live task's board column, by its id: the Specs view's cards say where an item's task stands. */
  const columnOf = computed(
    () =>
      new Map(
        typeof board.value === 'object' && board.value.state === 'ready'
          ? board.value.columns.flatMap((c) => c.cards.map((t) => [t.id, { id: c.id, title: c.title }] as const))
          : [],
      ),
  );

  /** How Board and List look at the board — sort and filters — kept in the page's address, so a reload or a link keeps it. */
  const sifting = computed({
    get: () => fromQuery(route.query),
    set: (next: Sift) => void router.replace({ query: { ...toQuery(next), spec: route.query.spec } }),
  });

  const sifted = computed(() =>
    typeof board.value === 'object' && board.value.state === 'ready' ? sift(board.value.columns, sifting.value) : [],
  );

  const shownCount = computed(() => sifted.value.reduce((n, c) => n + c.cards.length, 0));

  const sorted = computed(() => !reorders(sifting.value));

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
   * the card moves when Jig's order does, never before. `explain` words a refusal with the reasons Jig gave, where the
   * change has any to show.
   */
  async function write(
    task: string,
    doing: string,
    send: (revision: number) => Promise<Written>,
    explain?: (code: string, reasons: string[]) => string | undefined,
  ): Promise<void> {
    const shown = board.value;
    if (typeof shown !== 'object' || shown.state !== 'ready' || pending.value !== undefined) return;
    pending.value = task;
    notice.value = undefined;
    const res = await call(() => send(shown.revision));
    const error = res && res.status !== 200 ? (await res.json()).error : undefined;
    const code = error?.code;
    // The read this change started, not what the board shows: a read started after it may land in its place.
    const read = await load();
    if (code === 'stale-revision') {
      const seen = typeof read === 'object' && read.state === 'ready' ? conflict(shown.columns, read.columns, task) : undefined;
      notice.value = {
        text: `The project changed while you were ${doing} ${task}${seen ? ` — ${seen.said}` : ''}. Try again on the board as it is now.`,
        changed: seen?.changed ?? [],
      };
    } else if (error !== undefined) {
      notice.value = {
        text:
          explain?.(error.code, 'reasons' in error && Array.isArray(error.reasons) ? error.reasons.map(String) : []) ??
          refusal(error.code, doing, task),
        changed: [],
      };
    }
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

  const resume = (task: string) =>
    write(task, 'resuming', (revision) => client.api.projects[':id'].tasks.resume.$post({ param, json: { task, revision } }));

  /** Closes a ready task as done; Jig's refusal — its pull request not merged, say — is shown in its own words. */
  const close = (task: string) =>
    write(
      task,
      'closing',
      (revision) => client.api.projects[':id'].tasks.close.$post({ param, json: { task, revision } }),
      (code, reasons) => closeRefusal(code, reasons, task),
    );

  /** The spec the Specs view shows, kept in the address (`?spec=`) like the board's sort: the first when it names none of them. */
  const chosenSpec = computed(() =>
    typeof specs.value === 'object' && specs.value.state === 'ready'
      ? (specs.value.specs.find((s) => s.id === route.query.spec) ?? specs.value.specs[0])
      : undefined,
  );

  function chooseSpec(spec: unknown): void {
    if (typeof spec === 'string') void router.replace({ query: { ...route.query, spec } });
  }

  /** The spec whose epic's or roadmap's change is on its way to Jig; the notice says what Jig refused, as for a task. */
  const pendingSpec = ref<string>();

  /** Sends one change of an epic with the revision of the specs it was made on, then reads them again. */
  async function writeEpic(epic: string, doing: string, send: (revision: number) => Promise<Written>): Promise<void> {
    const shown = specs.value;
    if (typeof shown !== 'object' || shown.state !== 'ready' || pendingSpec.value !== undefined) return;
    pendingSpec.value = epic;
    notice.value = undefined;
    const res = await call(() => send(shown.revision));
    const code = res && res.status !== 200 ? (await res.json()).error.code : undefined;
    await loadSpecs();
    if (code === 'stale-revision') {
      notice.value = {
        text: `The project changed while you were ${doing} epic ${epic}. Try again on the specs as they are now.`,
        changed: [],
      };
    } else if (code !== undefined) notice.value = { text: refusal(code, doing, `epic ${epic}`), changed: [] };
    pendingSpec.value = undefined;
  }

  const moveEpic = (epic: string, place: Place) =>
    writeEpic(epic, 'moving', (revision) => client.api.projects[':id'].queue.epic.move.$post({ param, json: { epic, place, revision } }));

  const prioritiseEpic = (epic: string, priority: number | null) =>
    writeEpic(epic, 'setting the priority of', (revision) =>
      client.api.projects[':id'].queue.epic.priority.$post({ param, json: { epic, priority, revision } }),
    );

  /**
   * Sends one edit of a spec's roadmap with the revision of the specs it was made on, then reads them again whatever came
   * of it — and the board, where a task filed from an item shows: an item moves when Jig's roadmap does, never before.
   * What came of it, for a person — Jig's note, or why it was refused — with the code of a refusal; `undefined` when it
   * was not sent or the server did not answer.
   */
  async function editRoadmap(
    spec: string,
    doing: string,
    send: (revision: number) => Promise<Edited>,
    explain?: (refused: Refused) => string | undefined,
  ): Promise<
    | {
        code?: string;
        text: string | null;
        taken?: boolean;
      }
    | undefined
  > {
    const shown = specs.value;
    if (typeof shown !== 'object' || shown.state !== 'ready' || pendingSpec.value !== undefined) return undefined;
    pendingSpec.value = spec;
    notice.value = undefined;
    const res = await call(() => send(shown.revision));
    const body = res && (await res.json());
    await Promise.all([loadSpecs(), load()]);
    pendingSpec.value = undefined;
    if (!body) return undefined;
    // A project no longer ready is not written: the specs read again show its state.
    if (!('error' in body)) return { text: 'note' in body ? body.note : null };
    const { code } = body.error;
    const reasons = 'reasons' in body.error && Array.isArray(body.error.reasons) ? body.error.reasons.map(String) : [];
    if (code === 'stale-revision')
      return { code, text: `The project changed while you were ${doing}. Try again on the specs as they are now.` };
    const filed = 'filed' in body.error && body.error.filed === true;
    const taken = 'taken' in body.error && body.error.taken === true;
    return { code, taken, text: explain?.({ code, reasons, filed, taken }) ?? roadmapRefusal(code, reasons, doing, spec) };
  }

  /**
   * A roadmap edit Jig refused: its code, its reasons, and for filing an item's task whether the task was filed, and
   * whether its id is a finished task's.
   */
  type Refused = {
    code: string;
    reasons: string[];
    filed: boolean;
    taken: boolean;
  };

  /** An edit made on the card: what came of it goes to the notice. */
  async function edit(
    spec: string,
    doing: string,
    send: (revision: number) => Promise<Edited>,
    explain?: (refused: Refused) => string | undefined,
  ) {
    const outcome = await editRoadmap(spec, doing, send, explain);
    if (outcome?.text) notice.value = { text: outcome.text, changed: [] };
  }

  const addItem = (spec: string, phase: number, text: string) =>
    edit(
      spec,
      `adding an item to Phase ${phase} of ${spec}`,
      (revision) => client.api.projects[':id'].specs.items.add.$post({ param, json: { spec, phase, text, revision } }),
      ({ code }) =>
        code === 'usage'
          ? 'Jig does not take this item: one line of at most 500 characters, not led by a task id — File task… names one.'
          : undefined,
    );

  const moveItem = (spec: string, item: string, place: ItemPlace) =>
    edit(spec, `moving an item of ${spec}`, (revision) =>
      client.api.projects[':id'].specs.items.move.$post({ param, json: { spec, item, place, revision } }),
    );

  /** The item whose task the File task… dialog files, and why its last try was refused — in the dialog, which stays open. */
  const filingItem = ref<{
    spec: string;
    item: SpecItem;
    refusal?: {
      text: string;
      taken: boolean;
    };
  }>();

  async function fileItem(task: string, goal: string | null): Promise<void> {
    const shown = filingItem.value;
    if (!shown?.item.id) return;
    const { spec, item } = shown;
    const id = item.id!;
    const outcome = await editRoadmap(
      spec,
      `filing the task of an item of ${spec}`,
      (revision) => client.api.projects[':id'].specs.items.file.$post({ param, json: { spec, item: id, task, goal, revision } }),
      ({ code, reasons, filed, taken }) => fileItemRefusal(code, reasons, task, filed, taken),
    );

    if (!outcome || filingItem.value !== shown) return;
    if (outcome.code === undefined) {
      filingItem.value = undefined;
      if (outcome.text) notice.value = { text: outcome.text, changed: [] };
    } else shown.refusal = { text: outcome.text ?? '', taken: outcome.taken === true };
  }

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

  /** What waits for a decision in the project's knowledge, read only while the view shows it, and each diff and text open there. */
  const knowledge = ref<Knowledge | 'not-connected'>();
  const diffs = ref<Partial<Record<string, SourceDiff | 'reading' | 'not-found'>>>({});
  const texts = ref<Partial<Record<string, DocumentText | 'reading' | 'not-found'>>>({});
  const loadKnowledge = lastWins(
    async () => {
      const res = await call(() => client.api.projects[':id'].knowledge.$get({ param }));
      return res && (res.status === 404 ? ('not-connected' as const) : (await res.json()).knowledge);
    },
    (read) => {
      knowledge.value = read;
      // A diff stays open while its file is still listed as changed, and is read again with the list.
      const changed = new Set(
        typeof read === 'object' && read.state === 'ready' ? read.sources.filter((s) => s.state === 'changed').map((s) => s.id) : [],
      );

      for (const doc of Object.keys(diffs.value)) {
        if (changed.has(doc)) void readDiff(doc);
        else delete diffs.value[doc];
      }
      // A document's text likewise, while the document is still proposed.
      const proposed = new Set(typeof read === 'object' && read.state === 'ready' ? read.proposals.map((p) => p.id) : []);
      for (const doc of Object.keys(texts.value)) {
        if (proposed.has(doc)) void readText(doc);
        else delete texts.value[doc];
      }
    },
  );

  const noneKnown = computed(() => (typeof knowledge.value === 'object' ? noKnowledge(knowledge.value) : undefined));

  /**
   * Reads what one document shows while it is open, each document through its own `lastWins`: an older answer never
   * overwrites a newer one, and nothing lands once the document is closed.
   */
  function perDocument<T>(
    open: Ref<Partial<Record<string, T | 'reading' | 'not-found'>>>,
    read: (doc: string) => Promise<T | 'not-found' | undefined>,
  ): (doc: string) => Promise<unknown> {
    const reads = new Map<string, () => Promise<unknown>>();
    return (doc) => {
      if (open.value[doc] === undefined) open.value[doc] = 'reading';
      let run = reads.get(doc);
      if (!run) {
        run = lastWins(
          () => read(doc),
          (answer) => doc in open.value && (open.value[doc] = answer),
        );

        reads.set(doc, run);
      }
      return run();
    };
  }

  const readDiff = perDocument(diffs, async (doc) => {
    const res = await call(() =>
      client.api.projects[':id'].knowledge[':doc'].diff.$get({ param: { ...param, doc: encodeURIComponent(doc) } }),
    );

    return res && (res.status === 200 ? (await res.json()).diff : 'not-found');
  });

  function toggleDiff(doc: string, open: boolean): void {
    if (open) void readDiff(doc);
    else delete diffs.value[doc];
  }

  const readText = perDocument(texts, async (doc) => {
    const res = await call(() =>
      client.api.projects[':id'].knowledge[':doc'].text.$get({ param: { ...param, doc: encodeURIComponent(doc) } }),
    );

    return res && (res.status === 200 ? (await res.json()).text : 'not-found');
  });

  function toggleText(doc: string, open: boolean): void {
    if (open) void readText(doc);
    else delete texts.value[doc];
  }

  /** The document whose decision is on its way to Jig. */
  const deciding = ref<string>();

  /**
   * Sends one decision with the revision of the knowledge it was made on, then reads the knowledge again whatever came of
   * it; Jig's note, or why it refused, goes to the notice.
   */
  async function decide(doc: string, decision: Decision): Promise<void> {
    const shown = knowledge.value;
    if (typeof shown !== 'object' || shown.state !== 'ready' || deciding.value !== undefined) return;
    deciding.value = doc;
    notice.value = undefined;
    const res = await call(() =>
      client.api.projects[':id'].knowledge.decide.$post({ param, json: { doc, decision, revision: shown.revision } }),
    );

    const body = res && (await res.json());
    await loadKnowledge();
    deciding.value = undefined;
    if (!body) return;
    if (!('error' in body)) {
      // A project no longer ready is not written: the knowledge read again shows its state.
      if ('note' in body && body.note) notice.value = { text: body.note, changed: [] };
      return;
    }
    const { code } = body.error;
    const reasons = 'reasons' in body.error && Array.isArray(body.error.reasons) ? body.error.reasons.map(String) : [];
    notice.value = {
      text:
        code === 'stale-revision'
          ? 'The knowledge changed since it was shown: here it is as it is now.'
          : knowledgeRefusal(code, reasons, doc),
      changed: [],
    };
  }

  watch(view, (shown) => shown === 'knowledge' && void loadKnowledge());

  onUnmounted(
    onChange((project) => {
      if (project !== undefined && project !== props.id) return;
      void load();
      void loadSpecs();
      void loadFinished();
      void readSelected();
      if (view.value === 'knowledge') void loadKnowledge();
    }),
  );
</script>

<template>
  <div class="flex h-full flex-col">
    <Collapsible v-model:open="filing" class="shrink-0" @update:open="filingRefusal = undefined">
      <div class="flex shrink-0 items-center gap-3 border-b px-3 py-1.5">
        <h1 class="font-semibold">{{ id }}</h1>
        <Toggle v-if="finishedCount > 0" v-model="showFinished" variant="outline" size="sm">
          {{ finishedCount }} finished {{ finishedCount === 1 ? 'task' : 'tasks' }}
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
          <ToggleGroupItem value="knowledge"><BookCheck />Knowledge</ToggleGroupItem>
        </ToggleGroup>
        <CollapsibleTrigger v-if="typeof board === 'object' && board.state === 'ready'" as-child>
          <Button variant="outline" size="sm"><Plus />New task</Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent class="border-b px-3 py-2">
        <NewTaskForm :busy="filingBusy" :refusal="filingRefusal?.text" :taken="filingRefusal?.code === 'already-exists'" @file="file" />
      </CollapsibleContent>
    </Collapsible>

    <FinishedList
      v-if="showFinished"
      :read="finished"
      class="max-h-48 shrink-0 overflow-y-auto border-b"
      @read-again="readFinishedAfresh"
    />

    <BoardFilter
      v-if="typeof board === 'object' && board.state === 'ready' && (view === 'board' || view === 'list')"
      v-model="sifting"
      :shown="shownCount"
      :total="cards.length"
      class="shrink-0"
    />

    <p v-if="notice" role="status" class="flex shrink-0 items-center gap-2 border-b px-3 py-1.5" :class="toneText.attention">
      {{ notice.text }}
      <button type="button" class="ml-auto underline underline-offset-2" @click="notice = undefined">dismiss</button>
    </p>

    <p v-if="board === undefined" class="p-3 text-muted-foreground">Reading the board…</p>
    <p v-else-if="board === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
    <p v-else-if="board.state !== 'ready'" class="p-3"><StateLine :project="board" :reading="reading" @read-again="reread" /></p>

    <BoardColumns
      v-else-if="view === 'board'"
      :project="id"
      :columns="sifted"
      :sorted="sorted"
      :filtered="filtered(sifting)"
      :selected="selected"
      :details="details"
      :pending="pending"
      :changed="notice?.changed"
      @toggle="(task) => (selected = selected === task ? undefined : task)"
      @move="move"
      @prioritise="prioritise"
      @pause="pause"
      @resume="resume"
      @close="close"
    />

    <div v-else-if="view === 'specs'" class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="specs === undefined" class="p-3 text-muted-foreground">Reading the specs…</p>
      <p v-else-if="specs === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
      <p v-else-if="specs.state !== 'ready'" class="p-3"><StateLine :project="specs" :reading="reading" @read-again="reread" /></p>
      <p v-else-if="specs.specs.length === 0" class="p-3 text-muted-foreground">
        No specs in this project. A spec is written with the <code>jig-idea</code> skill and kept in <code>.ai/specs/</code>.
      </p>
      <Tabs v-else-if="chosenSpec" :model-value="chosenSpec.id" class="gap-5 px-6 py-5" @update:model-value="chooseSpec">
        <TabsList v-if="specs.specs.length > 1" aria-label="Specs" class="max-w-full overflow-x-auto">
          <TabsTrigger v-for="spec in specs.specs" :key="spec.id" :value="spec.id" :title="spec.title ?? spec.id" class="shrink-0">
            {{ spec.id }}
            <Badge v-if="spec.queue?.priority != null" variant="secondary">P{{ spec.queue.priority }}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent :value="chosenSpec.id">
          <SpecBoard
            :key="chosenSpec.id"
            :spec="chosenSpec"
            :project="id"
            :columns="columnOf"
            :busy="pendingSpec === chosenSpec.id"
            :editable="specs.editable"
            :disabled="pendingSpec !== undefined"
            @add="(phase, text) => addItem(chosenSpec!.id, phase, text)"
            @move="(item, place) => moveItem(chosenSpec!.id, item, place)"
            @file="(item) => (filingItem = { spec: chosenSpec!.id, item })"
          >
            <template v-if="movable(chosenSpec)" #menu>
              <EpicMenu
                :spec="chosenSpec"
                :specs="specs.specs"
                :disabled="pendingSpec !== undefined"
                @move="(place) => moveEpic(chosenSpec!.id, place)"
                @prioritise="(priority) => prioritiseEpic(chosenSpec!.id, priority)"
              />
            </template>
          </SpecBoard>
        </TabsContent>
      </Tabs>
      <FileItemDialog
        v-if="filingItem"
        :key="filingItem.item.id ?? ''"
        :open="true"
        :spec="filingItem.spec"
        :item="filingItem.item"
        :live="liveIds"
        :busy="pendingSpec !== undefined"
        :refusal="filingItem.refusal?.text"
        :taken="filingItem.refusal?.taken"
        @update:open="(open) => !open && (filingItem = undefined)"
        @file="fileItem"
      />
    </div>

    <div v-else-if="view === 'knowledge'" class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="knowledge === undefined" class="p-3 text-muted-foreground">Reading the knowledge…</p>
      <p v-else-if="knowledge === 'not-connected'" role="alert" class="p-3 text-destructive">No connected project is called {{ id }}.</p>
      <p v-else-if="noneKnown" class="p-3 text-muted-foreground">{{ noneKnown }}</p>
      <KnowledgeView
        v-else-if="knowledge.state === 'ready'"
        :knowledge="knowledge"
        :diffs="diffs"
        :texts="texts"
        :busy="deciding"
        :disabled="deciding !== undefined"
        @decide="decide"
        @toggle="toggleDiff"
        @toggle-text="toggleText"
      />
    </div>

    <BoardList
      v-else
      :project="id"
      :columns="sifted"
      :sorted="sorted"
      :filtered="filtered(sifting)"
      :selected="selected"
      :details="details"
      :pending="pending"
      :changed="notice?.changed"
      @select="(task) => (selected = task)"
      @move="move"
      @prioritise="prioritise"
      @pause="pause"
      @resume="resume"
      @close="close"
    />
  </div>
</template>
