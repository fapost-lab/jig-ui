<script setup lang="ts">
import CopyCommand from './CopyCommand.vue';

defineProps<{ actions: { id: string; command: string }[] }>();

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
</script>

<template>
  <p v-if="actions.length === 0" class="text-muted-foreground">Nothing for now.</p>
  <ul v-else class="flex flex-col gap-2">
    <li v-for="action in actions" :key="action.id">
      <p class="text-muted-foreground">› {{ ACTIONS[action.id] ?? action.id }}</p>
      <CopyCommand :command="action.command" class="mt-1" />
    </li>
  </ul>
</template>
