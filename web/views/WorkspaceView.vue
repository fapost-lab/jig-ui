<script setup lang="ts">
  import { onUnmounted, ref } from 'vue';
  import { call, client, onChange, type Project } from '@/api';
  import ConnectForm from '@/components/ConnectForm.vue';
  import ProjectCard from '@/components/ProjectCard.vue';
  import { lastWins } from '@/lib/last-wins';

  const projects = ref<Project[]>();
  const path = ref('');
  const refusal = ref<string>();
  const busy = ref(false);

  const load = lastWins(
    async () => (await (await call(() => client.api.workspace.$get()))?.json())?.projects,
    (read) => (projects.value = read),
  );

  async function connect(): Promise<void> {
    busy.value = true;
    refusal.value = undefined;
    const res = await call(() => client.api.projects.$post({ json: { path: path.value } }));
    busy.value = false;
    if (!res) return;
    if (res.status !== 200 && res.status !== 201) {
      refusal.value = (await res.json()).error.message;
      return;
    }
    path.value = '';
    await load();
  }

  async function disconnect(id: string): Promise<void> {
    if (await call(() => client.api.projects[':id'].$delete({ param: { id: encodeURIComponent(id) } }))) await load();
  }

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
