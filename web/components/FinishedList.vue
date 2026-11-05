<script setup lang="ts">
  import { ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import type { Finished } from '@/api';
  import { Button } from '@/components/ui/button';
  import { finished, latestFirst, noFinished } from '@/lib/finished';
  import { toneText } from '@/lib/tones';

  const props = defineProps<{
    /** The read of the finished tasks Jig still keeps, shown the latest first; none yet while it runs. */
    read?: Finished;
  }>();

  defineEmits<{
    readAgain: [];
  }>();

  const none = computed(() => props.read && noFinished(props.read));
  const rows = computed(() =>
    props.read?.state === 'ready' ? latestFirst(props.read.tasks).map((task) => ({ task, ...finished(task) })) : [],
  );
</script>

<template>
  <p v-if="read === undefined" class="px-3 py-1.5 text-muted-foreground">Reading the finished tasks…</p>
  <p v-else-if="none" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-muted-foreground">
    {{ none }}
    <Button v-if="read.state === 'unreadable'" variant="outline" size="xs" @click="$emit('readAgain')">Read again</Button>
  </p>
  <ul v-else aria-label="Finished tasks">
    <li v-for="{ task, word, tone, pr } in rows" :key="task.id" class="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
      <span class="w-40 shrink-0 truncate font-semibold" :title="task.id">{{ task.id }}</span>
      <span class="w-20 shrink-0" :class="toneText[tone]">{{ word }}</span>
      <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ task.goal }}</span>
      <template v-if="pr">
        <a
          v-if="pr.url"
          :href="pr.url"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex shrink-0 items-center gap-1 underline underline-offset-2"
        >
          {{ pr.text }}<ExternalLink class="size-3" />
        </a>
        <span v-else class="shrink-0">{{ pr.text }}</span>
      </template>
      <span v-if="task.updatedAt" class="shrink-0 text-muted-foreground">{{ task.updatedAt }}</span>
    </li>
  </ul>
</template>
