<script setup lang="ts">
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';

  /** `refusal` is why the last connect was refused, word for word from the server. */
  defineProps<{
    busy: boolean;
    refusal?: string;
  }>();

  defineEmits<{
    connect: [path: string];
  }>();

  const path = defineModel<string>({ default: '' });
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="$emit('connect', path)">
    <Label for="project-path">Project path</Label>
    <div class="flex gap-2">
      <Input
        id="project-path"
        v-model="path"
        required
        placeholder="/path/to/project"
        :aria-invalid="refusal !== undefined"
        aria-describedby="connect-refusal"
      />
      <Button type="submit" :disabled="busy">{{ busy ? 'Connecting…' : 'Connect' }}</Button>
    </div>
    <p v-if="refusal" id="connect-refusal" role="alert" class="text-destructive">{{ refusal }}</p>
  </form>
</template>
