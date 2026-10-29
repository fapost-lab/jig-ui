<script setup lang="ts">
  import { computed, onUnmounted, ref, watch } from 'vue';
  import { call, client, type Machine, onChange, type Project } from '@/api';
  import ConnectForm from '@/components/ConnectForm.vue';
  import ProjectCard from '@/components/ProjectCard.vue';
  import { Button } from '@/components/ui/button';
  import { lastWins } from '@/lib/last-wins';
  import { toneRule, toneText } from '@/lib/tones';
  import { machineBusy, machineLine, type PlanState, releaseOf, upgradeAllPlan, upgradeLine, upgradeOf } from '@/lib/upgrade';

  const projects = ref<Project[]>();
  const machine = ref<Machine>();
  const path = ref('');
  const refusal = ref<string>();
  const busy = ref(false);
  /** Each card's open upgrade panel, by project id, until the upgrade starts or the panel closes. */
  const plans = ref<Record<string, PlanState>>({});
  const upgrades = computed(() => projects.value && upgradeLine(projects.value));
  /** Upgrade all's confirmation is open. */
  const confirmingAll = ref(false);
  const allRefusal = ref<string>();
  const release = computed(() => machine.value?.release ?? null);
  const allPlan = computed(() => upgradeAllPlan(projects.value ?? [], release.value));
  /** No card starts an upgrade while a self-update or Upgrade all runs. */
  const held = computed(() => machineBusy(machine.value));
  // Upgrade all waits for every upgrade under way: they run one at a time.
  const offerAll = computed(
    () => allPlan.value.projects.length > 0 && !held.value && !(projects.value ?? []).some((p) => p.upgrade?.state === 'running'),
  );

  const said = computed(() => machineLine(machine.value));
  // A confirmation or a refusal of Upgrade all belongs to the moment it was asked: a run from another tab ends both.
  watch(offerAll, (offered) => {
    if (!offered) confirmingAll.value = false;
    else allRefusal.value = undefined;
  });

  const load = lastWins(
    async () => (await (await call(() => client.api.workspace.$get()))?.json()) ?? undefined,
    (read) => {
      if (!read) return;
      projects.value = read.projects;
      machine.value = read.machine;
    },
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

  /** Upgrade on a card: Jig's plan when the machine's Jig is ahead, or first the question to update it when a release is out. */
  function start(project: Project): void {
    const out = releaseOf(project, release.value);
    if (upgradeOf(project) === undefined && out !== undefined) plans.value[project.id] = { state: 'confirm-self-update', release: out };
    else void plan(project.id);
  }

  /** Updates this machine's Jig, as the card's panel asked, then asks Jig for the project's plan. */
  async function selfUpdate(id: string): Promise<void> {
    plans.value[id] = { state: 'self-updating' };
    const res = await call(() => client.api['self-update'].$post());
    if (!res) return void delete plans.value[id];
    if (res.status === 200) {
      await load();
      return plan(id);
    }
    const { error } = (await res.json()) as {
      error: {
        message: string;
        reasons?: string[];
      };
    };

    plans.value[id] = { state: 'refused', message: [error.message, ...(error.reasons ?? [])].join(' ') };
    await load();
  }

  /** Starts Upgrade all; the page follows it through the workspace, as it follows each project's upgrade. */
  async function upgradeAll(): Promise<void> {
    confirmingAll.value = false;
    allRefusal.value = undefined;
    plans.value = {}; // an open plan would offer an upgrade Upgrade all is about to run
    const res = await call(() => client.api['upgrade-all'].$post());
    if (!res) return;
    if (res.status === 409) allRefusal.value = (await res.json()).error.message;
    await load();
  }

  async function dismissAll(): Promise<void> {
    if (await call(() => client.api['upgrade-all'].$delete())) await load();
  }

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
    <div class="flex items-center gap-3">
      <h1 class="font-semibold tracking-wider uppercase">Projects</h1>
      <Button v-if="offerAll && !confirmingAll" variant="outline" size="xs" class="ml-auto" @click="confirmingAll = true">
        Upgrade all…
      </Button>
    </div>
    <p v-if="upgrades" :class="toneText.attention">{{ upgrades }}</p>
    <section v-if="confirmingAll && offerAll" aria-label="Upgrade all" :class="toneRule.attention" class="flex flex-col gap-2">
      <p v-if="allPlan.selfUpdate">
        A newer Jig is out. Jig on this machine is updated first (<code>jig self-update</code>, for every project on this machine), then the
        projects are upgraded one at a time:
      </p>
      <p v-else>The projects are upgraded one at a time:</p>
      <ul class="list-disc pl-5 text-foreground">
        <li v-for="id in allPlan.projects" :key="id">{{ id }}</li>
      </ul>
      <p>
        In each Jig works in the project's main checkout: it cuts a branch, commits, pushes, and opens a pull request or merges as far as
        the project's agent.git allows. A project Jig cannot read now is left alone.
      </p>
      <div class="flex gap-2">
        <Button size="xs" @click="upgradeAll">{{ allPlan.selfUpdate ? 'Update Jig and upgrade all' : 'Upgrade all' }}</Button>
        <Button variant="ghost" size="xs" @click="confirmingAll = false">Cancel</Button>
      </div>
    </section>
    <p v-if="allRefusal" :class="toneRule.bad">{{ allRefusal }}</p>
    <div v-if="said" :class="toneRule[said.tone]" class="flex flex-col gap-1" role="status">
      <p>{{ said.text }}</p>
      <ul v-if="said.reasons.length" class="list-disc pl-5 text-foreground">
        <li v-for="(reason, i) in said.reasons" :key="i">{{ reason }}</li>
      </ul>
      <Button v-if="said.ended" variant="ghost" size="xs" class="self-start" @click="dismissAll">Dismiss</Button>
    </div>
    <ConnectForm v-model="path" :busy="busy" :refusal="refusal" class="border-b pb-4" @connect="connect" />
    <p v-if="projects === undefined" class="text-muted-foreground">Reading projects…</p>
    <p v-else-if="projects.length === 0" class="text-muted-foreground">
      No projects yet. Paste the path of a project's main checkout above.
    </p>
    <ProjectCard
      v-for="project in projects"
      v-else
      :key="project.id"
      :project="project"
      :plan="plans[project.id]"
      :held="held"
      :release="release"
      @disconnect="disconnect(project.id)"
      @start="start(project)"
      @self-update="selfUpdate(project.id)"
      @upgrade="upgrade(project.id)"
      @close="delete plans[project.id]"
      @dismiss="dismiss(project.id)"
    />
  </div>
</template>
