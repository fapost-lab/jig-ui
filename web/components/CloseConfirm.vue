<script setup lang="ts">
  import { Button } from '@/components/ui/button';
  import { toneRule } from '@/lib/tones';

  /** The question before a ready task is closed as done: closing is final, and Jig decides whether it may. */
  defineProps<{
    task: string;
  }>();

  defineEmits<{
    close: [];
    cancel: [];
  }>();
</script>

<template>
  <section :aria-label="`Close ${task}`" :class="toneRule.attention" class="flex flex-col gap-2">
    <p>
      Close {{ task }} as done? Jig closes it only if its pull request has merged, and asks the forge to be sure. A closed task leaves the
      board for good.
    </p>
    <div class="flex gap-2">
      <Button size="xs" @click="$emit('close')">Close task</Button>
      <Button variant="ghost" size="xs" @click="$emit('cancel')">Cancel</Button>
    </div>
  </section>
</template>
