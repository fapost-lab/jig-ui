<script setup lang="ts">
import { describe, type Project } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AttentionItem from './AttentionItem.vue';

defineProps<{ project: Project }>();
defineEmits<{ disconnect: [] }>();
</script>

<template>
  <Card class="gap-3 px-4 py-4" :aria-labelledby="`project-${project.id}`" role="article">
    <div class="flex items-center gap-3">
      <h2 :id="`project-${project.id}`" class="shrink-0 text-sm font-bold">{{ project.id }}</h2>
      <span class="text-muted-foreground">{{ describe(project) }}</span>
      <Button variant="ghost" size="xs" class="ml-auto" @click="$emit('disconnect')">Disconnect</Button>
    </div>
    <template v-if="project.state === 'ready'">
      <p>
        {{ project.counts.active }} active · {{ project.counts.paused }} paused · {{ project.counts.ready }} ready ·
        <RouterLink :to="`/projects/${encodeURIComponent(project.id)}`" class="underline underline-offset-2">Open board</RouterLink>
      </p>
      <p v-if="project.attention.length === 0" class="text-muted-foreground">Nothing needs you here.</p>
      <ul v-else class="flex flex-col gap-3" :aria-label="`What needs you in ${project.id}`">
        <li v-for="(item, i) in project.attention" :key="i"><AttentionItem :item="item" /></li>
      </ul>
      <p v-if="project.housekeepingStale" class="text-muted-foreground">
        Pull request facts may be out of date: run <code>jig housekeeping</code> in the project.
      </p>
    </template>
  </Card>
</template>
