<script setup lang="ts">
import type { Task } from '@/api';
import { Badge } from '@/components/ui/badge';
import { toneText } from '@/lib/tones';
import { waits } from '@/lib/waits';

defineProps<{ task: Task; selected: boolean }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-muted/50"
    :class="selected && 'bg-muted'"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span class="w-40 shrink-0 truncate font-semibold" :title="task.id">{{ task.id }}</span>
    <Badge v-if="task.class" variant="outline" class="shrink-0">{{ task.class }}</Badge>
    <span v-else class="w-7 shrink-0" />
    <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ task.goal }}</span>
    <span v-if="waits(task)" class="shrink-0" :class="toneText[waits(task)!.tone]">{{ waits(task)!.text }}</span>
  </button>
</template>
