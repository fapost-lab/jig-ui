<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { call, client, failure, onChange, type Project } from './api';
  import ProjectSwitcher from './components/ProjectSwitcher.vue';
  import ThemeToggle from './components/ThemeToggle.vue';
  import { lastWins } from './lib/last-wins';
  import { byName } from './lib/projects';

  const route = useRoute();
  const router = useRouter();
  const version = ref<string>();
  const projects = ref<Project[]>([]);
  /** The project whose board or task is open; the workspace and the canvas have none. */
  const current = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined));

  const loadProjects = lastWins(
    async () => (await (await call(() => client.api.workspace.$get()))?.json())?.projects,
    (read) => (projects.value = byName(read)),
  );

  onMounted(async () => {
    version.value = (await (await call(() => client.api.instance.$get()))?.json())?.version;
  });

  onUnmounted(onChange(() => void loadProjects()));
</script>

<template>
  <div class="flex h-screen flex-col">
    <p v-if="failure?.kind === 'registry-unreadable'" role="alert" class="p-4 text-destructive">{{ failure.message }}</p>
    <p v-else-if="failure?.kind === 'session-ended'" role="alert" class="p-4">
      This page's session has ended. Run <code>jig-ui open</code>, or <code>npx @fapost/jig-ui</code>, to reopen it.
    </p>
    <p v-else-if="failure?.kind === 'internal'" role="alert" class="p-4 text-destructive">
      Jig UI hit an error it did not expect; its terminal says what. Reload the page to try again.
    </p>
    <p v-else-if="failure?.kind === 'not-running'" role="alert" class="p-4">
      Jig UI is not running. Start it with <code>npx @fapost/jig-ui</code>, or <code>jig-ui</code>.
    </p>
    <template v-else>
      <ProjectSwitcher
        :projects="projects"
        :current="current"
        :version="version"
        class="shrink-0"
        @pick="(id) => router.push(`/projects/${encodeURIComponent(id)}`)"
        ><ThemeToggle
      /></ProjectSwitcher>
      <main class="min-h-0 flex-1 overflow-auto">
        <!-- Keyed on the path: a view reads once when it mounts, so a new path mounts it again; the workspace's
             `?project=` only picks the card it shows from what it read. -->
        <RouterView :key="route.path" />
      </main>
    </template>
  </div>
</template>
