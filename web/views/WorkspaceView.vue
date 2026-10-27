<script setup lang="ts">
  import { computed, onUnmounted, ref } from 'vue';
  import { call, client, onChange, type Project } from '@/api';
  import ConnectForm from '@/components/ConnectForm.vue';
  import ProjectCard from '@/components/ProjectCard.vue';
  import { lastWins } from '@/lib/last-wins';
  import { toneText } from '@/lib/tones';
  import { type PlanState, upgradeLine } from '@/lib/upgrade';

  const projects = ref<Project[]>();
  const path = ref('');
  const refusal = ref<string>();
  const busy = ref(false);
  /** Each card's open upgrade panel, by project id, until the upgrade starts or the panel closes. */
  const plans = ref<Record<string, PlanState>>({});
  const upgrades = computed(() => projects.value && upgradeLine(projects.value));

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

  const upgradeApi = client.api.projects[':id'].upgrade;
  const param = (id: string) => ({ param: { id: encodeURIComponent(id) } });

  /** Opens the card's upgrade panel with Jig's dry run of the upgrade. */
  async function plan(id: string): Promise<void> {
    plans.value[id] = { state: 'reading' };
    const res = await call(() => upgradeApi.plan.$post(param(id)));
    if (!res) return void delete plans.value[id];
    const body = await res.json();
    if ('plan' in body) plans.value[id] = { state: 'planned', plan: body.plan };
    else if ('error' in body) plans.value[id] = { state: 'refused', message: body.error.message };
    else {
      delete plans.value[id]; // the project cannot be read now: its card says why
      await load();
    }
  }

  /** Starts the upgrade; the card follows it through the workspace, which the change stream reads again. */
  async function upgrade(id: string): Promise<void> {
    const res = await call(() => upgradeApi.$post(param(id)));
    if (!res) return;
    const body = await res.json();
    if ('error' in body) plans.value[id] = { state: 'refused', message: body.error.message };
    else delete plans.value[id];
    await load();
  }

  async function dismiss(id: string): Promise<void> {
    if (await call(() => upgradeApi.$delete(param(id)))) await load();
  }

  onUnmounted(onChange(() => void load()));
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-4 p-4">
    <h1 class="font-semibold tracking-wider uppercase">Projects</h1>
    <p v-if="upgrades" :class="toneText.attention">{{ upgrades }}</p>
    <p v-if="projects === undefined" class="text-muted-foreground">Reading projects…</p>
    <p v-else-if="projects.length === 0" class="text-muted-foreground">
      No projects yet. Paste the path of a project's main checkout below.
    </p>
    <ProjectCard
      v-for="project in projects"
      v-else
      :key="project.id"
      :project="project"
      :plan="plans[project.id]"
      @disconnect="disconnect(project.id)"
      @plan="plan(project.id)"
      @upgrade="upgrade(project.id)"
      @close="delete plans[project.id]"
      @dismiss="dismiss(project.id)"
    />
    <ConnectForm v-model="path" :busy="busy" :refusal="refusal" class="mt-2 border-t pt-4" @connect="connect" />
  </div>
</template>
