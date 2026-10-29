<script setup lang="ts">
  import { Check, ChevronsUpDown } from '@lucide/vue';
  import type { Project } from '@/api';
  import { Button } from '@/components/ui/button';
  import {
    Combobox,
    ComboboxAnchor,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxList,
    ComboboxTrigger,
  } from '@/components/ui/combobox';
  import ProjectMark from './ProjectMark.vue';

  /** `current` is the project whose page is open, if any. A project picked from the list is emitted; the slot goes at the right end. */
  defineProps<{
    projects: Project[];
    current?: string;
    version?: string;
  }>();

  const emit = defineEmits<{
    pick: [id: string];
  }>();
</script>

<template>
  <nav class="flex items-stretch border-b" aria-label="Projects">
    <RouterLink
      to="/"
      class="flex shrink-0 items-center border-r px-4 py-2.5 font-bold whitespace-nowrap"
      :class="current === undefined ? 'bg-foreground text-background' : 'hover:bg-muted'"
      :aria-current="current === undefined ? 'page' : undefined"
    >
      jig-ui://
    </RouterLink>
    <!-- Each item says it was picked, the open project too: Reka UI would unset the value on a second pick of it. -->
    <Combobox :model-value="current" class="flex min-w-0">
      <ComboboxAnchor as-child>
        <!-- Named for what it does: Reka UI names its trigger "Show popup". -->
        <ComboboxTrigger as-child :aria-label="current ? `${current}: go to another project` : 'Go to a project'">
          <Button variant="ghost" class="h-auto min-w-0 shrink rounded-none border-r px-4 py-2.5" :disabled="projects.length === 0">
            <span class="truncate">{{ current ?? 'Go to a project' }}</span>
            <ChevronsUpDown class="opacity-50" />
          </Button>
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxList align="start" class="min-w-64">
        <!-- Opens empty: Reka UI would fill it with the open project's id. -->
        <ComboboxInput :display-value="() => ''" placeholder="Find a project…" aria-label="Find a project" />
        <ComboboxEmpty>No project is called that.</ComboboxEmpty>
        <ComboboxGroup>
          <ComboboxItem v-for="project in projects" :key="project.id" :value="project.id" @select="emit('pick', project.id)">
            <span class="min-w-0 flex-1 truncate">{{ project.id }}</span>
            <ProjectMark :project="project" />
            <ComboboxItemIndicator><Check /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxList>
    </Combobox>
    <div class="ml-auto flex shrink-0 items-center gap-2 px-2">
      <span v-if="version" class="px-2 text-muted-foreground">v{{ version }}</span>
      <slot />
    </div>
  </nav>
</template>
