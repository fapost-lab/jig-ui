<script setup lang="ts">
  // The maintainer's page of every component in every variant and state, light and dark side by
  // side. A component added to components/ or components/ui/ gets a section here.
  import { Copy } from '@lucide/vue';
  import ActionList from '@/components/ActionList.vue';
  import AttentionItem from '@/components/AttentionItem.vue';
  import BoardColumns from '@/components/BoardColumns.vue';
  import BoardList from '@/components/BoardList.vue';
  import ColumnHeader from '@/components/ColumnHeader.vue';
  import ConnectForm from '@/components/ConnectForm.vue';
  import FinishedList from '@/components/FinishedList.vue';
  import NewTaskForm from '@/components/NewTaskForm.vue';
  import CopyCommand from '@/components/CopyCommand.vue';
  import ProjectCard from '@/components/ProjectCard.vue';
  import ProgressBar from '@/components/ProgressBar.vue';
  import ProjectTabs from '@/components/ProjectTabs.vue';
  import EpicMenu from '@/components/EpicMenu.vue';
  import QueueMenu from '@/components/QueueMenu.vue';
  import SpecCard from '@/components/SpecCard.vue';
  import SpecItemRow from '@/components/SpecItemRow.vue';
  import TaskBrief from '@/components/TaskBrief.vue';
  import TaskCard from '@/components/TaskCard.vue';
  import TaskFacts from '@/components/TaskFacts.vue';
  import TaskRow from '@/components/TaskRow.vue';
  import ThemeToggle from '@/components/ThemeToggle.vue';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Separator } from '@/components/ui/separator';
  import { Toggle } from '@/components/ui/toggle';
  import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
  import { toneRule, toneText } from '@/lib/tones';
  import UpgradePanel from '@/components/UpgradePanel.vue';
  import CanvasSection from './CanvasSection.vue';
  import {
    actions,
    attention,
    board,
    columns,
    details,
    emptyBoard,
    epics,
    finished,
    plans,
    projects,
    runs,
    specItems,
    specs,
    tasks,
  } from './canvas-samples';

  const buttonVariants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
  const buttonSizes = ['xs', 'sm', 'default', 'lg'] as const;
  const iconSizes = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const;
  const badgeVariants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
  const tones = ['attention', 'good', 'bad', 'quiet'] as const;
</script>

<template>
  <div>
    <div class="border-b px-4 py-3">
      <h1 class="font-semibold tracking-wider uppercase">Canvas</h1>
      <p class="text-muted-foreground">Every component of the page in every variant and state; the left panel light, the right dark.</p>
    </div>

    <CanvasSection title="Tones" note="lib/tones.ts — the only colours with a meaning">
      <p v-for="tone in tones" :key="tone" :class="toneRule[tone]">{{ tone }} as a rule</p>
      <p class="flex gap-4">
        <span v-for="tone in tones" :key="tone" :class="toneText[tone]">{{ tone }}</span>
      </p>
    </CanvasSection>

    <h2 class="border-b px-4 py-2 font-bold tracking-widest uppercase">components/ui</h2>

    <CanvasSection title="Button" note="variant × size; icon sizes; disabled">
      <div v-for="variant in buttonVariants" :key="variant" class="flex flex-wrap items-center gap-2">
        <span class="w-24 text-muted-foreground">{{ variant }}</span>
        <Button v-for="size in buttonSizes" :key="size" :variant="variant" :size="size">{{ size }}</Button>
        <Button :variant="variant" disabled>disabled</Button>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-24 text-muted-foreground">icon</span>
        <Button v-for="size in iconSizes" :key="size" variant="outline" :size="size" :aria-label="size"><Copy /></Button>
        <Button variant="outline" size="sm"><Copy data-icon="inline-start" />with icon</Button>
      </div>
    </CanvasSection>

    <CanvasSection title="Badge">
      <div class="flex flex-wrap gap-2">
        <Badge v-for="variant in badgeVariants" :key="variant" :variant="variant">{{ variant }}</Badge>
      </div>
    </CanvasSection>

    <CanvasSection title="Card">
      <Card class="max-w-sm">
        <CardHeader>
          <CardTitle>Card title</CardTitle>
          <CardDescription>Card description, muted.</CardDescription>
        </CardHeader>
        <CardContent>Card content.</CardContent>
      </Card>
    </CanvasSection>

    <CanvasSection title="Input and Label" note="empty, filled, invalid, disabled">
      <div class="flex max-w-sm flex-col gap-2">
        <Label>Project path</Label>
        <Input placeholder="/path/to/project" />
        <Input model-value="/Users/me/project" />
        <Input model-value="/not/a/project" aria-invalid="true" />
        <Input model-value="disabled" disabled />
      </div>
    </CanvasSection>

    <CanvasSection title="Separator">
      <Separator />
      <div class="flex h-5 items-center gap-2">left<Separator orientation="vertical" />right</div>
    </CanvasSection>

    <CanvasSection title="ToggleGroup" note="the Board / List switch">
      <ToggleGroup type="single" variant="outline" size="sm" model-value="board" aria-label="View">
        <ToggleGroupItem value="board">Board</ToggleGroupItem>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
      </ToggleGroup>
    </CanvasSection>

    <CanvasSection title="Toggle" note="the board's finished tasks: off, on">
      <div class="flex gap-2">
        <Toggle variant="outline" size="sm" :model-value="false">3 finished tasks</Toggle>
        <Toggle variant="outline" size="sm" :model-value="true">3 finished tasks</Toggle>
      </div>
    </CanvasSection>

    <CanvasSection title="Collapsible" note="open and folded">
      <Collapsible v-for="open in [true, false]" :key="String(open)" :default-open="open">
        <CollapsibleTrigger class="w-full border-b bg-muted/50 px-3 py-1.5 text-left"
          >Trigger ({{ open ? 'open' : 'folded' }})</CollapsibleTrigger
        >
        <CollapsibleContent class="px-3 py-2">Content</CollapsibleContent>
      </Collapsible>
    </CanvasSection>

    <h2 class="border-b px-4 py-2 font-bold tracking-widest uppercase">components</h2>

    <CanvasSection title="ProjectTabs" note="on the workspace; on a project; empty">
      <ProjectTabs :projects="projects" version="0.1.0"><ThemeToggle /></ProjectTabs>
      <ProjectTabs :projects="projects" current="jig-ui" version="0.1.0" />
      <ProjectTabs :projects="[]" />
    </CanvasSection>

    <CanvasSection title="ThemeToggle" note="switches the whole page; the icon is the theme it switches to">
      <div><ThemeToggle /></div>
    </CanvasSection>

    <CanvasSection
      title="ProjectCard"
      note="ready with attention and stale housekeeping; nothing needs you; its Jig older than the machine's, Upgrade… offered; each state it cannot be read in"
    >
      <ProjectCard v-for="project in projects" :key="project.id" :project="project" />
    </CanvasSection>

    <CanvasSection
      title="UpgradePanel"
      note="on a card: reading the dry run; the plan, with steps by hand; a stop; a refusal; under way; merged, with steps by hand, staged, nothing to do; not started; failed"
    >
      <UpgradePanel v-for="(plan, i) in plans" :key="`plan-${i}`" project="legacy-shop" :run="null" :plan="plan" />
      <UpgradePanel v-for="(run, i) in runs" :key="`run-${i}`" project="legacy-shop" :run="run" :plan="undefined" />
    </CanvasSection>

    <CanvasSection title="NewTaskForm" note="empty, on its way, the id taken">
      <NewTaskForm :busy="false" />
      <NewTaskForm :busy="true" task="fix-login" goal="Log in with the token after a restart." />
      <NewTaskForm
        :busy="false"
        task="queue-reorder"
        goal="Order the work."
        refusal="The project has a task called queue-reorder already, maybe a finished one. Choose another id."
        taken
      />
    </CanvasSection>

    <CanvasSection title="ConnectForm" note="idle, busy, refused">
      <ConnectForm :busy="false" />
      <ConnectForm :busy="true" model-value="/Users/me/project" />
      <ConnectForm
        :busy="false"
        model-value="/Users/me/project/.claude/worktrees/x"
        refusal="That is a worktree. Connect the main checkout instead."
      />
    </CanvasSection>

    <CanvasSection title="AttentionItem" note="no link; a pull request; another link">
      <AttentionItem v-for="(item, i) in attention" :key="i" :item="item" />
    </CanvasSection>

    <CanvasSection title="ColumnHeader" note="each column, and one this page does not know">
      <ColumnHeader v-for="column in columns" :id="column.id" :key="column.id" :title="column.title" :count="column.count" />
    </CanvasSection>

    <CanvasSection
      title="QueueMenu"
      note="press to open: To top, Up, Down, To bottom, Priority, the pause — first queued, in the middle, not queued, last, paused under a Jig that cannot resume it (no pause to ask, Resume off), paused and resumable, a pause asked, while its change is on its way"
    >
      <div class="flex flex-wrap items-center gap-6">
        <span
          v-for="t in [tasks[0]!, tasks[1]!, tasks[3]!, tasks[11]!, tasks[9]!, tasks[13]!, tasks[12]!]"
          :key="t.id"
          class="flex items-center gap-1"
        >
          {{ t.id }}<QueueMenu :task="t" :cards="tasks" />
        </span>
        <span class="flex items-center gap-1">{{ tasks[1]!.id }}<QueueMenu :task="tasks[1]!" :cards="tasks" disabled /></span>
      </div>
    </CanvasSection>

    <CanvasSection
      title="EpicMenu"
      note="press to open: To top, Up, Down, To bottom, Priority — first queued (no Up), in the middle (Up and Down), last queued (no Down: the next one is not queued), not queued (Up joins the queued ones), while its change is on its way"
    >
      <div class="flex flex-wrap items-center gap-6">
        <span v-for="spec in epics" :key="spec.id" class="flex items-center gap-1"
          >{{ spec.id }}<EpicMenu :spec="spec" :specs="epics"
        /></span>
        <span class="flex items-center gap-1">{{ epics[1]!.id }}<EpicMenu :spec="epics[1]!" :specs="epics" disabled /></span>
      </div>
    </CanvasSection>

    <CanvasSection
      title="TaskCard"
      note="every note a card carries, a priority among them; with its queue menu; while its change is on its way; changed since a refused change; open with details, while reading, unreadable; ready and closable (✕) with its queue menu, asking before it closes, while its close is on its way"
    >
      <div class="grid grid-cols-2 gap-2 xl:grid-cols-3">
        <TaskCard v-for="task in tasks" :key="task.id" project="jig-ui" :task="task" :open="false" />
        <TaskCard project="jig-ui" :task="tasks[1]!" :open="false" :cards="tasks" />
        <TaskCard project="jig-ui" :task="tasks[0]!" :open="false" :cards="tasks" busy />
        <TaskCard project="jig-ui" :task="tasks[3]!" :open="false" :cards="tasks" changed />
        <TaskCard project="jig-ui" :task="tasks[2]!" :open="true" :details="details[0]" />
        <TaskCard project="jig-ui" :task="tasks[0]!" :open="true" />
        <TaskCard project="jig-ui" :task="tasks[1]!" :open="true" details="unavailable" />
        <TaskCard project="jig-ui" :task="tasks[4]!" :open="false" :cards="tasks" />
        <TaskCard project="jig-ui" :task="tasks[7]!" :open="false" :cards="tasks" confirming />
        <TaskCard project="jig-ui" :task="tasks[6]!" :open="false" :cards="tasks" busy />
      </div>
    </CanvasSection>

    <CanvasSection
      title="TaskRow"
      note="each note and priority; selected; with its queue menu; while its change is on its way; changed since a refused change; ready and closable, asking before it closes"
    >
      <div>
        <TaskRow v-for="(task, i) in tasks" :key="task.id" :task="task" :selected="i === 2" />
        <TaskRow :task="tasks[1]!" :selected="false" :cards="tasks" />
        <TaskRow :task="tasks[0]!" :selected="false" :cards="tasks" busy />
        <TaskRow :task="tasks[3]!" :selected="false" :cards="tasks" changed />
        <TaskRow :task="tasks[7]!" :selected="false" :cards="tasks" confirming />
      </div>
    </CanvasSection>

    <CanvasSection
      title="BoardColumns"
      note="cards in every column, one open with its details, two changed since a refused change; no live task"
    >
      <div class="flex h-[28rem] flex-col">
        <BoardColumns
          project="jig-ui"
          :columns="board"
          :selected="tasks[2]!.id"
          :details="details[0]"
          :pending="tasks[0]!.id"
          :changed="[tasks[1]!.id, tasks[3]!.id]"
        />
      </div>
      <div class="flex h-40 flex-col">
        <BoardColumns project="jig-ui" :columns="emptyBoard" />
      </div>
    </CanvasSection>

    <CanvasSection title="BoardList" note="a row picked with its details; nothing picked; no live task">
      <div class="flex h-[28rem] flex-col">
        <BoardList project="jig-ui" :columns="board" :selected="tasks[2]!.id" :details="details[0]" />
      </div>
      <div class="flex h-64 flex-col">
        <BoardList project="jig-ui" :columns="board" />
      </div>
      <div class="flex h-64 flex-col">
        <BoardList project="jig-ui" :columns="emptyBoard" />
      </div>
    </CanvasSection>

    <CanvasSection title="FinishedList" note="closed with its pull request merged; abandoned; one without a goal">
      <FinishedList :tasks="finished" class="border" />
    </CanvasSection>

    <CanvasSection title="TaskFacts" note="everything a task can carry; a task not started">
      <TaskFacts v-for="d in details" :key="d.id" :details="d" class="border-b pb-3" />
    </CanvasSection>

    <CanvasSection title="TaskBrief" note="facts, actions and the link to the full page">
      <TaskBrief project="jig-ui" :task="details[1]!.id" :details="details[1]" />
    </CanvasSection>

    <CanvasSection title="ActionList" note="Jig's offers, one unknown id; none">
      <ActionList :actions="actions" />
      <ActionList :actions="[]" />
    </CanvasSection>

    <CanvasSection title="CopyCommand" note="short; long enough to be cut">
      <CopyCommand command="jig task pause design-system" />
      <CopyCommand
        command="jig task autopilot a-task-with-a-rather-long-identifier-that-wraps resume --answer 'a long answer to the question'"
        class="max-w-xs"
      />
    </CanvasSection>

    <CanvasSection title="ProgressBar" note="none, part, all, an empty roadmap">
      <ProgressBar
        v-for="[done, total] in [
          [0, 4],
          [3, 9],
          [5, 5],
          [0, 0],
        ]"
        :key="`${done}/${total}`"
        :done="done!"
        :total="total!"
      />
    </CanvasSection>

    <CanvasSection title="SpecItemRow" note="done with a live task; open with dependencies; a task no longer live; no task; fog">
      <ul>
        <SpecItemRow v-for="(item, i) in specItems" :key="i" :item="item" project="jig-ui" :live="i < 2" />
      </ul>
    </CanvasSection>

    <CanvasSection
      title="SpecCard"
      note="no epic, a finished phase folded; an open epic in the queue at P1, with its queue menu; a lost epic branch, not queued, with its change on its way; missing files"
    >
      <SpecCard
        v-for="spec in specs"
        :key="spec.id"
        :spec="spec"
        project="jig-ui"
        :live="['design-system', 'specs-and-epics']"
        :busy="spec.id === 'lost-epic'"
      >
        <template v-if="spec.epic?.state === 'open'" #menu>
          <EpicMenu :spec="spec" :specs="specs" :disabled="spec.id === 'lost-epic'" />
        </template>
      </SpecCard>
    </CanvasSection>
  </div>
</template>
