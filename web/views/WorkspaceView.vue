<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { api, type Failure, onChange, type Project } from '@/api';
import ConnectForm from '@/components/ConnectForm.vue';
import ProjectCard from '@/components/ProjectCard.vue';

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
  <div class="mx-auto flex max-w-4xl flex-col gap-4 p-4">
    <h1 class="font-semibold tracking-wider uppercase">Projects</h1>
    <p v-if="projects === undefined" class="text-muted-foreground">Reading projects…</p>
    <p v-else-if="projects.length === 0" class="text-muted-foreground">
      No projects yet. Paste the path of a project's main checkout below.
    </p>
    <ProjectCard v-for="project in projects" v-else :key="project.id" :project="project" @disconnect="disconnect(project.id)" />
    <ConnectForm v-model="path" :busy="busy" :refusal="refusal" class="mt-2 border-t pt-4" @connect="connect" />
  </div>
</template>
