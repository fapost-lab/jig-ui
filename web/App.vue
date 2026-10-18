<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import { useRoute } from 'vue-router';
  import { call, client, failure, onChange, type Project } from './api';
  import ProjectTabs from './components/ProjectTabs.vue';
  import ThemeToggle from './components/ThemeToggle.vue';
  import { lastWins } from './lib/last-wins';

  const route = useRoute();
  const version = ref<string>();
  const projects = ref<Project[]>([]);
  /** The project whose board or task is open; the workspace and the canvas have none. */
  const current = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined));

  const loadTabs = lastWins(
    async () => (await (await call(() => client.api.workspace.$get()))?.json())?.projects,
    (read) => (projects.value = read),
  );

  onMounted(async () => {
    version.value = (await (await call(() => client.api.instance.$get()))?.json())?.version;
  });

  onUnmounted(onChange(() => void loadTabs()));
</script>

<template>
  <div class="flex h-screen flex-col">
    <p v-if="failure?.kind === 'registry-unreadable'" role="alert" class="p-4 text-destructive">{{ failure.message }}</p>
    <p v-else-if="failure?.kind === 'session-ended'" role="alert" class="p-4">
      This page's session has ended. Run <code>npx @fapost/jig-ui</code> again to reopen it.
    </p>
    <p v-else-if="failure?.kind === 'internal'" role="alert" class="p-4 text-destructive">
      Jig UI hit an error it did not expect; its terminal says what. Reload the page to try again.
    </p>
    <p v-else-if="failure?.kind === 'not-running'" role="alert" class="p-4">
      Jig UI is not running. Start it with <code>npx @fapost/jig-ui</code>.
    </p>
    <template v-else>
      <ProjectTabs :projects="projects" :current="current" :version="version" class="shrink-0"><ThemeToggle /></ProjectTabs>
      <main class="min-h-0 flex-1 overflow-auto">
        <!-- Keyed on the address: a view reads once when it mounts, so a new address mounts it again. -->
        <RouterView :key="route.fullPath" />
      </main>
    </template>
  </div>
</template>
