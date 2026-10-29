<script setup lang="ts">
  import { computed, onUnmounted, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { call, client, type Machine, onChange, type Project, readAgain } from '@/api';
  import ConnectForm from '@/components/ConnectForm.vue';
  import ProjectCard from '@/components/ProjectCard.vue';
  import ProjectList from '@/components/ProjectList.vue';
  import { Button } from '@/components/ui/button';
  import { Progress } from '@/components/ui/progress';
  import { lastWins } from '@/lib/last-wins';
  import { chosen, landed, type Listed, readOnes, readProgress } from '@/lib/projects';
  import { toneRule, toneText } from '@/lib/tones';
  import {
    landedLine,
    machineBusy,
    machineLine,
    mergeWaitOf,
    type PlanState,
    releaseOf,
    upgradeAllPlan,
    upgradeLine,
    upgradeOf,
  } from '@/lib/upgrade';

  const route = useRoute();
  const router = useRouter();
  /** The connected projects; on the first load each is listed before its read lands. */
  const projects = ref<Listed[]>();
  /** The projects read so far: what the upgrade lines and Upgrade all are worked out over. */
  const read = computed(() => readOnes(projects.value ?? []));
  const progress = computed(() => readProgress(projects.value ?? []));
  /** The project whose card is shown beside the list: `?project=` in the address, else the one `chosen` picks. */
  const shown = computed(() => chosen(projects.value ?? [], typeof route.query.project === 'string' ? route.query.project : undefined));
  const machine = ref<Machine>();
  const path = ref('');
  const refusal = ref<string>();
  const busy = ref(false);
  /** Each card's open upgrade panel, by project id, until the upgrade starts or the panel closes. */
  const plans = ref<Record<string, PlanState>>({});
  const upgrades = computed(() => projects.value && upgradeLine(read.value));
  /** Upgrade all's confirmation is open. */
  const confirmingAll = ref(false);
  const allRefusal = ref<string>();
  const release = computed(() => machine.value?.release ?? null);
  const allPlan = computed(() => upgradeAllPlan(read.value, release.value));
  /** No card starts an upgrade while a self-update or Upgrade all runs. */
  const held = computed(() => machineBusy(machine.value));
  // Upgrade all waits for every upgrade under way: they run one at a time; and for every read, or its list is short.
  const offerAll = computed(
    () => allPlan.value.projects.length > 0 && !held.value && !progress.value && !read.value.some((p) => p.upgrade?.state === 'running'),
  );

  const said = computed(() => machineLine(machine.value, read.value));
  /** Projects whose upgrade waits for its pull request: Check all merges is offered while any does. */
  const offerLandAll = computed(
    () => !held.value && read.value.some((p) => mergeWaitOf(p) !== undefined && p.upgrade?.state !== 'running'),
  );

  /** What the last Check all merges came to, until the next one. */
  const landedAll = ref<string>();
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

  /**
   * The first load: the connected ids at once, then each project as its own read lands, so one slow project holds no
   * other. The workspace read, for the machine's state, starts after them: it waits for the slowest project anyway, and
   * a browser opens six connections to a site, two of them held that long by the stream and the header's read.
   */
  async function first(): Promise<void> {
    const ids = (await (await call(() => client.api.projects.$get()))?.json())?.projects;
    if (ids && !projects.value) {
      projects.value = ids.map((id) => ({ id, state: 'reading' as const }));
      await Promise.allSettled(
        ids.map(async (id) => {
          const res = await call(() => client.api.projects[':id'].$get({ param: { id: encodeURIComponent(id) } }));
          if (res?.status !== 200) return;
          const { project } = await res.json(); // before the list is read: another read may land while this body is parsed
          projects.value = landed(projects.value ?? [], project);
        }),
      );
    }
    await load();
  }

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
    // The project just connected is the one shown, wherever it falls in the list.
    await router.replace({ query: { project: (await res.json()).project.id } });
    await load();
  }

  async function disconnect(id: string): Promise<void> {
    if (await call(() => client.api.projects[':id'].$delete({ param: { id: encodeURIComponent(id) } }))) await load();
  }

  /** The projects whose Read again is under way. */
  const reading = ref(new Set<string>());

  async function reread(id: string): Promise<void> {
    reading.value.add(id);
    const read = await readAgain(id);
    reading.value.delete(id);
    if (read) await load();
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

  /** Check merge on a card: Jig lands the upgrade if its pull request is merged; the card shows what came of it. */
  async function land(id: string): Promise<void> {
    const res = await call(() => upgradeApi.land.$post(param(id)));
    if (res && res.status !== 200) plans.value[id] = { state: 'refused', message: (await res.json()).error.message };
    await load();
  }

  /** Check all merges: every upgrade pull request in turn; each card shows its outcome, the line sums them up. */
  async function landAll(): Promise<void> {
    landedAll.value = undefined;
    const res = await call(() => client.api.upgrade['land-all'].$post());
    if (!res) return;
    const body = await res.json();
    landedAll.value = 'landed' in body ? landedLine(body.landed) : body.error.message;
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

  onUnmounted(onChange(() => void (projects.value === undefined ? first() : load())));
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4">
    <div class="flex items-center gap-3">
      <h1 class="font-semibold tracking-wider uppercase">Projects</h1>
      <div class="ml-auto flex items-center gap-2">
        <Button v-if="offerLandAll" variant="outline" size="xs" @click="landAll">Check all merges</Button>
        <Button v-if="offerAll && !confirmingAll" variant="outline" size="xs" @click="confirmingAll = true">Upgrade all…</Button>
      </div>
    </div>
    <p v-if="landedAll" :class="toneText.quiet" role="status">{{ landedAll }}</p>
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
    <div v-if="progress" class="flex flex-col gap-1" role="status">
      <p class="text-muted-foreground">Reading projects: {{ progress.read }} of {{ progress.of }}</p>
      <Progress :model-value="(progress.read / progress.of) * 100" aria-label="Projects read" />
    </div>
    <!-- One column on a narrow screen: the list above the card. -->
    <div v-if="projects?.length" class="flex flex-col gap-4 md:flex-row md:items-start">
      <ProjectList :projects="projects" :chosen="shown?.id" class="md:w-64 md:shrink-0" />
      <p v-if="shown?.state === 'reading'" class="min-w-0 flex-1 text-muted-foreground">Reading {{ shown.id }}…</p>
      <ProjectCard
        v-else-if="shown"
        :key="shown.id"
        :project="shown"
        :plan="plans[shown.id]"
        :held="held"
        :release="release"
        :reading="reading.has(shown.id)"
        class="min-w-0 flex-1"
        @disconnect="disconnect(shown.id)"
        @read-again="reread(shown.id)"
        @start="start(shown)"
        @self-update="selfUpdate(shown.id)"
        @upgrade="upgrade(shown.id)"
        @land="land(shown.id)"
        @close="delete plans[shown.id]"
        @dismiss="dismiss(shown.id)"
      />
    </div>
  </div>
</template>
