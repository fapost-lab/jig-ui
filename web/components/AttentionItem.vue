<script setup lang="ts">
  import { ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import { type Attention, link } from '@/api';
  import { Button } from '@/components/ui/button';
  import { toneRule } from '@/lib/tones';
  import CloseConfirm from './CloseConfirm.vue';

  /**
   * `project`: the project the item is about, given where the item can link to its page — the workspace card.
   * `closable`: the item's task can be closed as done from here; `closing`: that close is on its way to Jig.
   * `refreshable`: a clone behind origin can be brought up from here; `refreshing`: that refresh is on its way to Jig.
   */
  const props = defineProps<{
    item: Attention;
    project?: string;
    closable?: boolean;
    closing?: boolean;
    refreshable?: boolean;
    refreshing?: boolean;
  }>();

  defineEmits<{
    /** Close task, confirmed: the view closes the item's task. */
    close: [];
    /** Refresh on a clone behind origin: the view runs `jig refresh` in the project. */
    refresh: [];
  }>();

  /** Knowledge waiting for the person is decided on the project's page, in its Knowledge view. */
  const decide = computed(() =>
    props.project !== undefined && (props.item.kind === 'knowledge-proposed' || props.item.kind === 'sources-changed')
      ? { path: `/projects/${encodeURIComponent(props.project)}`, query: { view: 'knowledge' } }
      : undefined,
  );

  /** The question before the task is closed is open: one press asks, the question's button closes. */
  const asking = defineModel<boolean>('asking', { default: false });
</script>

<template>
  <div :class="toneRule.attention" class="flex flex-col gap-2">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
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
      <Button
        v-if="refreshable && item.kind === 'base-behind-origin'"
        variant="outline"
        size="xs"
        class="shrink-0 text-foreground"
        :disabled="refreshing"
        @click="$emit('refresh')"
      >
        {{ refreshing ? 'Refreshing…' : 'Refresh' }}
      </Button>
      <Button
        v-if="closable && !asking"
        variant="outline"
        size="xs"
        class="shrink-0 text-foreground"
        :disabled="closing"
        :aria-label="`Close ${item.subject.id} as done`"
        @click="asking = true"
      >
        {{ closing ? 'Closing…' : 'Close task' }}
      </Button>
    </div>
    <CloseConfirm
      v-if="closable && asking && item.subject.id"
      :task="item.subject.id"
      @close="
        asking = false;
        $emit('close');
      "
      @cancel="asking = false"
    />
  </div>
</template>
