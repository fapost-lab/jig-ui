<script setup lang="ts">
  import { ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import { type Attention, link } from '@/api';
  import { toneRule } from '@/lib/tones';

  /** `project`: the project the item is about, given where the item can link to its page — the workspace card. */
  const props = defineProps<{
    item: Attention;
    project?: string;
  }>();

  /** Knowledge waiting for the person is decided on the project's page, in its Knowledge view. */
  const decide = computed(() =>
    props.project !== undefined && (props.item.kind === 'knowledge-proposed' || props.item.kind === 'sources-changed')
      ? { path: `/projects/${encodeURIComponent(props.project)}`, query: { view: 'knowledge' } }
      : undefined,
  );
</script>

<template>
  <div :class="toneRule.attention">
    <p class="font-medium">
      {{ item.title
      }}<span v-if="item.subject.id" class="font-normal">
        — <code class="text-xs">{{ item.subject.id }}</code></span
      >
    </p>
    <p v-if="item.detail" class="text-[13px] text-muted-foreground">{{ item.detail }}</p>
    <p class="text-foreground">
      {{ item.todo }}
      <a
        v-if="link(item.url)"
        :href="link(item.url)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 underline underline-offset-2"
      >
        {{ item.kind.startsWith('pull-request') ? 'Open pull request' : 'Open link' }}<ExternalLink class="size-3" />
      </a>
      <RouterLink v-if="decide" :to="decide" class="underline underline-offset-2">Decide on the page</RouterLink>
    </p>
  </div>
</template>
