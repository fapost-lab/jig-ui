<script setup lang="ts">
  import { Check, Copy } from '@lucide/vue';
  import { ref } from 'vue';
  import { Button } from '@/components/ui/button';

  const props = defineProps<{
    command: string;
  }>();

  const copied = ref(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(props.command);
      copied.value = true;
      setTimeout(() => (copied.value = false), 1500);
    } catch {
      // No clipboard (a browser that refuses it): the command stays on screen to select by hand.
    }
  }
</script>

<template>
  <div class="flex items-center bg-muted">
    <code class="min-w-0 flex-1 truncate px-2 py-1" :title="command">{{ command }}</code>
    <Button variant="ghost" size="xs" :aria-label="copied ? 'Copied' : `Copy ${command}`" @click="copy">
      <Check v-if="copied" />
      <Copy v-else />
      {{ copied ? 'copied' : 'copy' }}
    </Button>
  </div>
</template>
