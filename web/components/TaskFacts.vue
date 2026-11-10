<script setup lang="ts">
  import { ExternalLink } from '@lucide/vue';
  import { link, type ReadyDetails } from '@/api';
  import { placeLine, priorityLabel, waitLine } from '@/lib/queue';
  import { toneRule } from '@/lib/tones';

  defineProps<{
    details: ReadyDetails;
  }>();
</script>

<template>
  <div class="@container flex flex-col gap-3">
    <!-- Narrow (an expanded card): each label above its value; wider: side by side. -->
    <dl class="grid grid-cols-1 @sm:grid-cols-[max-content_1fr] @sm:gap-x-4 @sm:gap-y-1">
      <dt class="text-[13px] text-muted-foreground">Column</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.column.title }}</dd>
      <dt class="text-[13px] text-muted-foreground">Status</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.status }}{{ details.paused ? ', paused' : '' }}</dd>
      <dt class="text-[13px] text-muted-foreground">Class</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.class ?? 'not classified yet' }}</dd>
      <dt class="text-[13px] text-muted-foreground">Priority</dt>
      <dd class="mb-1 @sm:mb-0">{{ priorityLabel(details.priority) }}</dd>
      <dt class="text-[13px] text-muted-foreground">Queue</dt>
      <dd class="mb-1 @sm:mb-0">{{ placeLine(details) }}</dd>
      <dt class="text-[13px] text-muted-foreground">Waits for</dt>
      <dd class="mb-1 @sm:mb-0">
        <template v-if="details.dependsOn.length === 0">nothing in the queue</template>
        <ul v-else>
          <li v-for="d in details.dependsOn" :key="`${d.through}>${d.on}`">{{ waitLine(d) }}</li>
        </ul>
      </dd>
      <dt class="text-[13px] text-muted-foreground">Filed, changed</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.createdAt ?? '—' }}, {{ details.updatedAt ?? '—' }}</dd>
      <dt class="text-[13px] text-muted-foreground">Branch</dt>
      <dd class="mb-1 break-all @sm:mb-0">
        <template v-if="details.branch"
          ><code class="text-xs">{{ details.branch }}</code> → <code class="text-xs">{{ details.baseBranch }}</code></template
        >
        <template v-else
          >not started; will land on <code class="text-xs">{{ details.baseBranch }}</code></template
        >
      </dd>
      <template v-if="details.worktree">
        <dt class="text-[13px] text-muted-foreground">Worktree</dt>
        <dd class="mb-1 @sm:mb-0">
          {{ details.worktree.uncommitted }} uncommitted {{ details.worktree.uncommitted === 1 ? 'file' : 'files' }}
        </dd>
      </template>
      <template v-if="details.issue">
        <dt class="text-[13px] text-muted-foreground">Issue</dt>
        <dd class="mb-1 @sm:mb-0">{{ details.issue }}</dd>
      </template>
      <template v-if="details.gate">
        <dt class="text-[13px] text-muted-foreground">Gate</dt>
        <dd class="mb-1 @sm:mb-0">
          <template v-if="details.gate === 'waiting'">the design waits for approval</template>
          <template v-else-if="details.gate === 'changed'">the design changed after it was approved</template>
          <template v-else>approved{{ details.gateBy ? ` by ${details.gateBy === 'human' ? 'a person' : 'an agent'}` : '' }}</template>
        </dd>
      </template>
      <template v-if="details.autopilot && details.run">
        <dt class="text-[13px] text-muted-foreground">Autopilot</dt>
        <dd class="mb-1 @sm:mb-0">
          {{ details.autopilot }}{{ details.run.mode ? `, ${details.run.mode}` : ''
          }}{{ details.run.phase ? `, phase ${details.run.phase}` : ''
          }}<template v-if="details.run.stage"
            >; last stage {{ details.run.stage }}<template v-if="details.run.stageAt">, since {{ details.run.stageAt }}</template></template
          >
        </dd>
      </template>
      <template v-if="details.pullRequest">
        <dt class="text-[13px] text-muted-foreground">Pull request</dt>
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
      <dt class="text-[13px] text-muted-foreground">Knowledge</dt>
      <dd class="mb-1 @sm:mb-0">{{ details.knowledgeConsolidated ? 'decision recorded' : 'decision not recorded yet' }}</dd>
    </dl>
    <div v-if="details.autopilot === 'stopped' && details.run?.stopReason" :class="toneRule.attention" role="note">
      <p class="font-semibold">
        The autopilot asks<template v-if="details.run.stopAt"> (since {{ details.run.stopAt }})</template>
      </p>
      <p class="text-foreground">{{ details.run.stopReason }}</p>
    </div>
  </div>
</template>
