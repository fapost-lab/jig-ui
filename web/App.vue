<script setup lang="ts">
import { onMounted, ref } from 'vue';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; version: string }
  | { kind: 'session-ended' }
  | { kind: 'not-running' };

const state = ref<State>({ kind: 'loading' });

onMounted(async () => {
  try {
    const res = await fetch('/api/instance');
    if (res.status === 401) {
      state.value = { kind: 'session-ended' };
      return;
    }
    const { version } = (await res.json()) as { version: string };
    state.value = { kind: 'ready', version };
  } catch {
    state.value = { kind: 'not-running' };
  }
});
</script>

<template>
  <main>
    <p v-if="state.kind === 'loading'">Connecting…</p>
    <template v-else-if="state.kind === 'ready'">
      <h1>Jig UI {{ state.version }}</h1>
      <p>Connecting projects is not built yet.</p>
    </template>
    <p v-else-if="state.kind === 'session-ended'" role="alert">
      This page's session has ended. Run <code>npx @fapost/jig-ui</code> again to reopen it.
    </p>
    <p v-else role="alert">Jig UI is not running. Start it with <code>npx @fapost/jig-ui</code>.</p>
  </main>
</template>
