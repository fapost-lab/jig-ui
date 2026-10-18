<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { ref } from 'vue';
import type { Spec } from '@/api';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toneText } from '@/lib/tones';
import ProgressBar from './ProgressBar.vue';
import SpecItemRow from './SpecItemRow.vue';

/** `live`: the ids of the project's live tasks; an item naming one links to its details. */
const props = defineProps<{ spec: Spec; project: string; live: string[] }>();

/** Phases folded away; a finished phase starts folded. */
const folded = ref(new Set(props.spec.phases.flatMap((p, i) => (p.total > 0 && p.done === p.total ? [i] : []))));
function fold(i: number, open: boolean): void {
  if (open) folded.value.delete(i);
  else folded.value.add(i);
}
</script>

<template>
  <section class="border" :aria-labelledby="`spec-${spec.id}`">
    <div class="flex flex-col gap-1 border-b px-3 py-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 :id="`spec-${spec.id}`" class="font-semibold tracking-wider uppercase">{{ spec.id }}</h2>
        <span v-if="spec.title" class="min-w-0 flex-1">{{ spec.title }}</span>
        <span v-if="spec.progress" class="ml-auto flex items-center gap-3">
          <ProgressBar :done="spec.progress.done" :total="spec.progress.total" />
          <span v-if="spec.progress.fog > 0" class="text-muted-foreground">fog {{ spec.progress.fog }}</span>
        </span>
      </div>
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
      <p v-if="spec.missingFiles.length > 0" :class="toneText.attention">Missing from the spec: {{ spec.missingFiles.join(', ') }}</p>
      <p v-else-if="spec.progress === null" :class="toneText.attention">The roadmap cannot be read.</p>
    </div>

    <Collapsible v-for="(phase, i) in spec.phases" :key="i" :open="!folded.has(i)" @update:open="(open: boolean) => fold(i, open)">
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
            :key="j"
            :item="item"
            :project="project"
            :live="item.task !== null && live.includes(item.task)"
          />
        </ul>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
