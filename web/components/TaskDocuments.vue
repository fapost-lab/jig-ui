<script setup lang="ts">
  import { ChevronDown, ChevronRight } from '@lucide/vue';
  import { computed } from 'vue';
  import type { ArtifactKind, TaskArtifact, TaskArtifacts } from '@/api';
  import { Button } from '@/components/ui/button';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { documentLine, noDocuments } from '@/lib/artifacts';
  import { rendered } from '@/lib/markdown';
  import { toneText } from '@/lib/tones';

  /** A task's documents: the list Jig gave (`undefined` while it is read), and each open one — being read, read, or gone. */
  const props = defineProps<{
    documents?: TaskArtifacts;
    open: Partial<Record<ArtifactKind, TaskArtifact | 'reading' | 'not-found'>>;
    reading?: boolean;
  }>();

  defineEmits<{
    toggle: [kind: ArtifactKind, open: boolean];
    readAgain: [];
  }>();

  const none = computed(() => props.documents && noDocuments(props.documents));
  const listed = computed(() =>
    props.documents?.state === 'ready' ? props.documents.artifacts.map((artifact) => ({ artifact, line: documentLine(artifact) })) : [],
  );

  /** Each open document read, as HTML cleaned of anything that could run. */
  const html = computed(() =>
    Object.fromEntries(
      Object.entries(props.open).flatMap(([kind, read]) =>
        typeof read === 'object' && read.state === 'ready' ? [[kind, rendered(read.content)]] : [],
      ),
    ),
  );

  // Markdown's elements, which Tailwind's reset leaves bare, styled on the theme's tokens.
  const prose = [
    'min-w-0 px-3 pb-3 leading-relaxed break-words',
    '[&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-semibold',
    '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
    '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1',
    '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
    '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
    '[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
    '[&_a]:underline [&_a]:underline-offset-2 [&_hr]:my-3',
  ].join(' ');
</script>

<template>
  <section aria-labelledby="documents" class="flex flex-col gap-2">
    <h2 id="documents" class="font-semibold tracking-wider uppercase">Documents</h2>
    <p v-if="documents === undefined" class="text-muted-foreground">Reading the documents…</p>
    <p v-else-if="none" class="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
      {{ none }}
      <Button v-if="documents.state === 'unreadable'" variant="outline" size="xs" :disabled="reading" @click="$emit('readAgain')">
        {{ reading ? 'Reading…' : 'Read again' }}
      </Button>
    </p>
    <ul v-else class="border-y">
      <li v-for="{ artifact, line } in listed" :key="artifact.kind" class="border-b last:border-b-0">
        <Collapsible
          :open="artifact.kind in open"
          :disabled="artifact.state !== 'present'"
          @update:open="(o: boolean) => $emit('toggle', artifact.kind, o)"
        >
          <h3>
            <CollapsibleTrigger class="flex w-full items-center gap-2 px-3 py-1.5 text-left enabled:hover:bg-muted/50">
              <ChevronDown v-if="artifact.kind in open" class="size-3 shrink-0" />
              <ChevronRight v-else class="size-3 shrink-0" :class="{ invisible: artifact.state !== 'present' }" />
              <span class="font-semibold">{{ artifact.kind }}</span>
              <span class="ml-auto text-right" :class="toneText[line.tone]">{{ line.text }}</span>
            </CollapsibleTrigger>
          </h3>
          <CollapsibleContent>
            <p v-if="open[artifact.kind] === 'reading'" class="px-3 pb-3 text-muted-foreground">Reading…</p>
            <p v-else-if="open[artifact.kind] === 'not-found'" class="px-3 pb-3 text-muted-foreground">Jig no longer has it.</p>
            <p v-else-if="html[artifact.kind] === undefined" class="flex flex-wrap items-center gap-x-3 px-3 pb-3" :class="toneText.bad">
              Jig could not read it.
              <Button variant="outline" size="xs" @click="$emit('toggle', artifact.kind, true)">Read again</Button>
            </p>
            <!-- eslint-disable-next-line vue/no-v-html -- cleaned by DOMPurify in lib/markdown.ts -->
            <div v-else :class="prose" v-html="html[artifact.kind]" />
          </CollapsibleContent>
        </Collapsible>
      </li>
    </ul>
  </section>
</template>
