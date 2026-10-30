<script setup lang="ts">
  import type { FoundProjects } from '@/api';
  import { Button } from '@/components/ui/button';
  import { foundLine, skippedLine } from '@/lib/scan';
  import { toneText } from '@/lib/tones';

  /** What Find projects found; `connecting` is the path being connected, `refusal` why the last one was refused. */
  defineProps<{
    result: FoundProjects;
    connecting?: string;
    refusal?: {
      path: string;
      message: string;
    };
  }>();

  defineEmits<{
    connect: [path: string];
  }>();
</script>

<template>
  <section aria-label="Projects found" class="flex flex-col gap-2">
    <p role="status">{{ foundLine(result) }}</p>
    <ul v-if="result.found.length" class="flex flex-col gap-1">
      <li v-for="{ path } in result.found" :key="path" class="flex flex-col gap-1">
        <div class="flex items-center gap-3">
          <code class="min-w-0 flex-1 truncate" :title="path">{{ path }}</code>
          <Button variant="outline" size="xs" :disabled="connecting !== undefined" @click="$emit('connect', path)">
            {{ connecting === path ? 'Connecting…' : 'Connect' }}
          </Button>
        </div>
        <p v-if="refusal?.path === path" role="alert" :class="toneText.bad">{{ refusal.message }}</p>
      </li>
    </ul>
    <p v-if="skippedLine(result)" :class="toneText.quiet">{{ skippedLine(result) }}</p>
    <p v-if="result.stopped" :class="toneText.quiet">
      Stopped before the end: there were too many folders. Type a smaller folder and choose Find projects.
    </p>
  </section>
</template>
