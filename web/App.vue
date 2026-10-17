<script setup lang="ts">
import { onMounted, ref } from 'vue';

type Project =
  | { id: string; state: 'ready'; jigVersion: string }
  | { id: string; state: 'unsupported'; jigVersion: string | null; minimum: string }
  | { id: string; state: 'unavailable'; reason: 'missing' | 'no-jig' };

type Failure = { error: { code: string; message: string } };

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; version: string; projects: Project[] }
  | { kind: 'registry-unreadable'; message: string }
  | { kind: 'session-ended' }
  | { kind: 'not-running' };

const state = ref<State>({ kind: 'loading' });
const path = ref('');
const refusal = ref<string>();
const busy = ref(false);

/** A fetch that turns the end of the session or of the server into the page's state. */
async function api(input: string, init?: RequestInit): Promise<Response | undefined> {
  try {
    const res = await fetch(input, init);
    if (res.status === 401) state.value = { kind: 'session-ended' };
    else if (res.status === 500) {
      const { error } = (await res.json()) as Failure;
      state.value = { kind: 'registry-unreadable', message: error.message };
    } else return res;
  } catch {
    state.value = { kind: 'not-running' };
  }
  return undefined;
}

async function load(): Promise<void> {
  const [instance, list] = await Promise.all([api('/api/instance'), api('/api/projects')]);
  if (!instance || !list) return;
  const { version } = (await instance.json()) as { version: string };
  const { projects } = (await list.json()) as { projects: Project[] };
  state.value = { kind: 'ready', version, projects };
}

async function connect(): Promise<void> {
  busy.value = true;
  refusal.value = undefined;
  const res = await api('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path.value }),
  });
  busy.value = false;
  if (!res) return;
  if (!res.ok) {
    refusal.value = ((await res.json()) as Failure).error.message;
    return;
  }
  path.value = '';
  await load();
}

async function disconnect(id: string): Promise<void> {
  if (await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })) await load();
}

function describe(project: Project): string {
  if (project.state === 'ready') return `Jig ${project.jigVersion}`;
  if (project.state === 'unsupported') {
    const found = project.jigVersion ? `Jig ${project.jigVersion}` : 'A Jig of unknown version';
    return `${found} — Jig UI needs ${project.minimum} or later. Run jig upgrade in the project.`;
  }
  return project.reason === 'missing' ? 'The project directory is not there any more.' : 'There is no Jig in the project any more.';
}

onMounted(load);
</script>

<template>
  <main>
    <p v-if="state.kind === 'loading'">Connecting…</p>
    <template v-else-if="state.kind === 'ready'">
      <h1>Jig UI {{ state.version }}</h1>

      <p v-if="state.projects.length === 0">No projects yet. Paste the path of a project's main checkout below.</p>
      <ul v-else>
        <li v-for="project in state.projects" :key="project.id">
          <strong>{{ project.id }}</strong>
          <span>{{ describe(project) }}</span>
          <button type="button" @click="disconnect(project.id)">Disconnect</button>
        </li>
      </ul>

      <form @submit.prevent="connect">
        <label for="project-path">Project path</label>
        <input id="project-path" v-model="path" required placeholder="/path/to/project" :aria-invalid="refusal !== undefined" aria-describedby="connect-refusal" />
        <button type="submit" :disabled="busy">{{ busy ? 'Connecting…' : 'Connect' }}</button>
        <p v-if="refusal" id="connect-refusal" role="alert">{{ refusal }}</p>
      </form>
    </template>
    <p v-else-if="state.kind === 'registry-unreadable'" role="alert">{{ state.message }}</p>
    <p v-else-if="state.kind === 'session-ended'" role="alert">
      This page's session has ended. Run <code>npx @fapost/jig-ui</code> again to reopen it.
    </p>
    <p v-else role="alert">Jig UI is not running. Start it with <code>npx @fapost/jig-ui</code>.</p>
  </main>
</template>
