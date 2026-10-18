<script setup lang="ts">
import { computed } from 'vue';
import type { SpecItem } from '@/api';
import { itemWords } from '@/lib/specs';

/** `live`: the item's task is live, so its details can be opened. */
const props = defineProps<{ item: SpecItem; project: string; live: boolean }>();
const shown = computed(() => itemWords(props.item));
</script>

<template>
  <li class="flex items-baseline gap-2 px-3 py-1" :class="(item.checked || item.fog) && 'text-muted-foreground'">
    <span class="w-6 shrink-0" aria-hidden="true">{{ item.checked ? '[x]' : item.fog ? '~' : '[ ]' }}</span>
    <span class="sr-only">{{ item.checked ? 'Done:' : item.fog ? 'Fog:' : 'Open:' }}</span>
    <span class="min-w-0 flex-1" :class="item.fog && !item.checked && 'italic'">
      <template v-if="item.task">
        <RouterLink
          v-if="live"
          :to="`/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(item.task)}`"
          class="font-semibold text-foreground underline underline-offset-2"
          >{{ item.task }}</RouterLink
        ><span v-else class="font-semibold">{{ item.task }}</span> —
      </template>
      <template v-for="(run, i) in shown.words" :key="i"
        ><code v-if="run.code" class="bg-muted px-0.5">{{ run.text }}</code
        ><template v-else>{{ run.text }}</template></template
      >
      <span v-if="shown.after" class="text-muted-foreground">
        · after:
        <template v-for="(run, i) in shown.after" :key="i"
          ><code v-if="run.code" class="bg-muted px-0.5">{{ run.text }}</code
          ><template v-else>{{ run.text }}</template></template
        >
      </span>
    </span>
  </li>
</template>
