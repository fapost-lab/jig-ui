<script setup lang="ts">
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';

  /** A new task with only an id and a goal; `refusal` is why the last one was refused, `taken` when for its id. */
  defineProps<{
    busy: boolean;
    refusal?: string;
    taken?: boolean;
  }>();

  defineEmits<{
    file: [task: string, goal: string];
  }>();

  const task = defineModel<string>('task', { default: '' });
  const goal = defineModel<string>('goal', { default: '' });
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="$emit('file', task.trim(), goal.trim())">
    <div class="flex flex-wrap items-end gap-2">
      <div class="flex flex-col gap-1">
        <Label for="new-task-id">Id</Label>
        <Input
          id="new-task-id"
          v-model="task"
          required
          pattern="[A-Za-z0-9_][A-Za-z0-9._\-]*"
          placeholder="fix-login"
          class="w-56"
          :aria-invalid="taken"
          aria-describedby="new-task-hint new-task-refusal"
        />
      </div>
      <div class="flex min-w-64 flex-1 flex-col gap-1">
        <Label for="new-task-goal">Goal</Label>
        <Input id="new-task-goal" v-model="goal" required maxlength="500" placeholder="What the task is for, in one line" />
      </div>
      <Button type="submit" :disabled="busy">{{ busy ? 'Filing…' : 'File it' }}</Button>
    </div>
    <p id="new-task-hint" class="text-muted-foreground">
      Letters, digits, ".", "_" and "-", not starting with "." or "-". The task goes to Backlog; Jig runs
      <code>jig task new</code>.
    </p>
    <p v-if="refusal" id="new-task-refusal" role="alert" class="text-destructive">{{ refusal }}</p>
  </form>
</template>
