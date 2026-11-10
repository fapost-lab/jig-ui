<script setup lang="ts">
  import { computed, ref } from 'vue';
  import type { SpecItem } from '@/api';
  import { Button } from '@/components/ui/button';
  import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { filingGoal, itemWords } from '@/lib/specs';

  /**
   * Files the task of a roadmap item and names it on the item. An id of a live task names that task, filed already: no
   * goal. `refusal` is why the last try was refused, `taken` when for its id.
   */
  const props = defineProps<{
    spec: string;
    item: SpecItem;
    /** The ids of the project's live tasks. */
    live: string[];
    busy: boolean;
    refusal?: string;
    taken?: boolean;
  }>();

  const open = defineModel<boolean>('open', { required: true });

  const emit = defineEmits<{
    file: [task: string, goal: string | null];
  }>();

  const task = ref('');
  const goal = ref(filingGoal(props.item));
  const filed = computed(() => props.live.includes(task.value.trim()));
  const words = computed(() =>
    itemWords(props.item)
      .words.map((run) => run.text)
      .join(''),
  );
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>File the task of an item of {{ spec }}</DialogTitle>
        <DialogDescription>{{ words }}</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-3" @submit.prevent="emit('file', task.trim(), filed ? null : goal.trim())">
        <div class="flex flex-col gap-1">
          <Label for="item-task-id">Task id</Label>
          <Input
            id="item-task-id"
            v-model="task"
            required
            pattern="[A-Za-z0-9_][A-Za-z0-9._\-]*"
            placeholder="invoices-from-orders"
            :aria-invalid="taken"
            aria-describedby="item-task-hint item-task-refusal"
          />
          <p id="item-task-hint" class="text-muted-foreground">
            <template v-if="filed">Names {{ task.trim() }}, filed already: Jig runs <code>jig spec item file</code>.</template>
            <template v-else>
              Letters, digits, ".", "_" and "-", not starting with "." or "-". Jig files the task and names it on the item with
              <code>jig spec item file</code>; the task goes to Backlog.
            </template>
          </p>
        </div>
        <div v-if="!filed" class="flex flex-col gap-1">
          <Label for="item-task-goal">Goal</Label>
          <Input id="item-task-goal" v-model="goal" required maxlength="500" />
        </div>
        <p v-if="refusal" id="item-task-refusal" role="alert" class="text-destructive">{{ refusal }}</p>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="busy">{{ busy ? 'Filing…' : 'File task' }}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
