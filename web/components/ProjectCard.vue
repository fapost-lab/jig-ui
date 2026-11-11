<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { Ellipsis, ExternalLink, Settings, Unplug } from '@lucide/vue';
  import { link, type Project } from '@/api';
  import { Button } from '@/components/ui/button';
  import { Card } from '@/components/ui/card';
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
  import { type ClosingState, closableBy, type HousekeepingState } from '@/lib/projects';
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
    /** Housekeeping from the card: under way, or what came of it until dismissed. */
    housekeeping?: HousekeepingState;
    /** A task closed from one of the card's items: under way, or what Jig refused until dismissed. */
    closing?: ClosingState;
  }>();

  const board = computed(() => `/projects/${encodeURIComponent(props.project.id)}`);
  /** The task whose close question is open: held by its id, so a list that shifts under it never moves it to another. */
  const asking = ref<string>();
  const mark = computed(() => upgradeMark(props.project));
  const merge = computed(() => mergeWaitOf(props.project));
  // Check merge while the upgrade waits and nothing runs on the card.
  const checkable = computed(() => merge.value !== undefined && props.project.upgrade?.state !== 'running' && !props.held);
  // Offered on a project with an upgrade to make — now, or after a self-update — and nothing about one on the card yet.
  const upgradable = computed(
    () => needsUpgrade(props.project, props.release ?? null) && !props.project.upgrade && !props.plan && !props.held,
  );

  defineEmits<{
    /** Settings… in the ⋯ menu: the view opens the dialog and reads them. */
    settings: [];
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
    /** Housekeeping on the card: the view runs `jig housekeeping` in the project. */
    housekeeping: [];
    dismissHousekeeping: [];
    /** Close task on a merged task's item, confirmed: the view closes it as done. */
    closeTask: [task: string];
    dismissClose: [];
  }>();
</script>

<template>
  <Card class="gap-3 px-5 py-4" :aria-labelledby="`project-${project.id}`" role="article">
    <div class="flex items-center gap-3">
      <h2 :id="`project-${project.id}`" class="shrink-0 text-base font-semibold">
        <RouterLink v-if="project.state === 'ready'" :to="board" class="underline-offset-2 hover:underline">{{ project.id }}</RouterLink>
        <template v-else>{{ project.id }}</template>
      </h2>
      <StateLine :project="project" :reading="reading" class="text-[13px] text-muted-foreground" @read-again="$emit('readAgain')" />
      <span v-if="mark" class="text-[13px]" :class="toneText.attention">{{ mark }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <Button v-if="upgradable" variant="outline" size="xs" @click="$emit('start')">Upgrade…</Button>
        <Button
          v-if="project.state === 'ready' && project.upgrade?.state !== 'running'"
          variant="outline"
          size="xs"
          :disabled="housekeeping?.state === 'running'"
          @click="$emit('housekeeping')"
          >{{ housekeeping?.state === 'running' ? 'Housekeeping…' : 'Housekeeping' }}</Button
        >
        <Button v-if="project.state === 'ready'" variant="outline" size="xs" as-child><RouterLink :to="board">Board</RouterLink></Button>
        <DropdownMenu v-if="project.upgrade?.state !== 'running'">
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-xs" :aria-label="`More for ${project.id}`"><Ellipsis /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-36">
            <DropdownMenuItem v-if="project.state === 'ready'" @select="$emit('settings')"><Settings />Settings…</DropdownMenuItem>
            <DropdownMenuItem @select="$emit('disconnect')"><Unplug />Disconnect</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      <p>{{ project.counts.active }} active · {{ project.counts.paused }} paused · {{ project.counts.ready }} ready</p>
      <p v-if="project.attention.length === 0" class="text-[13px] text-muted-foreground">Nothing needs you here.</p>
      <ul v-else class="flex flex-col gap-3" :aria-label="`What needs you in ${project.id}`">
        <li v-for="(item, i) in project.attention" :key="i">
          <AttentionItem
            :item="item"
            :project="project.id"
            :closable="closableBy(project, item) !== undefined"
            :closing="closing?.state === 'running' && closing.task === item.subject.id"
            :asking="asking !== undefined && asking === item.subject.id"
            @update:asking="(open) => (asking = open ? (item.subject.id ?? undefined) : undefined)"
            @close="item.subject.id && $emit('closeTask', item.subject.id)"
          />
        </li>
      </ul>
      <div v-if="closing?.state === 'refused'" :class="toneRule.bad" class="flex flex-col gap-1 text-[13px]">
        <p>{{ closing.message }}</p>
        <Button variant="ghost" size="xs" class="self-start" @click="$emit('dismissClose')">Dismiss</Button>
      </div>
      <p v-if="project.housekeepingStale" class="text-[13px] text-muted-foreground">
        Pull request facts may be out of date until Housekeeping runs.
      </p>
    </template>
    <section v-if="housekeeping" :aria-label="`Housekeeping in ${project.id}`" class="text-[13px]">
      <p v-if="housekeeping.state === 'running'" :class="toneRule.quiet">
        Running <code>jig housekeeping</code>… It fetches and asks the forge; a dialog for your git credentials may wait for you.
      </p>
      <div v-else-if="housekeeping.state === 'done'" :class="toneRule.quiet" class="flex flex-col gap-1">
        <p class="whitespace-pre-wrap">{{ housekeeping.report.join('\n') || 'Housekeeping ran and said nothing.' }}</p>
        <Button variant="ghost" size="xs" class="self-start" @click="$emit('dismissHousekeeping')">Dismiss</Button>
      </div>
      <div v-else :class="toneRule.bad" class="flex flex-col gap-1">
        <p>{{ housekeeping.message }}</p>
        <ul v-if="housekeeping.reasons.length" class="list-disc pl-5 text-foreground">
          <li v-for="(reason, i) in housekeeping.reasons" :key="i">{{ reason }}</li>
        </ul>
        <Button variant="ghost" size="xs" class="self-start" @click="$emit('dismissHousekeeping')">Dismiss</Button>
      </div>
    </section>
  </Card>
</template>
