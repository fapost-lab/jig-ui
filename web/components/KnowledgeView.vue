<script setup lang="ts">
  import { ChevronDown, ChevronRight, ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import { type Decision, type DocumentText, link, type ReadyKnowledge, type SourceDiff } from '@/api';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import {
    bindsLine,
    LOSSY,
    LOSSY_NAME,
    NO_DROP,
    pendingLine,
    readFirst,
    shownDiff,
    shownText,
    sourceActions,
    sourceLine,
    landed,
    stubLine,
    undecidable,
    waitingWord,
  } from '@/lib/knowledge';
  import { prose, rendered } from '@/lib/markdown';
  import { waitingState } from '@/lib/specs';
  import { toneText } from '@/lib/tones';
  import GroupPanel from './GroupPanel.vue';

  /**
   * What waits for a person's decision in a project's knowledge, and each open diff and document text — being read, read,
   * or gone.
   */
  const props = defineProps<{
    knowledge: ReadyKnowledge;
    diffs: Partial<Record<string, SourceDiff | 'reading' | 'not-found'>>;
    texts: Partial<Record<string, DocumentText | 'reading' | 'not-found'>>;
    /** Decisions pressed that wait for a write: each can be taken back. */
    queued: ReadonlyMap<string, Decision>;
    /** Decisions in the write under way. */
    sending: ReadonlyMap<string, Decision>;
  }>();

  const emit = defineEmits<{
    decide: [doc: string, decision: Decision];
    toggle: [doc: string, open: boolean];
    toggleText: [doc: string, open: boolean];
    takeBack: [doc: string];
  }>();

  /** The line of a decision the page holds for a document, `undefined` for none. */
  function pending(doc: string, of: 'proposal' | 'source'): string | undefined {
    const decision = props.sending.get(doc) ?? props.queued.get(doc);
    return decision && pendingLine(decision, of, props.sending.has(doc));
  }

  /** Each proposal with why Jig cannot decide it as of the last fetch, and its text as shown — a Markdown file as HTML cleaned of anything that could run —, `undefined` while closed. */
  const proposals = computed(() =>
    props.knowledge.proposals.map((p) => {
      const read = props.texts[p.id];
      const text = read && shownText(p, read);
      return {
        p,
        blocked: undecidable(p),
        text:
          text?.kind === 'text'
            ? { kind: text.kind, parts: text.parts.map((part) => ({ ...part, html: part.markdown ? rendered(part.text) : undefined })) }
            : text,
      };
    }),
  );

  /** Each linked file with its line, its buttons, why Jig cannot decide it as of the last fetch, and its diff as shown, `undefined` while closed. */
  const sources = computed(() =>
    props.knowledge.sources.map((s) => {
      const read = props.diffs[s.id];
      return {
        s,
        line: sourceLine(s, props.knowledge.canDrop),
        actions: sourceActions(s, props.knowledge.canDrop),
        blocked: undecidable(s),
        diff: read && shownDiff(read),
      };
    }),
  );
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-5">
    <p v-if="knowledge.waiting" class="text-[13px]" :class="toneText.attention">
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

    <GroupPanel v-if="knowledge.proposals.length > 0" aria-labelledby="proposed">
      <template #head><h2 id="proposed" class="px-4 pt-3 pb-2 text-[15px] font-semibold">Proposed</h2></template>
      <ul class="flex flex-col gap-2 px-2 pb-2">
        <li
          v-for="{ p, blocked, text } in proposals"
          :key="p.id"
          class="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-xs"
        >
          <p class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[13px] font-medium">{{ p.id }}</span>
            <Badge variant="outline">{{ p.type }}</Badge>
          </p>
          <p :class="{ 'text-muted-foreground': p.summary === null }">{{ p.summary ?? 'No summary.' }}</p>
          <p class="text-[13px] break-words text-muted-foreground">
            <code class="text-xs">{{ p.path }}</code> · {{ bindsLine(p) }}
          </p>
          <p v-if="stubLine(p)" :class="p.bytes === null ? toneText.bad : 'text-muted-foreground'">{{ stubLine(p) }}</p>
          <p v-if="p.lossy" :class="toneText.attention">{{ LOSSY_NAME }}</p>
          <Collapsible v-if="knowledge.canRead" :open="p.id in texts" @update:open="(open: boolean) => emit('toggleText', p.id, open)">
            <CollapsibleTrigger class="inline-flex items-center gap-1 text-[13px] underline-offset-2 hover:underline">
              <ChevronDown v-if="p.id in texts" class="size-3" />
              <ChevronRight v-else class="size-3" />
              Document
            </CollapsibleTrigger>
            <CollapsibleContent class="flex flex-col gap-2 pt-1">
              <p v-if="text?.kind === 'reading'" class="text-muted-foreground">Reading…</p>
              <p v-else-if="text?.kind === 'gone'" class="text-muted-foreground">Jig no longer lists it as proposed.</p>
              <p v-else-if="text?.kind === 'failed'" :class="toneText.bad">Jig could not read it.</p>
              <template v-else-if="text?.kind === 'text'">
                <div v-for="(part, i) in text.parts" :key="part.path" class="flex min-w-0 flex-col gap-1">
                  <p v-if="i > 0" class="text-muted-foreground">
                    <code>{{ part.path }}</code
                    >, as it is now:
                  </p>
                  <p v-if="part.lossy" :class="toneText.attention">{{ LOSSY }}</p>
                  <!-- eslint-disable-next-line vue/no-v-html -- cleaned by DOMPurify in lib/markdown.ts -->
                  <div v-if="part.html !== undefined" class="rounded-md border px-3" :class="prose" v-html="part.html" />
                  <pre v-else class="overflow-x-auto rounded-md bg-muted p-2 text-xs">{{ part.text }}</pre>
                </div>
              </template>
            </CollapsibleContent>
          </Collapsible>
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
            <p v-if="blocked" :class="landed(p) ? 'text-muted-foreground' : toneText.attention">{{ blocked }}</p>
            <p v-if="!knowledge.canRead && !landed(p)" class="text-muted-foreground">{{ readFirst(p) }}</p>
            <p v-if="pending(p.id, 'proposal')" class="flex flex-wrap items-center gap-2 text-muted-foreground">
              {{ pending(p.id, 'proposal') }}
              <Button v-if="queued.has(p.id)" variant="outline" size="xs" @click="emit('takeBack', p.id)">Take back</Button>
            </p>
            <p v-else-if="!landed(p)" class="flex flex-wrap items-center gap-2">
              <Button size="xs" @click="emit('decide', p.id, 'accept')">Accept</Button>
              <Button variant="outline" size="xs" @click="emit('decide', p.id, 'reject')">Reject</Button>
            </p>
          </template>
        </li>
      </ul>
    </GroupPanel>

    <GroupPanel v-if="knowledge.sources.length > 0" aria-labelledby="changed">
      <template #head><h2 id="changed" class="px-4 pt-3 pb-2 text-[15px] font-semibold">Changed sources</h2></template>
      <ul class="flex flex-col gap-2 px-2 pb-2">
        <li
          v-for="{ s, line, actions, blocked, diff } in sources"
          :key="s.id"
          class="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-xs"
        >
          <p class="font-mono text-[13px] font-medium">{{ s.id }}</p>
          <p :class="toneText[line.tone]">{{ line.text }}</p>
          <p v-if="s.lossy" :class="toneText.attention">{{ LOSSY_NAME }}</p>
          <Collapsible v-if="s.state === 'changed'" :open="s.id in diffs" @update:open="(open: boolean) => emit('toggle', s.id, open)">
            <CollapsibleTrigger class="inline-flex items-center gap-1 text-[13px] underline-offset-2 hover:underline">
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
                <p v-if="diff.lossy" :class="toneText.attention">{{ LOSSY }}</p>
                <pre
                  class="overflow-x-auto rounded-md bg-muted p-2 text-xs"
                ><code><span v-for="(row, i) in diff.lines" :key="i" class="block" :class="row.tone && toneText[row.tone]">{{ row.text || ' ' }}</span></code></pre>
              </template>
            </CollapsibleContent>
          </Collapsible>
          <p v-if="s.waiting" :class="toneText.attention">
            {{ waitingWord(s.waiting, 'source') }}
            <a
              v-if="link(s.waiting.pr)"
              :href="link(s.waiting.pr)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 underline underline-offset-2"
              >pull request<ExternalLink class="size-3"
            /></a>
          </p>
          <template v-else>
            <p v-if="blocked" :class="landed(s) ? 'text-muted-foreground' : toneText.attention">{{ blocked }}</p>
            <p v-if="pending(s.id, 'source')" class="flex flex-wrap items-center gap-2 text-muted-foreground">
              {{ pending(s.id, 'source') }}
              <Button v-if="queued.has(s.id)" variant="outline" size="xs" @click="emit('takeBack', s.id)">Take back</Button>
            </p>
            <p v-else-if="(actions.keep || actions.drop) && !landed(s)" class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button v-if="actions.keep" size="xs" @click="emit('decide', s.id, 'reviewed')">Keep</Button>
              <Button v-if="actions.drop" variant="outline" size="xs" @click="emit('decide', s.id, 'reject')">Drop</Button>
              <span v-else class="text-muted-foreground">{{ NO_DROP }}</span>
            </p>
          </template>
        </li>
      </ul>
    </GroupPanel>
  </div>
</template>
