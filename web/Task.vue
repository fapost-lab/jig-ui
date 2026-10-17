<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { api, describe, link, onChange, type TaskDetails } from './api';

const props = defineProps<{ project: string; task: string }>();
const details = ref<TaskDetails | 'not-connected' | 'not-found'>();

let latest = 0;

async function load(): Promise<void> {
  const mine = ++latest;
  const res = await api(`/api/projects/${encodeURIComponent(props.project)}/tasks/${encodeURIComponent(props.task)}`);
  if (!res) return;
  const read = res.ok
    ? ((await res.json()) as { task: TaskDetails }).task
    : ((await res.json()) as { error: { code: string } }).error.code === 'not-found'
      ? 'not-found'
      : 'not-connected';
  // A newer load may have started meanwhile: an older answer must not overwrite it.
  if (mine === latest) details.value = read;
}

onMounted(load);
onUnmounted(onChange((project) => (project === undefined || project === props.project) && void load()));

/** What each of Jig's actions is called on the page; an id this page does not know shows as it is. */
const ACTIONS: Record<string, string> = {
  start: 'Start it',
  pause: 'Pause it',
  resume: 'Resume it',
  'approve-gate': 'Approve the design',
  'answer-stop': "Answer the autopilot's question",
  'set-class': 'Change its class',
  ship: 'Ship it',
  close: 'Close it',
  abandon: 'Abandon it',
  reopen: 'Reopen it',
};

const boardLink = `#/projects/${encodeURIComponent(props.project)}`;
</script>

<template>
  <p><a :href="boardLink">← Board of {{ project }}</a></p>
  <h2>{{ task }}</h2>
  <p v-if="details === undefined">Reading the task…</p>
  <p v-else-if="details === 'not-connected'" role="alert">No connected project is called {{ project }}.</p>
  <p v-else-if="details === 'not-found'" role="alert">
    {{ project }} has no live task called {{ task }}. A finished task is not shown.
  </p>
  <p v-else-if="details.state !== 'ready'">{{ describe(details) }}</p>
  <template v-else>
    <p v-if="details.goal">{{ details.goal }}</p>
    <dl>
      <dt>Column</dt>
      <dd>{{ details.column.title }}</dd>
      <dt>Status</dt>
      <dd>{{ details.status }}{{ details.paused ? ', paused' : '' }}</dd>
      <dt>Class</dt>
      <dd>{{ details.class ?? 'not classified yet' }}</dd>
      <dt>Branch</dt>
      <dd>
        <template v-if="details.branch">{{ details.branch }}, lands on {{ details.baseBranch }}</template>
        <template v-else>not started; will land on {{ details.baseBranch }}</template>
      </dd>
      <template v-if="details.worktree">
        <dt>Worktree</dt>
        <dd>{{ details.worktree.uncommitted }} uncommitted {{ details.worktree.uncommitted === 1 ? 'file' : 'files' }}</dd>
      </template>
      <template v-if="details.issue">
        <dt>Issue</dt>
        <dd>{{ details.issue }}</dd>
      </template>
      <dt>Knowledge decision</dt>
      <dd>{{ details.knowledgeConsolidated ? 'recorded' : 'not recorded yet' }}</dd>
      <dt>Filed, last changed</dt>
      <dd>{{ details.createdAt ?? '—' }}, {{ details.updatedAt ?? '—' }}</dd>
    </dl>

    <section v-if="details.gate" aria-labelledby="gate">
      <h3 id="gate">Design gate</h3>
      <p v-if="details.gate === 'waiting'">The design waits for approval.</p>
      <p v-else-if="details.gate === 'changed'">The design changed after it was approved.</p>
      <p v-else>Approved{{ details.gateBy ? ` by ${details.gateBy === 'human' ? 'a person' : 'an agent'}` : '' }}.</p>
    </section>

    <section v-if="details.autopilot && details.run" aria-labelledby="run">
      <h3 id="run">Autopilot</h3>
      <p>
        {{ details.autopilot }}{{ details.run.mode ? `, ${details.run.mode}` : '' }}{{ details.run.phase ? `, phase ${details.run.phase}` : '' }}
      </p>
      <p v-if="details.run.stage">Last stage: {{ details.run.stage }}<template v-if="details.run.stageAt">, since {{ details.run.stageAt }}</template></p>
      <p v-if="details.autopilot === 'stopped' && details.run.stopReason">
        Stopped<template v-if="details.run.stopAt"> at {{ details.run.stopAt }}</template>: {{ details.run.stopReason }}
      </p>
    </section>

    <section v-if="details.pullRequest" aria-labelledby="pull-request">
      <h3 id="pull-request">Pull request</h3>
      <p>
        {{ details.pullRequest.state ?? 'state not known yet' }}<template v-if="details.pullRequest.ci && details.pullRequest.ci !== 'none'">, CI {{ details.pullRequest.ci }}</template>
        <a v-if="link(details.pullRequest.url)" :href="link(details.pullRequest.url)" target="_blank" rel="noopener noreferrer">Open</a>
      </p>
      <p v-if="details.pullRequest.fetchedAt">As Jig's housekeeping heard it at {{ details.pullRequest.fetchedAt }}.</p>
    </section>

    <section v-if="details.attention.length > 0" aria-labelledby="needs-you">
      <h3 id="needs-you">Needs you</h3>
      <article v-for="(item, i) in details.attention" :key="i">
        <p>
          <strong>{{ item.title }}</strong>
          <a v-if="link(item.url)" :href="link(item.url)" target="_blank" rel="noopener noreferrer">Open</a>
        </p>
        <p v-if="item.detail">{{ item.detail }}</p>
        <p>{{ item.todo }}</p>
      </article>
    </section>

    <section v-if="details.housekeepingFlags.length > 0" aria-labelledby="flags">
      <h3 id="flags">Housekeeping flags</h3>
      <ul>
        <li v-for="flag in details.housekeepingFlags" :key="flag">{{ flag }}</li>
      </ul>
    </section>

    <section aria-labelledby="actions">
      <h3 id="actions">What Jig offers now</h3>
      <p v-if="details.actions.length === 0">Nothing for now.</p>
      <ul v-else>
        <li v-for="action in details.actions" :key="action.id">
          {{ ACTIONS[action.id] ?? action.id }}: <code>{{ action.command }}</code>
        </li>
      </ul>
      <p>Run a command in the project; this page follows what changes.</p>
    </section>
  </template>
</template>

<style scoped>
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
}
dd {
  margin: 0;
}
</style>
