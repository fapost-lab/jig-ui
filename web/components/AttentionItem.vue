<script setup lang="ts">
import { ExternalLink } from '@lucide/vue';
import { type Attention, link } from '@/api';
import { toneRule } from '@/lib/tones';

defineProps<{ item: Attention }>();
</script>

<template>
  <div :class="toneRule.attention">
    <p class="font-semibold">
      {{ item.title }}<span v-if="item.subject.id" class="font-normal"> — {{ item.subject.id }}</span>
    </p>
    <p v-if="item.detail" class="text-muted-foreground">{{ item.detail }}</p>
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
    </p>
  </div>
</template>
