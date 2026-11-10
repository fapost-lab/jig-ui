<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import type { Setting, Settings } from '@/api';
  import { Button } from '@/components/ui/button';
  import { Checkbox } from '@/components/ui/checkbox';
  import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
  import { Input } from '@/components/ui/input';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { control, noSettings, parts, shownValue, sourceLine } from '@/lib/settings';
  import { toneText } from '@/lib/tones';

  /** A project's settings: `undefined` while they are read; `pending` names the key being written, `notice` what came of the last change. */
  const props = defineProps<{
    project: string;
    settings?: Settings;
    pending?: string;
    notice?: string;
    reading?: boolean;
  }>();

  const open = defineModel<boolean>('open', { required: true });

  const emit = defineEmits<{
    set: [key: string, value: string];
    unset: [key: string];
    readAgain: [];
  }>();

  const none = computed(() => props.settings && noSettings(props.settings));
  const shown = computed(() => (props.settings?.state === 'ready' ? parts(props.settings.keys) : { project: [], own: [] }));

  /** What the person typed into a field and has not saved yet, by key; a new read of the settings starts over. */
  const drafts = ref<Record<string, string>>({});
  watch(
    () => props.settings,
    () => (drafts.value = {}),
  );

  const draft = (s: Setting) => drafts.value[s.key] ?? s.value ?? '';
  const changed = (s: Setting) => s.key in drafts.value && drafts.value[s.key] !== (s.value ?? '');
  const busy = computed(() => props.pending !== undefined);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Settings of {{ project }}</DialogTitle>
        <DialogDescription>
          Yours are kept in this clone only, in <code>.ai/config.local.yaml</code>, through <code>jig config set --local</code>. The
          project's are in <code>.ai/config.yaml</code>, shared through git: change them there.
        </DialogDescription>
      </DialogHeader>
      <p v-if="notice" :class="[toneText.attention, 'sticky -top-4 z-10 bg-popover py-2']" role="status">{{ notice }}</p>
      <p v-if="settings === undefined" class="text-muted-foreground">Reading the settings…</p>
      <p v-else-if="none" class="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        {{ none }}
        <Button v-if="settings.state === 'unreadable'" variant="outline" size="xs" :disabled="reading" @click="emit('readAgain')">
          {{ reading ? 'Reading…' : 'Read again' }}
        </Button>
      </p>
      <template v-else>
        <section aria-labelledby="own-settings" class="flex flex-col gap-2">
          <h3 id="own-settings" class="text-[15px] font-semibold">Yours, in this clone</h3>
          <ul class="divide-y border-y">
            <li v-for="s in shown.own" :key="s.key" class="flex flex-col gap-1 py-2.5">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label :for="`setting-${s.key}`" class="font-mono text-[13px] font-medium">{{ s.key }}</label>
                <Checkbox
                  v-if="control(s) === 'checkbox'"
                  :id="`setting-${s.key}`"
                  :model-value="s.value === 'true'"
                  :disabled="busy"
                  @update:model-value="(on) => emit('set', s.key, on === true ? 'true' : 'false')"
                />
                <Select
                  v-else-if="control(s) === 'choice'"
                  :model-value="s.value"
                  :disabled="busy"
                  @update:model-value="(v) => typeof v === 'string' && emit('set', s.key, v)"
                >
                  <SelectTrigger :id="`setting-${s.key}`" size="sm" class="min-w-28"><SelectValue placeholder="not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="value in s.allowed" :key="value" :value="value">{{ value }}</SelectItem>
                  </SelectContent>
                </Select>
                <form
                  v-else-if="control(s) === 'field'"
                  class="flex items-center gap-2"
                  @submit.prevent="changed(s) && emit('set', s.key, draft(s))"
                >
                  <Input
                    :id="`setting-${s.key}`"
                    :model-value="draft(s)"
                    :disabled="busy"
                    :placeholder="s.default ?? 'not set'"
                    class="h-8 w-48"
                    @update:model-value="(v) => (drafts[s.key] = String(v))"
                  />
                  <Button v-if="changed(s)" type="submit" variant="outline" size="xs" :disabled="busy">Save</Button>
                </form>
                <span v-else :id="`setting-${s.key}`">{{ shownValue(s) }}</span>
                <span v-if="pending === s.key" class="text-[13px] text-muted-foreground">Saving…</span>
                <Button
                  v-if="s.source === 'local'"
                  variant="ghost"
                  size="xs"
                  class="ml-auto"
                  :disabled="busy"
                  @click="emit('unset', s.key)"
                >
                  {{ s.secret ? 'Clear' : 'Unset' }}
                </Button>
              </div>
              <p class="text-[13px] text-muted-foreground">
                {{ s.description }} <span class="whitespace-nowrap">· {{ sourceLine(s) }}</span>
              </p>
              <p v-if="s.secret" class="text-[13px] text-muted-foreground">
                Set it with <code>jig notify setup</code> in a terminal in the project: Jig never takes it on a command line.
              </p>
            </li>
          </ul>
        </section>
        <section aria-labelledby="project-settings" class="flex flex-col gap-2">
          <h3 id="project-settings" class="text-[15px] font-semibold">The project's, shared through git</h3>
          <ul class="divide-y border-y">
            <li v-for="s in shown.project" :key="s.key" class="flex flex-col gap-1 py-2.5">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class="font-mono text-[13px] font-medium">{{ s.key }}</span>
                <span>{{ shownValue(s) }}</span>
              </div>
              <p class="text-[13px] text-muted-foreground">
                {{ s.description }} <span class="whitespace-nowrap">· {{ sourceLine(s) }}</span>
              </p>
            </li>
          </ul>
        </section>
      </template>
    </DialogContent>
  </Dialog>
</template>
