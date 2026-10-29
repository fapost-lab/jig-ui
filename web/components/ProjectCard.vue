<script setup lang="ts">
  import { computed } from 'vue';
  import { ExternalLink } from '@lucide/vue';
  import { link, type Project } from '@/api';
  import { Button } from '@/components/ui/button';
  import { Card } from '@/components/ui/card';
  import { toneRule, toneText } from '@/lib/tones';
  import { mergeWaitOf, needsUpgrade, type PlanState, upgradeMark } from '@/lib/upgrade';
  import AttentionItem from './AttentionItem.vue';
  import StateLine from './StateLine.vue';
  import UpgradePanel from './UpgradePanel.vue';

  const props = defineProps<{
    project: Project;
    /** The upgrade panel before a run, when it is open. */
    plan?: PlanState;
    /** A self-update or Upgrade all is under way: no upgrade starts from the card meanwhile. */
    held?: boolean;
    /** The newest Jig release a connected project names: a project older than it has an upgrade to make too. */
    release?: string | null;
    /** Its Read again is under way. */
    reading?: boolean;
  }>();

  const mark = computed(() => upgradeMark(props.project));
  const merge = computed(() => mergeWaitOf(props.project));
  // Check merge while the upgrade waits and nothing runs on the card.
  const checkable = computed(() => merge.value !== undefined && props.project.upgrade?.state !== 'running' && !props.held);
  // Offered on a project with an upgrade to make — now, or after a self-update — and nothing about one on the card yet.
  const upgradable = computed(
    () => needsUpgrade(props.project, props.release ?? null) && !props.project.upgrade && !props.plan && !props.held,
  );

  defineEmits<{
    disconnect: [];
    readAgain: [];
    /** Upgrade on the card: the view asks Jig for the plan, or first to update this machine's Jig. */
    start: [];
    selfUpdate: [];
    upgrade: [];
    /** Check merge: bring the upgrade here once its pull request is merged. */
    land: [];
    close: [];
    dismiss: [];
  }>();
</script>

<template>
  <Card class="gap-3 px-4 py-4" :aria-labelledby="`project-${project.id}`" role="article">
    <div class="flex items-center gap-3">
      <h2 :id="`project-${project.id}`" class="shrink-0 text-sm font-bold">{{ project.id }}</h2>
      <StateLine :project="project" :reading="reading" class="text-muted-foreground" @read-again="$emit('readAgain')" />
      <span v-if="mark" :class="toneText.attention">{{ mark }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <Button v-if="upgradable" variant="outline" size="xs" @click="$emit('start')">Upgrade…</Button>
        <Button v-if="project.upgrade?.state !== 'running'" variant="ghost" size="xs" @click="$emit('disconnect')">Disconnect</Button>
      </div>
    </div>
    <div v-if="merge" :class="toneRule.attention" class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        {{ merge.state === 'open' ? 'The upgrade' : 'The merged upgrade' }}{{ merge.to ? ` to ${merge.to}` : '' }}
        {{ merge.state === 'open' ? 'waits for its pull request to be merged.' : 'is not here yet.' }}
      </span>
      <a
        v-if="link(merge.url)"
        :href="link(merge.url)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 underline underline-offset-2"
      >
        Open pull request<ExternalLink class="size-3" />
      </a>
      <Button v-if="checkable" variant="outline" size="xs" @click="$emit('land')">Check merge</Button>
    </div>
    <UpgradePanel
      v-if="project.upgrade || plan"
      :project="project.id"
      :run="project.upgrade"
      :plan="plan"
      @self-update="$emit('selfUpdate')"
      @upgrade="$emit('upgrade')"
      @close="$emit('close')"
      @dismiss="$emit('dismiss')"
    />
    <template v-if="project.state === 'ready'">
      <p>
        {{ project.counts.active }} active · {{ project.counts.paused }} paused · {{ project.counts.ready }} ready ·
        <RouterLink :to="`/projects/${encodeURIComponent(project.id)}`" class="underline underline-offset-2">Open board</RouterLink>
      </p>
      <p v-if="project.attention.length === 0" class="text-muted-foreground">Nothing needs you here.</p>
      <ul v-else class="flex flex-col gap-3" :aria-label="`What needs you in ${project.id}`">
        <li v-for="(item, i) in project.attention" :key="i"><AttentionItem :item="item" /></li>
      </ul>
      <p v-if="project.housekeepingStale" class="text-muted-foreground">
        Pull request facts may be out of date: run <code>jig housekeeping</code> in the project.
      </p>
    </template>
  </Card>
</template>
