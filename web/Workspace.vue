<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { api, describe, type Failure, link, onChange, type Project } from './api';

const projects = ref<Project[]>();
const path = ref('');
const refusal = ref<string>();
const busy = ref(false);

let latest = 0;

async function load(): Promise<void> {
  const mine = ++latest;
  const res = await api('/api/workspace');
  const read = res && ((await res.json()) as { projects: Project[] }).projects;
  // A newer load may have started meanwhile: an older answer must not overwrite it.
  if (read && mine === latest) projects.value = read;
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

onMounted(load);
onUnmounted(onChange(() => void load()));
</script>

<template>
  <p v-if="projects === undefined">Reading projects…</p>
  <p v-else-if="projects.length === 0">No projects yet. Paste the path of a project's main checkout below.</p>
  <article v-for="project in projects" v-else :key="project.id" :aria-labelledby="`project-${project.id}`">
    <h2 :id="`project-${project.id}`">{{ project.id }}</h2>
    <p>{{ describe(project) }}</p>
    <template v-if="project.state === 'ready'">
      <p>
        {{ project.counts.active }} active · {{ project.counts.paused }} paused · {{ project.counts.ready }} ready ·
        <a :href="`#/projects/${encodeURIComponent(project.id)}`">Open board</a>
      </p>
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
