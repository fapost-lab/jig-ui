<script setup lang="ts">
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';

  /** `refusal` is why the last connect or Find projects was refused, word for word from the server; `finding` while Find projects looks. */
  defineProps<{
    busy: boolean;
    finding?: boolean;
    refusal?: string;
  }>();

  defineEmits<{
    connect: [path: string];
    find: [folder: string];
  }>();

  const path = defineModel<string>({ default: '' });
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="$emit('connect', path)">
    <Label for="project-path">Project path</Label>
    <!-- On a narrow screen the buttons go under the field, which keeps room for a path. -->
    <div class="flex flex-wrap gap-2">
      <Input
        id="project-path"
        class="flex-[1_1_14rem]"
        v-model="path"
        required
        placeholder="/path/to/project"
        :aria-invalid="refusal !== undefined"
        aria-describedby="connect-refusal"
      />
      <Button type="submit" :disabled="busy">{{ busy ? 'Connecting…' : 'Connect' }}</Button>
      <!-- The field's folder, or the home folder when it is empty. -->
      <Button type="button" variant="outline" :disabled="finding" @click="$emit('find', path)">
        {{ finding ? 'Finding…' : 'Find projects' }}
      </Button>
    </div>
    <p v-if="refusal" id="connect-refusal" role="alert" class="text-destructive">{{ refusal }}</p>
  </form>
</template>
