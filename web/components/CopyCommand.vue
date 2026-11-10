<script setup lang="ts">
  import CopyButton from './CopyButton.vue';

  defineProps<{
    command: string;
  }>();
</script>

<template>
  <div class="flex items-center rounded-md bg-muted">
    <code class="min-w-0 flex-1 truncate px-2.5 py-1 text-xs" :title="command">{{ command }}</code>
    <CopyButton :text="command" />
  </div>
</template>
