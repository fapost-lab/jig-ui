<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { Input } from '@/components/ui/input';
  import { type Listed, matching } from '@/lib/projects';
  import GroupPanel from './GroupPanel.vue';
  import ProjectMark from './ProjectMark.vue';

  /**
   * The workspace's projects on a panel of their own, read or still being read, each a link that shows its card beside the
   * list; `chosen` is the one shown, a white card on the panel's tint.
   */
  const props = defineProps<{
    projects: Listed[];
    chosen?: string;
  }>();

  const query = ref('');
  const shown = computed(() => matching(props.projects, query.value));
</script>

<template>
  <GroupPanel>
    <nav aria-label="Connected projects" class="flex flex-col gap-2 p-2">
      <Input v-model="query" type="search" placeholder="Find a project…" aria-label="Find a project" />
      <p v-if="shown.length === 0" class="px-2 text-muted-foreground">No project is called that.</p>
      <ul v-else class="flex flex-col">
        <li v-for="project in shown" :key="project.id">
          <RouterLink
            :to="{ path: '/', query: { project: project.id } }"
            class="flex items-center gap-2 rounded-md px-2 py-1.5"
            :class="project.id === chosen ? 'bg-card font-medium shadow-xs ring-1 ring-border' : 'hover:bg-card/60'"
            :aria-current="project.id === chosen ? 'page' : undefined"
          >
            <span class="min-w-0 flex-1 truncate">{{ project.id }}</span>
            <ProjectMark :project="project" />
          </RouterLink>
        </li>
      </ul>
    </nav>
  </GroupPanel>
</template>
