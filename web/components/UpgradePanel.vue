<script setup lang="ts">
  import { ExternalLink } from '@lucide/vue';
  import { computed } from 'vue';
  import { link } from '@/api';
  import { Button } from '@/components/ui/button';
  import { ago } from '@/lib/ago';
  import { minute } from '@/lib/clock';
  import { toneRule } from '@/lib/tones';
  import { agentRequest, type PlanState, upgradeResult, type UpgradeRun } from '@/lib/upgrade';
  import CopyCommand from './CopyCommand.vue';

  const props = defineProps<{
    project: string;
    run: UpgradeRun | null;
    plan: PlanState | undefined;
  }>();

  defineEmits<{
    selfUpdate: [];
    upgrade: [];
    close: [];
    dismiss: [];
  }>();

  const result = computed(() => (props.run && props.run.state !== 'running' ? upgradeResult(props.run) : undefined));
  const request = computed(() => agentRequest(props.project));
</script>

<template>
  <section :aria-label="`Upgrade Jig in ${project}`" class="flex flex-col gap-2">
    <p v-if="run?.state === 'running'" :class="toneRule.quiet">
      Upgrading to {{ run.to }}… started {{ ago(run.since, minute.getTime()) }}. Where the project lets Jig merge, it waits for CI first.
    </p>

    <div v-else-if="result" :class="toneRule[result.tone]" class="flex flex-col gap-1">
      <p>
        {{ result.text }}
        <a
          v-if="link(result.url)"
          :href="link(result.url)"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 underline underline-offset-2"
        >
          Open pull request<ExternalLink class="size-3" />
        </a>
      </p>
      <ul v-if="result.reasons.length" class="list-disc pl-5 text-foreground">
        <li v-for="(reason, i) in result.reasons" :key="i">{{ reason }}</li>
      </ul>
      <template v-if="result.steps.length">
        <p class="text-foreground">Steps the release asks for by hand:</p>
        <ul class="list-disc pl-5 text-foreground">
          <li v-for="(step, i) in result.steps" :key="i">{{ step }}</li>
        </ul>
        <p class="text-muted-foreground">Your agent can do them; ask it:</p>
        <CopyCommand :command="request" />
      </template>
      <Button variant="ghost" size="xs" class="self-start" @click="$emit('dismiss')">Dismiss</Button>
    </div>

    <div v-else-if="plan?.state === 'confirm-self-update'" :class="toneRule.attention" class="flex flex-col gap-2">
      <p>
        {{ plan.release }}. The project upgrades from the Jig installed on this machine, so that Jig is updated first:
        <code>jig self-update</code> moves it to the newest release for every project on this machine. No project changes until its own
        upgrade, which Jig plans next.
      </p>
      <div class="flex gap-2">
        <Button size="xs" @click="$emit('selfUpdate')">Update Jig on this machine</Button>
        <Button variant="ghost" size="xs" @click="$emit('close')">Cancel</Button>
      </div>
    </div>

    <p v-else-if="plan?.state === 'self-updating'" class="text-muted-foreground">Updating Jig on this machine…</p>

    <p v-else-if="plan?.state === 'reading'" class="text-muted-foreground">Asking Jig what the upgrade would do…</p>

    <div v-else-if="plan?.state === 'refused'" :class="toneRule.bad" class="flex flex-col gap-1">
      <p>{{ plan.message }}</p>
      <ul v-if="plan.reasons?.length" class="list-disc pl-5 text-foreground">
        <li v-for="(reason, i) in plan.reasons" :key="i">{{ reason }}</li>
      </ul>
      <Button variant="ghost" size="xs" class="self-start" @click="$emit('close')">Close</Button>
    </div>

    <div v-else-if="plan?.state === 'planned' && plan.plan.wouldStop.length" :class="toneRule.attention" class="flex flex-col gap-1">
      <p>Jig would not start the upgrade here:</p>
      <ul class="list-disc pl-5 text-foreground">
        <li v-for="(reason, i) in plan.plan.wouldStop" :key="i">{{ reason }}</li>
      </ul>
      <Button variant="ghost" size="xs" class="self-start" @click="$emit('close')">Close</Button>
    </div>

    <div v-else-if="plan?.state === 'planned'" :class="toneRule.quiet" class="flex flex-col gap-2">
      <p class="text-foreground">
        Upgrade {{ plan.plan.from }} → {{ plan.plan.to }}. Jig works in the project's main checkout: it cuts a branch, commits, and pushes,
        opens a pull request or merges as far as the project's agent.git allows.
      </p>
      <template v-if="plan.plan.manualSteps.length">
        <p class="text-foreground">This release also asks for steps by hand:</p>
        <ul class="list-disc pl-5 text-foreground">
          <li v-for="(step, i) in plan.plan.manualSteps" :key="i">{{ step }}</li>
        </ul>
      </template>
      <div class="flex gap-2">
        <Button size="xs" @click="$emit('upgrade')">Upgrade</Button>
        <Button variant="ghost" size="xs" @click="$emit('close')">Cancel</Button>
      </div>
      <p>{{ plan.plan.manualSteps.length ? 'Your agent can do the steps too; ask it instead:' : 'Or ask your agent:' }}</p>
      <CopyCommand :command="request" />
    </div>
  </section>
</template>
