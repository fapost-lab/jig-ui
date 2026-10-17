<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, failure } from './api';
import Board from './Board.vue';
import TaskView from './Task.vue';
import Workspace from './Workspace.vue';

const version = ref<string>();
const hash = ref(location.hash);
const onHash = () => (hash.value = location.hash);

/** `#/projects/<id>` opens that project's board, `#/projects/<id>/tasks/<task>` one task; anything else is the workspace. */
const route = computed(() => {
  const match = /^#\/projects\/([^/]+)(?:\/tasks\/([^/]+))?$/.exec(hash.value);
  try {
    if (!match?.[1]) return undefined;
    return { project: decodeURIComponent(match[1]), task: match[2] && decodeURIComponent(match[2]) };
  } catch {
    return undefined; // a malformed escape: the workspace, not a crash
  }
});

onMounted(async () => {
  addEventListener('hashchange', onHash);
  const res = await api('/api/instance');
  if (res) version.value = ((await res.json()) as { version: string }).version;
});
onUnmounted(() => removeEventListener('hashchange', onHash));
</script>

<template>
  <main>
    <p v-if="failure?.kind === 'registry-unreadable'" role="alert">{{ failure.message }}</p>
    <p v-else-if="failure?.kind === 'session-ended'" role="alert">
      This page's session has ended. Run <code>npx @fapost/jig-ui</code> again to reopen it.
    </p>
    <p v-else-if="failure?.kind === 'not-running'" role="alert">Jig UI is not running. Start it with <code>npx @fapost/jig-ui</code>.</p>
    <template v-else>
      <h1>Jig UI {{ version }}</h1>
      <TaskView v-if="route?.task" :project="route.project" :task="route.task" :key="`${route.project}/${route.task}`" />
      <Board v-else-if="route" :id="route.project" :key="route.project" />
      <Workspace v-else />
    </template>
  </main>
</template>
