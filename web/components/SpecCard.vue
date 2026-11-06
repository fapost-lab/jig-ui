<script setup lang="ts">
  import { ChevronDown, ChevronRight, ExternalLink, Plus } from '@lucide/vue';
  import { computed, ref } from 'vue';
  import { type ItemPlace, link, type Spec, type SpecItem } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { Input } from '@/components/ui/input';
  import { agentRequests, shownRoadmap, waitingItems, waitingState } from '@/lib/specs';
  import { toneText } from '@/lib/tones';
  import CopyCommand from './CopyCommand.vue';
  import ProgressBar from './ProgressBar.vue';
  import SpecItemMenu from './SpecItemMenu.vue';
  import SpecItemRow from './SpecItemRow.vue';

  /** `live`: the ids of the project's live tasks; an item naming one links to its details. */
  const props = defineProps<{
    spec: Spec;
    project: string;
    live: string[];
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

  /** Phases folded away; a finished phase starts folded. */
  const folded = ref(new Set(roadmap.value.phases.flatMap((p, i) => (p.total > 0 && p.done === p.total ? [i] : []))));
  function fold(i: number, open: boolean): void {
    if (open) folded.value.delete(i);
    else folded.value.add(i);
  }

  const requests = computed(() => agentRequests(props.spec, props.project));

  /** The phase whose Add item field is open, and what is typed in it. */
  const adding = ref<number>();
  const text = ref('');
  function add(phase: number): void {
    emit('add', phase, text.value.trim());
    adding.value = undefined;
    text.value = '';
  }
</script>

<template>
  <section class="border" :aria-labelledby="`spec-${spec.id}`">
    <div class="flex flex-col gap-1 border-b px-3 py-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 :id="`spec-${spec.id}`" class="font-semibold tracking-wider uppercase">{{ spec.id }}</h2>
        <span v-if="spec.title" class="min-w-0 flex-1">{{ spec.title }}</span>
        <span v-if="roadmap.progress" class="ml-auto flex items-center gap-3">
          <ProgressBar :done="roadmap.progress.done" :total="roadmap.progress.total" />
          <span v-if="roadmap.progress.fog > 0" class="text-muted-foreground">fog {{ roadmap.progress.fog }}</span>
        </span>
        <span class="flex items-center gap-2" :class="!roadmap.progress && 'ml-auto'">
          <Badge v-if="spec.queue?.priority != null" variant="secondary" :title="`Priority ${spec.queue.priority}`">
            P{{ spec.queue.priority }}
          </Badge>
          <!-- The epic's queue menu, from the page that writes it. -->
          <slot name="menu" />
        </span>
      </div>
      <p v-if="busy" class="text-muted-foreground" role="status">sending to Jig…</p>
      <p class="flex flex-wrap gap-x-4 text-muted-foreground">
        <span v-if="spec.epic">
          epic <span class="text-foreground">{{ spec.epic.branch }}</span> — {{ spec.epic.state
          }}<template v-if="spec.epic.checkedOut">, checked out here</template
          ><template v-if="spec.epic.fetched">, as of the last fetch</template>
          <span v-if="spec.epic.missing" :class="toneText.attention">, the branch is nowhere</span>
        </span>
        <span v-else>no epic: each phase ships on its own</span>
        <span v-if="spec.release">release raises the {{ spec.release }} version</span>
      </p>
      <p v-if="spec.waiting" :class="toneText.attention">
        Edits wait on <code>{{ spec.waiting.branch }}</code> for <code>{{ spec.waiting.base }}</code
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
      <p v-if="spec.missingFiles.length > 0" :class="toneText.attention">Missing from the spec: {{ spec.missingFiles.join(', ') }}</p>
      <p v-else-if="roadmap.progress === null" :class="toneText.attention">The roadmap cannot be read.</p>
      <template v-if="requests.length">
        <p class="text-muted-foreground">Ask your agent:</p>
        <CopyCommand v-for="request in requests" :key="request" :command="request" />
      </template>
    </div>

    <Collapsible v-for="(phase, i) in roadmap.phases" :key="i" :open="!folded.has(i)" @update:open="(open: boolean) => fold(i, open)">
      <h3>
        <CollapsibleTrigger class="flex w-full items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-left">
          <ChevronRight v-if="folded.has(i)" class="size-3 shrink-0" />
          <ChevronDown v-else class="size-3 shrink-0" />
          <span class="font-semibold">
            <template v-if="phase.phase !== null">Phase {{ phase.phase }}</template>
            <template v-if="phase.phase !== null && phase.title"> · </template>
            {{ phase.title ?? (phase.phase === null ? 'Before the first phase' : '') }}
          </span>
          <span class="ml-auto flex items-center gap-3">
            <span v-if="phase.fog > 0" class="text-muted-foreground">fog {{ phase.fog }}</span>
            <ProgressBar :done="phase.done" :total="phase.total" />
          </span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent>
        <ul class="border-b py-1">
          <SpecItemRow
            v-for="(item, j) in phase.items"
            :key="item.id ?? j"
            :item="item"
            :project="project"
            :live="item.task !== null && live.includes(item.task)"
            :waiting="item.id !== null && marked.has(item.id)"
          >
            <template v-if="editable && item.id !== null" #menu>
              <SpecItemMenu
                :items="phase.items"
                :index="j"
                :phase="phase.phase"
                :phases="numbered"
                :disabled="disabled"
                @move="(place) => emit('move', item.id!, place)"
                @file="emit('file', item)"
              />
            </template>
          </SpecItemRow>
          <li v-if="editable && phase.phase !== null" class="px-3 py-1">
            <form v-if="adding === phase.phase" class="flex items-center gap-2" @submit.prevent="add(phase.phase)">
              <Input
                v-model="text"
                required
                maxlength="500"
                :aria-label="`A new item of Phase ${phase.phase}`"
                placeholder="What the item makes better, in one line"
                class="h-7 min-w-0 flex-1"
              />
              <Button type="submit" size="xs" :disabled="disabled">Add</Button>
              <Button type="button" variant="ghost" size="xs" @click="adding = undefined">Cancel</Button>
            </form>
            <Button v-else variant="ghost" size="xs" class="text-muted-foreground" :disabled="disabled" @click="adding = phase.phase"
              ><Plus />Add item</Button
            >
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
