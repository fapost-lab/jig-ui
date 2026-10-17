<script setup lang="ts">
import { onMounted, ref } from 'vue';

type Attention = {
  kind: string;
  subject: { type: string; id: string | null };
  title: string;
  detail: string | null;
  todo: string;
  url: string | null;
};

type Project =
  | {
      id: string;
      state: 'ready';
      jigVersion: string;
      counts: { active: number; paused: number; ready: number };
      attention: Attention[];
      housekeepingStale: boolean;
    }
  | { id: string; state: 'unsupported'; jigVersion: string | null; minimum: string }
  | { id: string; state: 'incompatible'; jigVersion: string }
  | { id: string; state: 'unavailable'; reason: 'missing' | 'no-jig' }
  | { id: string; state: 'unreadable'; code: string };

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
  const [instance, list] = await Promise.all([api('/api/instance'), api('/api/workspace')]);
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
  if (project.state === 'incompatible') {
    return `Jig ${project.jigVersion} answers in a form this Jig UI does not read. Update Jig UI: npx @fapost/jig-ui@latest.`;
  }
  if (project.state === 'unreadable') return `Jig could not be read (${project.code}). It is tried again on the next load.`;
  return project.reason === 'missing' ? 'The project directory is not there any more.' : 'There is no Jig in the project any more.';
}

/** A link only for a web address: the url comes from the project's files. */
const link = (url: string | null): string | undefined => (url?.startsWith('https://') ? url : undefined);

onMounted(load);
</script>

<template>
  <main>
    <p v-if="state.kind === 'loading'">Connecting…</p>
    <template v-else-if="state.kind === 'ready'">
      <h1>Jig UI {{ state.version }}</h1>

      <p v-if="state.projects.length === 0">No projects yet. Paste the path of a project's main checkout below.</p>
      <article v-for="project in state.projects" v-else :key="project.id" :aria-labelledby="`project-${project.id}`">
        <h2 :id="`project-${project.id}`">{{ project.id }}</h2>
        <p>{{ describe(project) }}</p>
        <template v-if="project.state === 'ready'">
          <p>{{ project.counts.active }} active · {{ project.counts.paused }} paused · {{ project.counts.ready }} ready</p>
          <p v-if="project.attention.length === 0">Nothing needs you here.</p>
          <ul v-else :aria-label="`What needs you in ${project.id}`">
            <li v-for="(item, i) in project.attention" :key="i">
              <strong>{{ item.title }}</strong>
              <span v-if="item.subject.id"> — {{ item.subject.id }}</span>
              <span v-if="item.detail"> ({{ item.detail }})</span>
              <br />
              {{ item.todo }}
              <a v-if="link(item.url)" :href="link(item.url)" target="_blank" rel="noopener noreferrer">{{
                item.kind.startsWith('pull-request') ? 'Open pull request' : 'Open link'
              }}</a>
            </li>
          </ul>
          <p v-if="project.housekeepingStale">
            Pull request facts may be out of date: run <code>jig housekeeping</code> in the project.
          </p>
        </template>
        <button type="button" @click="disconnect(project.id)">Disconnect</button>
      </article>

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
