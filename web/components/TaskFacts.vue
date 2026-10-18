<script setup lang="ts">
import { ExternalLink } from '@lucide/vue';
import { link, type ReadyDetails } from '@/api';
import { toneRule } from '@/lib/tones';

defineProps<{ details: ReadyDetails }>();
</script>

<template>
  <div class="@container flex flex-col gap-3">
    <!-- Narrow (an expanded card): each label above its value; wider: side by side. -->
    <dl class="grid grid-cols-1 @sm:grid-cols-[max-content_1fr] @sm:gap-x-4 @sm:gap-y-1">
      <dt class="text-muted-foreground">column</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.column.title }}</dd>
      <dt class="text-muted-foreground">status</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.status }}{{ details.paused ? ', paused' : '' }}</dd>
      <dt class="text-muted-foreground">class</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.class ?? 'not classified yet' }}</dd>
      <dt class="text-muted-foreground">branch</dt>
      <dd class="mb-1 break-all @sm:mb-0">
        <template v-if="details.branch">{{ details.branch }} → {{ details.baseBranch }}</template>
        <template v-else>not started; will land on {{ details.baseBranch }}</template>
      </dd>
      <template v-if="details.worktree">
        <dt class="text-muted-foreground">worktree</dt>
        <dd class="mb-1 @sm:mb-0">
          {{ details.worktree.uncommitted }} uncommitted {{ details.worktree.uncommitted === 1 ? 'file' : 'files' }}
        </dd>
      </template>
      <template v-if="details.issue">
        <dt class="text-muted-foreground">issue</dt>
        <dd class="mb-1 @sm:mb-0">{{ details.issue }}</dd>
      </template>
      <template v-if="details.gate">
        <dt class="text-muted-foreground">gate</dt>
        <dd class="mb-1 @sm:mb-0">
          <template v-if="details.gate === 'waiting'">the design waits for approval</template>
          <template v-else-if="details.gate === 'changed'">the design changed after it was approved</template>
          <template v-else>approved{{ details.gateBy ? ` by ${details.gateBy === 'human' ? 'a person' : 'an agent'}` : '' }}</template>
        </dd>
      </template>
      <template v-if="details.autopilot && details.run">
        <dt class="text-muted-foreground">autopilot</dt>
        <dd class="mb-1 @sm:mb-0">
          {{ details.autopilot }}{{ details.run.mode ? `, ${details.run.mode}` : ''
          }}{{ details.run.phase ? `, phase ${details.run.phase}` : ''
          }}<template v-if="details.run.stage"
            >; last stage {{ details.run.stage }}<template v-if="details.run.stageAt">, since {{ details.run.stageAt }}</template></template
          >
        </dd>
      </template>
      <template v-if="details.pullRequest">
        <dt class="text-muted-foreground">pull request</dt>
        <dd class="mb-1 @sm:mb-0">
          {{ details.pullRequest.state ?? 'state not known yet'
          }}<template v-if="details.pullRequest.ci && details.pullRequest.ci !== 'none'">, CI {{ details.pullRequest.ci }}</template>
          <a
            v-if="link(details.pullRequest.url)"
            :href="link(details.pullRequest.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 underline underline-offset-2"
          >
            open<ExternalLink class="size-3" />
          </a>
          <span v-if="details.pullRequest.fetchedAt" class="block text-muted-foreground"
            >as Jig's housekeeping heard it at {{ details.pullRequest.fetchedAt }}</span
          >
        </dd>
      </template>
      <dt class="text-muted-foreground">knowledge</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.knowledgeConsolidated ? 'decision recorded' : 'decision not recorded yet' }}</dd>
      <dt class="text-muted-foreground">filed, changed</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.createdAt ?? '—' }}, {{ details.updatedAt ?? '—' }}</dd>
    </dl>
    <div v-if="details.autopilot === 'stopped' && details.run?.stopReason" :class="toneRule.attention" role="note">
      <p class="font-semibold">
        The autopilot asks<template v-if="details.run.stopAt"> (since {{ details.run.stopAt }})</template>
      </p>
      <p class="text-foreground">{{ details.run.stopReason }}</p>
    </div>
  </div>
</template>
