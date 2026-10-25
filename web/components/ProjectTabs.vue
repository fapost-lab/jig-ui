<script setup lang="ts">
  import type { Project } from '@/api';
  import { attentionFill, badFill } from '@/lib/tones';

  /** `current` is the project whose page is open, if any; the count on a tab is what needs the person there. The slot goes at the right end. */
  defineProps<{
    projects: Project[];
    current?: string;
    version?: string;
  }>();
</script>

<template>
  <nav class="flex items-stretch overflow-x-auto border-b" aria-label="Projects">
    <RouterLink
      to="/"
      class="flex shrink-0 items-center border-r px-4 py-2.5 font-bold whitespace-nowrap"
      :class="current === undefined ? 'bg-foreground text-background' : 'hover:bg-muted'"
      :aria-current="current === undefined ? 'page' : undefined"
    >
      jig-ui://
    </RouterLink>
    <RouterLink
      v-for="project in projects"
      :key="project.id"
      :to="`/projects/${encodeURIComponent(project.id)}`"
      class="flex shrink-0 items-center gap-2 border-r px-4 py-2.5 whitespace-nowrap"
      :class="project.id === current ? 'bg-foreground text-background' : 'hover:bg-muted'"
      :aria-current="project.id === current ? 'page' : undefined"
    >
      {{ project.id }}
      <span
        v-if="project.state === 'ready' && project.attention.length > 0"
        :class="attentionFill"
        class="px-1"
        :aria-label="`${project.attention.length} need you`"
      >
        {{ project.attention.length }}
      </span>
      <span v-else-if="project.state !== 'ready'" :class="badFill" class="px-1" aria-label="not readable">!</span>
    </RouterLink>
    <div class="ml-auto flex shrink-0 items-center gap-2 px-2">
      <span v-if="version" class="px-2 text-muted-foreground">v{{ version }}</span>
      <slot />
    </div>
  </nav>
</template>
