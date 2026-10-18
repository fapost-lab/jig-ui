<script setup lang="ts">
import { ExternalLink } from '@lucide/vue';
import type { ReadyDetails, Task } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toneRule } from '@/lib/tones';
import { waits } from '@/lib/waits';
import TaskBrief from './TaskBrief.vue';

defineProps<{ project: string; task: Task; open: boolean; details?: ReadyDetails | 'unavailable' }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <Card class="gap-2 px-3 py-3" :class="open && 'ring-foreground'">
    <button type="button" class="flex flex-col gap-2 text-left" :aria-expanded="open" @click="$emit('toggle')">
      <span class="flex w-full items-center gap-2">
        <span class="font-semibold break-all">{{ task.id }}</span>
        <Badge v-if="task.class" variant="outline" class="ml-auto">{{ task.class }}</Badge>
      </span>
      <span v-if="task.goal" class="text-muted-foreground" :class="!open && 'line-clamp-2'">{{ task.goal }}</span>
    </button>
    <p v-if="waits(task)" :class="toneRule[waits(task)!.tone]">
      {{ waits(task)!.text }}
      <a
        v-if="waits(task)!.url"
        :href="waits(task)!.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 underline underline-offset-2"
      >
        open<ExternalLink class="size-3" />
      </a>
    </p>
    <TaskBrief v-if="open" :project="project" :task="task.id" :details="details" class="mt-1 border-t pt-2" />
  </Card>
</template>
