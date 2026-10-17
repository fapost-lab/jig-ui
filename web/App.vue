<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, failure } from './api';
import Board from './Board.vue';
import Workspace from './Workspace.vue';

const version = ref<string>();
const hash = ref(location.hash);
const onHash = () => (hash.value = location.hash);

/** `#/projects/<id>` opens that project's board; anything else is the workspace. */
const boardId = computed(() => {
  const match = /^#\/projects\/([^/]+)$/.exec(hash.value);
  try {
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
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
      <Board v-if="boardId" :id="boardId" :key="boardId" />
      <Workspace v-else />
    </template>
  </main>
</template>
