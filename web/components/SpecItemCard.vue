<script setup lang="ts">
  import { computed } from 'vue';
  import type { SpecItem } from '@/api';
  import { itemTitle, itemWord, shownFog, type Words } from '@/lib/specs';

  /**
   * A roadmap item as a card of its phase's lane: a dot and its title, a line of what it names and where it stands, and
   * the rest of its words once opened. `live`: its task is live, so its details can be opened; `waiting`: an edit waiting
   * on the spec's branch changed it.
   */
  const props = defineProps<{
    item: SpecItem;
    project: string;
    standing: {
      label: string | null;
      dot: string;
    };
    live: boolean;
    open: boolean;
    waiting?: boolean;
  }>();

  defineEmits<{
    toggle: [];
  }>();

  const shown = computed(() => itemTitle(props.item));
  const plain = (words: Words) => words.map((run) => run.text).join('');
</script>

<template>
  <li
    class="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5 text-card-foreground shadow-xs"
    :class="item.checked && 'opacity-60'"
  >
    <div class="flex items-start gap-1">
      <button type="button" class="flex min-w-0 flex-1 items-start gap-2 text-left" :aria-expanded="open" @click="$emit('toggle')">
        <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="standing.dot" aria-hidden="true" />
        <span class="sr-only">{{ itemWord(item) }}:</span>
        <span class="min-w-0 font-medium" :class="[!open && 'line-clamp-2', shownFog(item) && 'italic']">
          <template v-for="(run, i) in shown.title" :key="i"
            ><code v-if="run.code" class="rounded-sm bg-muted px-1 text-xs">{{ run.text }}</code
            ><template v-else>{{ run.text }}</template></template
          >
        </span>
      </button>
      <!-- The item's roadmap menu, from the page that writes it. -->
      <slot name="menu" />
    </div>
    <p
      v-if="item.task || standing.label || shown.after || waiting"
      class="flex flex-wrap gap-x-3 gap-y-0.5 pl-4 text-xs text-muted-foreground"
    >
      <template v-if="item.task">
        <RouterLink
          v-if="live"
          :to="`/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(item.task)}`"
          class="font-mono text-foreground underline underline-offset-2"
          >{{ item.task }}</RouterLink
        ><span v-else class="font-mono">{{ item.task }}</span>
      </template>
      <span v-if="standing.label">{{ standing.label }}</span>
      <span v-if="shown.after" class="max-w-full" :class="!open && 'truncate'" :title="plain(shown.after)"
        >after: {{ plain(shown.after) }}</span
      >
      <span v-if="waiting">waiting</span>
    </p>
    <p v-if="open && shown.rest.length > 0" class="border-t pt-2 pl-4 text-[13px]/relaxed text-muted-foreground">
      <template v-for="(run, i) in shown.rest" :key="i"
        ><code v-if="run.code" class="rounded-sm bg-muted px-1 text-xs">{{ run.text }}</code
        ><template v-else>{{ run.text }}</template></template
      >
    </p>
  </li>
</template>
