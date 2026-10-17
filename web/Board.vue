<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { api, type Board, describe, link, onChange, type Task } from './api';

const props = defineProps<{ id: string }>();
const board = ref<Board | 'not-connected'>();

let latest = 0;

async function load(): Promise<void> {
  const mine = ++latest;
  const res = await api(`/api/projects/${encodeURIComponent(props.id)}/board`);
  if (!res) return;
  const read = res.status === 404 ? 'not-connected' : ((await res.json()) as { board: Board }).board;
  // A newer load may have started meanwhile: an older answer must not overwrite it.
  if (mine === latest) board.value = read;
}

onMounted(load);
onUnmounted(onChange((project) => (project === undefined || project === props.id) && void load()));

/** True when the card's badge is about the task's pull request, so its link belongs beside it. */
const aboutPullRequest = (task: Task): boolean =>
  task.pullRequest !== null && !task.paused && task.gate !== 'waiting' && task.gate !== 'changed' && task.autopilot !== 'stopped';

/** What a card says about where its task waits: the gate, the autopilot run, the pull request. */
function badge(task: Task): string | undefined {
  if (task.gate === 'waiting') return 'Design waits at its gate';
  if (task.gate === 'changed') return 'Design changed after approval';
  if (task.autopilot === 'stopped') return 'Autopilot stopped with a question';
  if (task.paused) return undefined;
  if (task.pullRequest) {
    const ci = task.pullRequest.ci && task.pullRequest.ci !== 'none' ? `, CI ${task.pullRequest.ci}` : '';
    return `Pull request ${task.pullRequest.state ?? 'opened'}${ci}`;
  }
  if (task.status === 'ready') return 'No pull request yet';
  return task.autopilot === 'on' ? 'On autopilot' : undefined;
}
</script>

<template>
  <p><a href="#/">← All projects</a></p>
  <h2>{{ id }}</h2>
  <p v-if="board === undefined">Reading the board…</p>
  <p v-else-if="board === 'not-connected'" role="alert">No connected project is called {{ id }}.</p>
  <p v-else-if="board.state !== 'ready'">{{ describe(board) }}</p>
  <template v-else>
    <div class="columns">
      <section v-for="column in board.columns" :key="column.id" :aria-labelledby="`column-${column.id}`">
        <h3 :id="`column-${column.id}`">{{ column.title }} ({{ column.cards.length }})</h3>
        <ul>
          <li v-for="task in column.cards" :key="task.id">
            <strong><a :href="`#/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`">{{ task.id }}</a></strong>
            <span v-if="task.class">{{ task.class }}</span>
            <p v-if="task.goal" class="goal">{{ task.goal }}</p>
            <p v-if="badge(task)">
              {{ badge(task) }}
              <a v-if="task.pullRequest && aboutPullRequest(task) && link(task.pullRequest.url)" :href="link(task.pullRequest.url)" target="_blank" rel="noopener noreferrer">Open</a>
            </p>
          </li>
        </ul>
      </section>
    </div>
    <p v-if="board.finished > 0">{{ board.finished }} finished {{ board.finished === 1 ? 'task is' : 'tasks are' }} not shown.</p>
  </template>
</template>

<style scoped>
.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 1rem;
  align-items: start;
}
ul {
  list-style: none;
  padding: 0;
}
li {
  border: 1px solid currentColor;
  border-radius: 0.25rem;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}
.goal {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
