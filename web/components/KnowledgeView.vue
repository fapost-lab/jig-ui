<script setup lang="ts">
  import { ChevronDown, ChevronRight, ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import { type Decision, link, type ReadyKnowledge, type SourceDiff } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { bindsLine, NO_DROP, readFirst, shownDiff, sourceLine, stubLine, waitingWord } from '@/lib/knowledge';
  import { waitingState } from '@/lib/specs';
  import { toneText } from '@/lib/tones';

  /** What waits for a person's decision in a project's knowledge, and each open diff — being read, read, or gone. */
  const props = defineProps<{
    knowledge: ReadyKnowledge;
    diffs: Partial<Record<string, SourceDiff | 'reading' | 'not-found'>>;
    /** The document whose decision is on its way to Jig. */
    busy?: string;
    /** A decision is on its way to Jig: every other one waits. */
    disabled?: boolean;
  }>();

  const emit = defineEmits<{
    decide: [doc: string, decision: Decision];
    toggle: [doc: string, open: boolean];
  }>();

  /** Each linked file with its line and its diff as shown, `undefined` while closed. */
  const sources = computed(() =>
    props.knowledge.sources.map((s) => {
      const read = props.diffs[s.id];
      return { s, line: sourceLine(s), diff: read && shownDiff(read) };
    }),
  );
</script>

<template>
  <div class="flex flex-col gap-4 p-3">
    <p v-if="knowledge.waiting" :class="toneText.attention">
      Decisions wait on <code>{{ knowledge.waiting.branch }}</code> for <code>{{ knowledge.waiting.base }}</code
      >:
      <a
        v-if="link(knowledge.waiting.pr)"
        :href="link(knowledge.waiting.pr)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 underline underline-offset-2"
        >pull request<ExternalLink class="size-3"
      /></a>
      <template v-else>{{ waitingState(knowledge.waiting) }}</template
      >. The knowledge below is as it is here, with what waits there marked.
    </p>

    <section v-if="knowledge.proposals.length > 0" aria-labelledby="proposed" class="flex flex-col gap-2">
      <h2 id="proposed" class="font-semibold tracking-wider uppercase">Proposed</h2>
      <ul class="border-y">
        <li v-for="p in knowledge.proposals" :key="p.id" class="flex flex-col gap-1 border-b px-3 py-2 last:border-b-0">
          <p class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ p.id }}</span>
            <Badge variant="outline">{{ p.type }}</Badge>
          </p>
          <p :class="{ 'text-muted-foreground': p.summary === null }">{{ p.summary ?? 'No summary.' }}</p>
          <p class="break-words text-muted-foreground">
            <code>{{ p.path }}</code> · {{ bindsLine(p) }}
          </p>
          <p v-if="stubLine(p)" :class="p.bytes === null ? toneText.bad : 'text-muted-foreground'">{{ stubLine(p) }}</p>
          <p v-if="p.waiting" :class="toneText.attention">
            {{ waitingWord(p.waiting) }}
            <a
              v-if="link(p.waiting.pr)"
              :href="link(p.waiting.pr)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 underline underline-offset-2"
              >pull request<ExternalLink class="size-3"
            /></a>
          </p>
          <template v-else>
            <p class="text-muted-foreground">{{ readFirst(p) }}</p>
            <p class="flex flex-wrap items-center gap-2">
              <Button size="xs" :disabled="disabled" @click="emit('decide', p.id, 'accept')">
                {{ busy === p.id ? 'Sending…' : 'Accept' }}
              </Button>
              <Button variant="outline" size="xs" :disabled="disabled" @click="emit('decide', p.id, 'reject')">Reject</Button>
            </p>
          </template>
        </li>
      </ul>
    </section>

    <section v-if="knowledge.sources.length > 0" aria-labelledby="changed" class="flex flex-col gap-2">
      <h2 id="changed" class="font-semibold tracking-wider uppercase">Changed sources</h2>
      <ul class="border-y">
        <li v-for="{ s, line, diff } in sources" :key="s.id" class="flex min-w-0 flex-col gap-1 border-b px-3 py-2 last:border-b-0">
          <p class="font-semibold">{{ s.id }}</p>
          <p :class="toneText[line.tone]">{{ line.text }}</p>
          <Collapsible v-if="s.state === 'changed'" :open="s.id in diffs" @update:open="(open: boolean) => emit('toggle', s.id, open)">
            <CollapsibleTrigger class="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <ChevronDown v-if="s.id in diffs" class="size-3" />
              <ChevronRight v-else class="size-3" />
              Diff since approved
            </CollapsibleTrigger>
            <CollapsibleContent class="pt-1">
              <p v-if="diff?.kind === 'reading'" class="text-muted-foreground">Reading…</p>
              <p v-else-if="diff?.kind === 'gone'" class="text-muted-foreground">Jig no longer lists it as changed.</p>
              <p v-else-if="diff?.kind === 'failed'" :class="toneText.bad">Jig could not read the diff.</p>
              <p v-else-if="diff?.kind === 'whole'" :class="toneText.attention">
                No approved text to compare with: read {{ s.source }} whole before you keep it.
              </p>
              <template v-else-if="diff?.kind === 'lines'">
                <p v-if="diff.lossy" :class="toneText.attention">Jig dropped bytes of it that are not UTF-8.</p>
                <pre
                  class="overflow-x-auto rounded bg-muted p-2 text-xs"
                ><code><span v-for="(row, i) in diff.lines" :key="i" class="block" :class="row.tone && toneText[row.tone]">{{ row.text || ' ' }}</span></code></pre>
              </template>
            </CollapsibleContent>
          </Collapsible>
          <p v-if="s.waiting" :class="toneText.attention">
            {{ waitingWord(s.waiting) }}
            <a
              v-if="link(s.waiting.pr)"
              :href="link(s.waiting.pr)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 underline underline-offset-2"
              >pull request<ExternalLink class="size-3"
            /></a>
          </p>
          <p v-else-if="s.state !== 'missing'" class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button size="xs" :disabled="disabled" @click="emit('decide', s.id, 'reviewed')">{{
              busy === s.id ? 'Sending…' : 'Keep'
            }}</Button>
            <span class="text-muted-foreground">{{ NO_DROP }}</span>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
