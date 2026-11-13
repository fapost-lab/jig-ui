<script setup lang="ts">
  // The maintainer's page of every component in every variant and state, light and dark side by
  // side. A component added to components/ or components/ui/ gets a section here.
  import { Copy } from '@lucide/vue';
  import { ref } from 'vue';
  import ActionList from '@/components/ActionList.vue';
  import AttentionItem from '@/components/AttentionItem.vue';
  import BoardColumns from '@/components/BoardColumns.vue';
  import BoardFilter from '@/components/BoardFilter.vue';
  import BoardList from '@/components/BoardList.vue';
  import ColumnHeader from '@/components/ColumnHeader.vue';
  import ConnectForm from '@/components/ConnectForm.vue';
  import FoundProjects from '@/components/FoundProjects.vue';
  import FinishedList from '@/components/FinishedList.vue';
  import KnowledgeView from '@/components/KnowledgeView.vue';
  import NewTaskForm from '@/components/NewTaskForm.vue';
  import CopyButton from '@/components/CopyButton.vue';
  import StateLine from '@/components/StateLine.vue';
  import CopyCommand from '@/components/CopyCommand.vue';
  import GroupPanel from '@/components/GroupPanel.vue';
  import ProjectCard from '@/components/ProjectCard.vue';
  import ProgressBar from '@/components/ProgressBar.vue';
  import ProjectList from '@/components/ProjectList.vue';
  import ProjectMark from '@/components/ProjectMark.vue';
  import ProjectSwitcher from '@/components/ProjectSwitcher.vue';
  import SettingsDialog from '@/components/SettingsDialog.vue';
  import EpicMenu from '@/components/EpicMenu.vue';
  import QueueMenu from '@/components/QueueMenu.vue';
  import FileItemDialog from '@/components/FileItemDialog.vue';
  import SpecBoard from '@/components/SpecBoard.vue';
  import SpecItemCard from '@/components/SpecItemCard.vue';
  import SpecItemMenu from '@/components/SpecItemMenu.vue';
  import TaskBrief from '@/components/TaskBrief.vue';
  import TaskCard from '@/components/TaskCard.vue';
  import TaskDocuments from '@/components/TaskDocuments.vue';
  import TaskFacts from '@/components/TaskFacts.vue';
  import TaskRow from '@/components/TaskRow.vue';
  import ThemeToggle from '@/components/ThemeToggle.vue';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Progress } from '@/components/ui/progress';
  import { Separator } from '@/components/ui/separator';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { Toggle } from '@/components/ui/toggle';
  import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
  import { itemStanding } from '@/lib/specs';
  import { columnAccent, laneAccent, toneRule, toneText } from '@/lib/tones';
  import UpgradePanel from '@/components/UpgradePanel.vue';
  import CanvasSection from './CanvasSection.vue';
  import {
    actions,
    attention,
    board,
    columns,
    details,
    documents,
    emptyBoard,
    epics,
    finished,
    closingProject,
    closings,
    housekeepingRuns,
    knowledge,
    knowledgeAttention,
    knowledgeDiffs,
    knowledgeLater,
    knowledgeTexts,
    mergedAttention,
    openDocument,
    plans,
    projects,
    runs,
    settingStates,
    specItems,
    specs,
    tasks,
    waitingSpecs,
  } from './canvas-samples';

  /** The board columns of the samples' live tasks, as the Specs view's cards say them. */
  const specColumns = new Map([
    ['design-system', { id: 'in-progress', title: 'In progress' }],
    ['specs-and-epics', { id: 'ready', title: 'Ready' }],
  ]);

  const buttonVariants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
  const buttonSizes = ['xs', 'sm', 'default', 'lg'] as const;
  const iconSizes = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const;
  const badgeVariants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
  const tones = ['attention', 'good', 'bad', 'quiet'] as const;
  /** The settings dialog's state open on the canvas: a dialog covers the page, so one at a time. */
  const settingsOpen = ref<(typeof settingStates)[number]>();
  /** The File task… dialog's state open on the canvas. */
  const filingStates = [
    { label: 'a new task', busy: false },
    { label: 'filing', busy: true },
    {
      label: 'the id taken',
      busy: false,
      taken: true,
      refusal: 'The project has a finished task called invoices. Choose another id.',
    },
    {
      label: 'the item filed already',
      busy: false,
      refusal: 'Jig did not file invoices: i-5d729342e61f already names task orders',
    },
    {
      label: 'filed, not named',
      busy: false,
      refusal:
        'Filed invoices, but Jig did not name it on the item (spec/jig-ui is checked out in another checkout). Once that is resolved, File task… again with invoices.',
    },
  ];

  const filingOpen = ref<(typeof filingStates)[number]>();
</script>

<template>
  <div>
    <div class="border-b px-4 py-3">
      <h1 class="text-xl font-semibold">Canvas</h1>
      <p class="text-muted-foreground">Every component of the page in every variant and state; the left panel light, the right dark.</p>
    </div>

    <CanvasSection title="Tones" note="lib/tones.ts — the only colours with a meaning">
      <p v-for="tone in tones" :key="tone" :class="toneRule[tone]">{{ tone }} as a rule</p>
      <p class="flex gap-4">
        <span v-for="tone in tones" :key="tone" :class="toneText[tone]">{{ tone }}</span>
      </p>
    </CanvasSection>

    <h2 class="border-b px-4 py-2 text-[15px] font-semibold">components/ui</h2>

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

    <CanvasSection title="Tabs" note="the Specs view's specs, one chosen, one with its priority; a press chooses another">
      <Tabs default-value="jig-ui">
        <TabsList aria-label="Specs">
          <TabsTrigger v-for="spec in specs" :key="spec.id" :value="spec.id">
            {{ spec.id }}
            <Badge v-if="spec.queue?.priority != null" variant="secondary">P{{ spec.queue.priority }}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent v-for="spec in specs" :key="spec.id" :value="spec.id" class="text-muted-foreground">{{
          spec.title ?? spec.id
        }}</TabsContent>
      </Tabs>
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

    <h2 class="border-b px-4 py-2 text-[15px] font-semibold">components</h2>

    <CanvasSection title="ProjectSwitcher" note="on the workspace; on a project (open it to search); no projects">
      <ProjectSwitcher :projects="projects" version="0.1.0"><ThemeToggle /></ProjectSwitcher>
      <ProjectSwitcher :projects="projects" current="jig-ui" version="0.1.0" />
      <ProjectSwitcher :projects="[]" />
    </CanvasSection>

    <CanvasSection title="ProjectList" note="one chosen, a project in each state; type to search; on the first load, two still being read">
      <div class="flex flex-wrap gap-6">
        <ProjectList :projects="projects" chosen="jig-ui" class="w-64" />
        <ProjectList
          :projects="[projects[0]!, { id: 'slow-monorepo', state: 'reading' }, { id: 'billing', state: 'reading' }]"
          class="w-64"
        />
      </div>
    </CanvasSection>

    <CanvasSection title="Progress" note="the first read of the projects: 1 of 3 landed">
      <div class="flex max-w-md flex-col gap-1">
        <p class="text-muted-foreground">Reading projects: 1 of 3</p>
        <Progress :model-value="33" aria-label="Projects read" />
      </div>
    </CanvasSection>

    <CanvasSection title="ProjectMark" note="things that need you; not readable; nothing; being read">
      <div class="flex gap-4">
        <ProjectMark
          v-for="p in [
            projects[0]!,
            projects.find((q) => q.state !== 'ready')!,
            projects.find((q) => q.state === 'ready' && q.attention.length === 0)!,
            { id: 'slow-monorepo', state: 'reading' as const },
          ]"
          :key="p.id"
          :project="p"
        />
      </div>
    </CanvasSection>

    <CanvasSection title="ThemeToggle" note="switches the whole page; the icon is the theme it switches to">
      <div><ThemeToggle /></div>
    </CanvasSection>

    <CanvasSection
      title="ProjectCard"
      note="ready with attention and stale housekeeping; nothing needs you; its Jig older than the machine's, Upgrade… offered; each state it cannot be read in; Housekeeping under way, its report, its refusal; a merged task to close, its close under way, Jig's refusal"
    >
      <ProjectCard v-for="project in projects" :key="project.id" :project="project" />
      <ProjectCard v-for="(run, i) in housekeepingRuns" :key="`housekeeping-${i}`" :project="projects[1]!" :housekeeping="run" />
      <ProjectCard :project="closingProject" />
      <ProjectCard v-for="(run, i) in closings" :key="`closing-${i}`" :project="closingProject" :closing="run" />
    </CanvasSection>

    <CanvasSection
      title="UpgradePanel"
      note="on a card: reading the dry run; the plan, with steps by hand; a stop; a refusal; under way; merged, with steps by hand, staged, nothing to do; not started; failed"
    >
      <UpgradePanel v-for="(plan, i) in plans" :key="`plan-${i}`" project="legacy-shop" :run="null" :plan="plan" />
      <UpgradePanel v-for="(run, i) in runs" :key="`run-${i}`" project="legacy-shop" :run="run" :plan="undefined" />
    </CanvasSection>

    <CanvasSection title="BoardFilter" note="Jig's order and no filter; sorted by priority with filters and text on">
      <BoardFilter :model-value="{ sort: 'queue', classes: [], priorities: [], text: '' }" :shown="12" :total="12" />
      <BoardFilter
        :model-value="{ sort: 'priority', classes: ['T1', 'T2'], priorities: ['P0', 'none'], text: 'login' }"
        :shown="3"
        :total="12"
      />
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

    <CanvasSection title="ConnectForm" note="idle, busy, finding, refused">
      <ConnectForm :busy="false" />
      <ConnectForm :busy="true" model-value="/Users/me/project" />
      <ConnectForm :busy="false" :finding="true" model-value="~/code" />
      <ConnectForm
        :busy="false"
        model-value="/Users/me/project/.claude/worktrees/x"
        refusal="That is a worktree. Connect the main checkout instead."
      />
    </CanvasSection>

    <CanvasSection
      title="FoundProjects"
      note="found, one connecting; one refused; nothing to connect, folders skipped, stopped at the limit"
    >
      <FoundProjects
        :result="{ folder: '~', found: [{ path: '~/code/api' }, { path: '~/work/api' }], connected: 1, skipped: [], stopped: false }"
        connecting="~/code/api"
      />
      <FoundProjects
        :result="{
          folder: '~/code',
          found: [{ path: '~/code/a-really-long-folder-name/with/a-project-deep-inside' }],
          connected: 0,
          skipped: [],
          stopped: false,
        }"
        :refusal="{
          path: '~/code/a-really-long-folder-name/with/a-project-deep-inside',
          message: 'There is no Jig in this repository. Run jig init in it first.',
        }"
      />
      <FoundProjects :result="{ folder: '~', found: [], connected: 2, skipped: ['Desktop', 'Documents', 'Downloads'], stopped: true }" />
    </CanvasSection>

    <CanvasSection
      title="AttentionItem"
      note="no link; a pull request; another link; knowledge, on a project's card; a merged task to close, asking, closing"
    >
      <AttentionItem v-for="(item, i) in attention" :key="i" :item="item" />
      <AttentionItem :item="knowledgeAttention" project="acme" />
      <AttentionItem :item="mergedAttention" project="acme" closable />
      <AttentionItem :item="mergedAttention" project="acme" closable asking />
      <AttentionItem :item="mergedAttention" project="acme" closable closing />
    </CanvasSection>

    <CanvasSection title="ColumnHeader" note="each column's title and count">
      <ColumnHeader v-for="column in columns" :key="column.id" :title="column.title" :count="column.count" />
    </CanvasSection>

    <CanvasSection
      title="GroupPanel"
      note="each column's accent, one this page does not know, a lane's, and none — a card in one, an empty one"
    >
      <div class="grid grid-cols-4 gap-3">
        <GroupPanel v-for="column in columns" :key="column.id" :accent="columnAccent[column.id] ?? 'bg-border'">
          <template #head>
            <h3 class="px-3 pt-2.5 pb-1"><ColumnHeader :title="column.title" :count="column.count" /></h3>
          </template>
          <p class="mx-2 mb-2 rounded-lg border bg-card px-3 py-2 text-[13px]">A card</p>
        </GroupPanel>
        <GroupPanel :accent="laneAccent['to-file']">
          <template #head><h3 class="px-3 pt-2.5 pb-1 text-[13px] font-semibold">To file</h3></template>
          <p class="mx-2 mb-2 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">nothing here</p>
        </GroupPanel>
        <GroupPanel>
          <template #head><h3 class="px-4 pt-3 pb-2 text-[15px] font-semibold">A section</h3></template>
          <p class="px-4 pb-4 text-[13px]">No accent: a section of a page.</p>
        </GroupPanel>
      </div>
    </CanvasSection>

    <CanvasSection
      title="QueueMenu"
      note="press to open: To top, Up, Down, To bottom, Priority, the pause — first queued, in the middle, not queued, last, paused under a Jig that cannot resume it (no pause to ask, Resume off), paused and resumable, a pause asked, parked at the staging branch (Take back for a fix), while its change is on its way, on a sorted board (no move), on a filtered board (To top and To bottom at either end of the cards shown)"
    >
      <div class="flex flex-wrap items-center gap-6">
        <span
          v-for="t in [tasks[0]!, tasks[1]!, tasks[3]!, tasks[11]!, tasks[9]!, tasks[13]!, tasks[12]!, tasks[16]!]"
          :key="t.id"
          class="flex items-center gap-1"
        >
          {{ t.id }}<QueueMenu :task="t" :cards="tasks" />
        </span>
        <span class="flex items-center gap-1">{{ tasks[1]!.id }}<QueueMenu :task="tasks[1]!" :cards="tasks" disabled /></span>
        <span class="flex items-center gap-1">{{ tasks[1]!.id }}<QueueMenu :task="tasks[1]!" /></span>
        <span class="flex items-center gap-1">{{ tasks[0]!.id }}<QueueMenu :task="tasks[0]!" :cards="tasks" filtered /></span>
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

    <CanvasSection
      title="FinishedList"
      note="closed with its pull request merged; abandoned; one without a goal; the read under way; none left; a read that failed, with Read again"
    >
      <div class="flex flex-col gap-3">
        <FinishedList :read="{ state: 'ready', tasks: finished }" class="border" />
        <FinishedList class="border" />
        <FinishedList :read="{ state: 'ready', tasks: [] }" class="border" />
        <FinishedList :read="{ id: 'jig-ui', state: 'unreadable', code: 'timeout' }" class="border" />
      </div>
    </CanvasSection>

    <CanvasSection
      title="TaskFacts"
      note="everything a task can carry, in an epic and waiting for two; queued at the top; a task not started"
    >
      <TaskFacts v-for="d in details" :key="d.id" :details="d" class="border-b pb-3" />
    </CanvasSection>

    <CanvasSection title="TaskBrief" note="the facts, the link to the full page and the id to copy; no actions">
      <TaskBrief project="jig-ui" :task="details[1]!.id" :details="details[1]" />
    </CanvasSection>

    <CanvasSection
      title="TaskDocuments"
      note="written, empty, not readable — design open, plan being read; none yet; Jig too old; Jig did not answer; being listed; a document Jig could not read"
    >
      <TaskDocuments :documents="documents" :open="{ design: openDocument, plan: 'reading' }" />
      <TaskDocuments :documents="{ state: 'ready', artifacts: [] }" :open="{}" />
      <TaskDocuments :documents="{ id: 'x', state: 'unsupported', jigVersion: '0.38.1', minimum: '0.39.0' }" :open="{}" />
      <TaskDocuments :documents="{ id: 'x', state: 'unreadable', code: 'timeout' }" :open="{}" />
      <TaskDocuments :open="{}" />
      <TaskDocuments :documents="documents" :open="{ task: { id: 'x', state: 'unreadable', code: 'failed' } }" />
    </CanvasSection>

    <CanvasSection
      title="KnowledgeView"
      note="proposals — a document, a stub, a stub whose file is gone, one accepted and waiting in a pull request; changed sources — a diff read with bytes dropped, one being read, no approved text, a file gone, one kept whose diff Jig could not read; then a decision on its way, and decisions waiting pushed with no pull request"
    >
      <KnowledgeView :knowledge="knowledge" :diffs="knowledgeDiffs" :texts="{}" />
      <KnowledgeView
        :knowledge="{
          ...knowledge,
          proposals: knowledge.proposals.slice(0, 1),
          sources: knowledge.sources.slice(0, 1),
          waiting: { ...knowledge.waiting!, pr: null },
        }"
        :diffs="{}"
        :texts="{}"
        busy="feature-checkout"
        disabled
      />
    </CanvasSection>

    <CanvasSection
      title="KnowledgeView, Jig 0.41.0"
      note="proposals — a feature's text, a stub's with its Markdown file (bytes dropped) and with a file that is not Markdown, one not pushed being read, one after the decisions were cut whose name lost bytes and whose text Jig could not read, one no longer proposed when its text was read; changed sources — Keep and Drop, Drop on a file gone, one dropped and waiting, one changed only here; then a drop on its way"
    >
      <KnowledgeView :knowledge="knowledgeLater" :diffs="{}" :texts="knowledgeTexts" />
      <KnowledgeView
        :knowledge="{ ...knowledgeLater, proposals: [], sources: knowledgeLater.sources.slice(2, 3) }"
        :diffs="{}"
        :texts="{}"
        busy="convention-deploy"
        disabled
      />
    </CanvasSection>

    <CanvasSection title="ActionList" note="Jig's offers, one unknown id; none">
      <ActionList :actions="actions" />
      <ActionList :actions="[]" />
    </CanvasSection>

    <CanvasSection title="CopyButton" note="copy; copy id">
      <div class="flex gap-2">
        <CopyButton text="jig task pause design-system" />
        <CopyButton text="design-system" label="copy id" />
      </div>
    </CanvasSection>

    <CanvasSection title="StateLine" note="read; past the read limit, with Read again; while it reads again; refused; not supported">
      <div class="flex flex-col gap-2">
        <StateLine
          :project="{
            id: 'shop',
            state: 'ready',
            jigVersion: '0.38.1',
            counts: { active: 0, paused: 0, ready: 0 },
            attention: [],
            housekeepingStale: false,
            closable: [],
            revision: 0,
          }"
        />
        <StateLine :project="{ id: 'shop', state: 'unreadable', code: 'timeout' }" />
        <StateLine :project="{ id: 'shop', state: 'unreadable', code: 'timeout' }" reading />
        <StateLine :project="{ id: 'shop', state: 'unreadable', code: 'not-initialised' }" />
        <StateLine :project="{ id: 'shop', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' }" />
      </div>
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

    <CanvasSection
      title="SettingsDialog"
      note="open one: the person's keys of each kind and the project's; saving; a refusal; reading; an old Jig; unreadable"
    >
      <div class="flex flex-wrap gap-2">
        <Button v-for="state in settingStates" :key="state.label" variant="outline" size="xs" @click="settingsOpen = state">{{
          state.label
        }}</Button>
      </div>
    </CanvasSection>
    <SettingsDialog
      v-if="settingsOpen"
      :open="true"
      project="jig-ui"
      :settings="settingsOpen.settings"
      :pending="settingsOpen.pending"
      :notice="settingsOpen.notice"
      @update:open="settingsOpen = undefined"
    />

    <CanvasSection
      title="SpecItemCard"
      note="done with a live task; in work with dependencies; a task no longer live; to file; fog; opened, its rest under the title; changed by a waiting edit; with its roadmap menu"
    >
      <ul class="grid max-w-sm gap-2">
        <SpecItemCard
          v-for="(item, i) in specItems"
          :key="i"
          :item="item"
          project="jig-ui"
          :standing="itemStanding(item, specColumns)"
          :live="item.task !== null && specColumns.has(item.task)"
          :open="false"
        />
        <SpecItemCard :item="specItems[1]!" project="jig-ui" :standing="itemStanding(specItems[1]!, specColumns)" live open />
        <SpecItemCard
          :item="specItems[3]!"
          project="jig-ui"
          :standing="itemStanding(specItems[3]!, specColumns)"
          :live="false"
          :open="false"
          waiting
        />
        <SpecItemCard
          :item="specItems[3]!"
          project="jig-ui"
          :standing="itemStanding(specItems[3]!, specColumns)"
          :live="false"
          :open="false"
        >
          <template #menu><SpecItemMenu :items="specItems" :index="3" :phase="1" :phases="[0, 1, 2]" /></template>
        </SpecItemCard>
      </ul>
    </CanvasSection>

    <CanvasSection
      title="SpecItemMenu"
      note="press to open: Up, Down, To Phase N, File task… — the first item (no Up), the second (Up to the top), one with no task (File task…), the last (no Down), alone in the only phase (nothing to move it by), while an edit is on its way"
    >
      <div class="flex flex-wrap items-center gap-6">
        <span v-for="i in [0, 1, 3, 4]" :key="i" class="flex items-center gap-1"
          >item {{ i + 1 }}<SpecItemMenu :items="specItems" :index="i" :phase="1" :phases="[0, 1, 2]"
        /></span>
        <span class="flex items-center gap-1">alone<SpecItemMenu :items="[specItems[3]!]" :index="0" :phase="1" :phases="[1]" /></span>
        <span class="flex items-center gap-1"
          >item 2<SpecItemMenu :items="specItems" :index="1" :phase="1" :phases="[0, 1, 2]" disabled
        /></span>
      </div>
    </CanvasSection>

    <CanvasSection title="FileItemDialog" note="open one; type the id of a live task (design-system) to see the goal go">
      <div class="flex flex-wrap gap-2">
        <Button v-for="state in filingStates" :key="state.label" variant="outline" size="xs" @click="filingOpen = state">{{
          state.label
        }}</Button>
      </div>
    </CanvasSection>
    <FileItemDialog
      v-if="filingOpen"
      :open="true"
      spec="jig-ui"
      :item="specItems[3]!"
      :live="['design-system', 'specs-and-epics']"
      :busy="filingOpen.busy"
      :refusal="filingOpen.refusal"
      :taken="filingOpen.taken"
      @update:open="filingOpen = undefined"
    />

    <CanvasSection
      title="SpecBoard"
      note="no epic, opened on the first phase with work left; an open epic in the queue at P1, with its queue menu; a lost epic branch, not queued, with its change on its way; missing files"
    >
      <div class="flex flex-col gap-10">
        <SpecBoard
          v-for="spec in specs"
          :key="spec.id"
          :spec="spec"
          project="jig-ui"
          :columns="specColumns"
          :busy="spec.id === 'lost-epic'"
        >
          <template v-if="spec.epic?.state === 'open'" #menu>
            <EpicMenu :spec="spec" :specs="specs" :disabled="spec.id === 'lost-epic'" />
          </template>
        </SpecBoard>
      </div>
    </CanvasSection>

    <CanvasSection
      title="SpecBoard, editable"
      note="its roadmap edited from the page (Jig 0.40.0): each item's menu, Up and Down among its lane, and Add item under the lanes of a numbered phase — none before the first; edits waiting on the spec's branch committed only, pushed, in a pull request, the roadmap there with the items they changed marked; while an edit is on its way"
    >
      <div class="flex flex-col gap-10">
        <SpecBoard :spec="specs[1]!" project="jig-ui" :columns="new Map()" editable />
        <SpecBoard v-for="spec in waitingSpecs" :key="spec.id" :spec="spec" project="jig-ui" :columns="specColumns" editable />
        <SpecBoard :spec="specs[0]!" project="jig-ui" :columns="specColumns" editable busy disabled />
      </div>
    </CanvasSection>
  </div>
</template>
