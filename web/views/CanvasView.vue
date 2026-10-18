<script setup lang="ts">
// The maintainer's page of every component in every variant and state, light and dark side by
// side. A component added to components/ or components/ui/ gets a section here.
import { Copy } from '@lucide/vue';
import ActionList from '@/components/ActionList.vue';
import AttentionItem from '@/components/AttentionItem.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import ConnectForm from '@/components/ConnectForm.vue';
import CopyCommand from '@/components/CopyCommand.vue';
import ProjectCard from '@/components/ProjectCard.vue';
import ProgressBar from '@/components/ProgressBar.vue';
import ProjectTabs from '@/components/ProjectTabs.vue';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toneRule, toneText } from '@/lib/tones';
import CanvasSection from './CanvasSection.vue';
import { actions, attention, columns, details, projects, specItems, specs, tasks } from './canvas-samples';

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
      note="ready with attention and stale housekeeping; nothing needs you; each state it cannot be read in"
    >
      <ProjectCard v-for="project in projects" :key="project.id" :project="project" />
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

    <CanvasSection title="TaskCard" note="every note a card carries; open with details, while reading, unreadable">
      <div class="grid grid-cols-2 gap-2 xl:grid-cols-3">
        <TaskCard v-for="task in tasks" :key="task.id" project="jig-ui" :task="task" :open="false" />
        <TaskCard project="jig-ui" :task="tasks[2]!" :open="true" :details="details[0]" />
        <TaskCard project="jig-ui" :task="tasks[0]!" :open="true" />
        <TaskCard project="jig-ui" :task="tasks[1]!" :open="true" details="unavailable" />
      </div>
    </CanvasSection>

    <CanvasSection title="TaskRow" note="each note; selected">
      <div>
        <TaskRow v-for="(task, i) in tasks" :key="task.id" :task="task" :selected="i === 2" />
      </div>
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
      note="no epic, a finished phase folded; an open epic as of the last fetch; a lost epic branch; missing files"
    >
      <SpecCard v-for="spec in specs" :key="spec.id" :spec="spec" project="jig-ui" :live="['design-system', 'specs-and-epics']" />
    </CanvasSection>
  </div>
</template>
