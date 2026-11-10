<script setup lang="ts">
  import { ExternalLink, Plus } from '@lucide/vue';
  import { computed, ref } from 'vue';
  import { type ItemPlace, link, type Spec, type SpecItem } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { agentRequests, itemStanding, LANES, laneOf, openingPhase, shownRoadmap, waitingItems, waitingState } from '@/lib/specs';
  import { laneAccent, toneText } from '@/lib/tones';
  import CopyCommand from './CopyCommand.vue';
  import GroupPanel from './GroupPanel.vue';
  import ProgressBar from './ProgressBar.vue';
  import SpecItemCard from './SpecItemCard.vue';
  import SpecItemMenu from './SpecItemMenu.vue';

  /**
   * A spec as a roadmap board: its head, a step for each phase, and the chosen phase's items in three lanes — to file,
   * in work, done — each in the roadmap's order.
   */
  const props = defineProps<{
    spec: Spec;
    project: string;
    /** The board column of each live task, by its id: an item naming one links to its details and says the column. */
    columns: ReadonlyMap<
      string,
      {
        id: string;
        title: string;
      }
    >;
    /** A change of its epic or its roadmap is on its way to Jig. */
    busy?: boolean;
    /** Its roadmap is edited from here: the project's Jig has `jig spec item`. */
    editable?: boolean;
    /** A change of the view is on its way to Jig: every edit waits. */
    disabled?: boolean;
  }>();

  const emit = defineEmits<{
    add: [phase: number, text: string];
    move: [item: string, place: ItemPlace];
    file: [item: SpecItem];
  }>();

  /** The roadmap as the next edit finds it, and the items the edits waiting on the spec's branch changed. */
  const roadmap = computed(() => shownRoadmap(props.spec));
  const marked = computed(() => waitingItems(props.spec));
  const numbered = computed(() => roadmap.value.phases.flatMap((p) => (p.phase === null ? [] : [p.phase])));
  const requests = computed(() => agentRequests(props.spec, props.project));

  /** The phase shown, by its place in the roadmap: the first with work left when the board opens. */
  const at = ref(openingPhase(roadmap.value.phases));
  const phase = computed(() => roadmap.value.phases[Math.min(at.value, roadmap.value.phases.length - 1)]);
  const lanes = computed(() =>
    LANES.map((lane) => ({
      ...lane,
      cards: (phase.value?.items ?? []).flatMap((item, index) => (laneOf(item) === lane.id ? [{ item, index }] : [])),
    })),
  );

  const name = (p: Spec['phases'][number]) =>
    p.phase === null ? 'Before the first phase' : p.title ? `Phase ${p.phase} · ${p.title}` : `Phase ${p.phase}`;

  /** The card opened, by its item's handle, or its place for an item without one. */
  const opened = ref<string>();
  const keyOf = (item: SpecItem, index: number) => item.id ?? `${at.value}:${index}`;

  /** The Add item field is open, and what is typed in it. */
  const adding = ref(false);
  const text = ref('');
  function add(phase: number): void {
    emit('add', phase, text.value.trim());
    adding.value = false;
    text.value = '';
  }
</script>

<template>
  <section class="flex flex-col gap-5" :aria-labelledby="`spec-${spec.id}`">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 :id="`spec-${spec.id}`" class="text-base font-semibold">{{ spec.title ?? spec.id }}</h2>
        <span v-if="spec.title" class="font-mono text-xs text-muted-foreground">{{ spec.id }}</span>
        <span class="ml-auto flex items-center gap-2">
          <Badge v-if="spec.queue?.priority != null" variant="secondary" :title="`Priority ${spec.queue.priority}`">
            P{{ spec.queue.priority }}
          </Badge>
          <!-- The epic's queue menu, from the page that writes it. -->
          <slot name="menu" />
        </span>
      </div>
      <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <ProgressBar v-if="roadmap.progress" :done="roadmap.progress.done" :total="roadmap.progress.total" />
        <span v-if="roadmap.progress && roadmap.progress.fog > 0">{{ roadmap.progress.fog }} fog</span>
        <span v-if="spec.epic">
          epic <code class="text-xs text-foreground">{{ spec.epic.branch }}</code> — {{ spec.epic.state
          }}<template v-if="spec.epic.checkedOut">, checked out here</template
          ><template v-if="spec.epic.fetched">, as of the last fetch</template>
          <span v-if="spec.epic.missing" :class="toneText.attention">, the branch is nowhere</span>
        </span>
        <span v-else>each phase ships on its own</span>
        <span v-if="spec.release">the release raises the {{ spec.release }} version</span>
      </p>
      <p v-if="busy" class="text-[13px] text-muted-foreground" role="status">sending to Jig…</p>
      <p v-if="spec.waiting" class="text-[13px]" :class="toneText.attention">
        Edits wait on <code class="text-xs">{{ spec.waiting.branch }}</code> for <code class="text-xs">{{ spec.waiting.base }}</code
        >:
        <a
          v-if="link(spec.waiting.pr)"
          :href="link(spec.waiting.pr)"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 underline underline-offset-2"
          >pull request<ExternalLink class="size-3"
        /></a>
        <template v-else>{{ waitingState(spec.waiting) }}</template
        >. The roadmap below is the one there.
      </p>
      <p v-if="spec.missingFiles.length > 0" class="text-[13px]" :class="toneText.attention">
        Missing from the spec: {{ spec.missingFiles.join(', ') }}
      </p>
      <p v-else-if="roadmap.progress === null" class="text-[13px]" :class="toneText.attention">The roadmap cannot be read.</p>
      <div v-if="requests.length" class="flex max-w-3xl flex-col gap-1">
        <p class="text-[13px] text-muted-foreground">Ask your agent:</p>
        <CopyCommand v-for="request in requests" :key="request" :command="request" />
      </div>
    </header>

    <Tabs v-if="roadmap.phases.length > 0" v-model="at" class="gap-4">
      <TabsList aria-label="Phases" class="max-w-full overflow-x-auto">
        <template v-for="(p, i) in roadmap.phases" :key="i">
          <span v-if="i > 0" class="h-px w-3 shrink-0 bg-border" aria-hidden="true" />
          <TabsTrigger :value="i" :title="name(p)" class="shrink-0 rounded-full border px-3 py-1 text-xs data-active:border-foreground/30">
            <span v-if="p.total > 0 && p.done === p.total" :class="toneText.good" aria-label="done">✓</span>
            <span v-else class="tabular-nums" :aria-label="`${p.done} of ${p.total} done`">{{ p.done }}/{{ p.total }}</span>
            <span class="max-w-56 truncate">{{ name(p) }}</span>
          </TabsTrigger>
        </template>
      </TabsList>

      <TabsContent v-if="phase" :value="at" class="flex flex-col gap-4">
        <div class="grid gap-3 md:grid-cols-3">
          <GroupPanel v-for="lane in lanes" :key="lane.id" :accent="laneAccent[lane.id]" :aria-labelledby="`lane-${spec.id}-${lane.id}`">
            <template #head>
              <h3 :id="`lane-${spec.id}-${lane.id}`" class="flex items-center gap-2 px-3 pt-2.5 pb-1 text-[13px] font-semibold">
                {{ lane.title }}
                <span class="font-normal text-muted-foreground tabular-nums">{{ lane.cards.length }}</span>
              </h3>
            </template>
            <p
              v-if="lane.cards.length === 0"
              class="m-2 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground"
            >
              nothing here
            </p>
            <ul v-else class="flex flex-col gap-2 p-2">
              <SpecItemCard
                v-for="{ item, index } in lane.cards"
                :key="keyOf(item, index)"
                :item="item"
                :project="project"
                :standing="itemStanding(item, columns)"
                :live="item.task !== null && columns.has(item.task)"
                :open="opened === keyOf(item, index)"
                :waiting="item.id !== null && marked.has(item.id)"
                @toggle="opened = opened === keyOf(item, index) ? undefined : keyOf(item, index)"
              >
                <template v-if="editable && item.id !== null" #menu>
                  <SpecItemMenu
                    :items="phase.items"
                    :index="index"
                    :phase="phase.phase"
                    :phases="numbered"
                    :disabled="disabled"
                    @move="(place) => emit('move', item.id!, place)"
                    @file="emit('file', item)"
                  />
                </template>
              </SpecItemCard>
            </ul>
          </GroupPanel>
        </div>

        <template v-if="editable && phase.phase !== null">
          <form v-if="adding" class="flex max-w-3xl items-center gap-2" @submit.prevent="add(phase.phase)">
            <Input
              v-model="text"
              required
              maxlength="500"
              :aria-label="`A new item of Phase ${phase.phase}`"
              placeholder="What the item makes better, in one line"
              class="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" :disabled="disabled">Add</Button>
            <Button type="button" variant="ghost" size="sm" @click="adding = false">Cancel</Button>
          </form>
          <Button v-else variant="ghost" size="sm" class="self-start text-muted-foreground" :disabled="disabled" @click="adding = true"
            ><Plus />Add item</Button
          >
        </template>
      </TabsContent>
    </Tabs>
  </section>
</template>
