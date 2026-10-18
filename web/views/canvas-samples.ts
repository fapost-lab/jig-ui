// Sample data for the canvas: every state a component shows, in the shapes of api.ts.
import type { Attention, Column, Project, ReadyDetails, Spec, SpecItem, Task } from '@/api';

const task = (id: string, more: Partial<Task>): Task => ({
  id,
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  ...more,
});

const pr = (state: string | null, ci: string | null) => ({
  url: 'https://github.com/fapost-lab/jig-ui/pull/18',
  state,
  ci,
  fetchedAt: '2026-10-18T09:40:00Z',
});

/** One task for each note a card can carry, and one with none. */
export const tasks: Task[] = [
  task('design-system', {
    class: 'T3',
    gate: 'waiting',
    goal: 'shadcn-vue on Tailwind v4 with light and dark themes; #/canvas with every component in every variant; the three screens rebuilt on it.',
  }),
  task('registry-schema', { gate: 'changed', goal: 'Version the registry file so a newer Jig UI can read an older one.' }),
  task('pause-request', {
    class: 'T3',
    autopilot: 'stopped',
    goal: 'A drop on the paused column writes a sticky request through Jig; the card shows it with its age and a cancel.',
  }),
  task('specs-and-epics', {
    autopilot: 'on',
    goal: "Show each spec with its phases, progress and epic branch beside the board, from Jig's spec list.",
  }),
  task('task-details', { status: 'ready', pullRequest: pr('open', 'green'), goal: "Open a task's details from its card." }),
  task('refusal-fixture', {
    class: 'T0',
    status: 'ready',
    pullRequest: pr('open', 'red'),
    goal: 'Replace the refusal text in task-list-states.json with one Jig prints.',
  }),
  task('docs-board', {
    class: 'T1',
    status: 'ready',
    pullRequest: pr('open', 'pending'),
    goal: 'Describe the five columns on the projects page of the docs.',
  }),
  task('live-updates', { status: 'ready', pullRequest: pr('merged', 'none'), goal: 'Follow connected projects without a reload.' }),
  task('no-pr-yet', { class: 'T1', status: 'ready', goal: 'Ready, nothing pushed.' }),
  task('jig-init-hook', { class: 'T3', paused: true, goal: 'Register a project in an installed Jig UI from jig init.' }),
  task('file-backlog-task', { class: null, started: false, goal: 'File a minimal backlog task from the page through jig task new.' }),
  task('a-task-with-a-rather-long-identifier-that-wraps', { goal: null }),
];

/** The samples placed as the board places them: every column with cards. */
export const board: Column[] = [
  { id: 'needs-you', title: 'Needs you', cards: tasks.slice(0, 3) },
  { id: 'in-progress', title: 'In progress', cards: [tasks[3]!, tasks[11]!] },
  { id: 'ready', title: 'Ready', cards: tasks.slice(4, 9) },
  { id: 'backlog', title: 'Backlog', cards: [tasks[10]!] },
  { id: 'paused', title: 'Paused', cards: [tasks[9]!] },
];

/** A board with no live task. */
export const emptyBoard: Column[] = board.map((c) => ({ ...c, cards: [] }));

export const columns = [
  { id: 'needs-you', title: 'Needs you', count: 3 },
  { id: 'in-progress', title: 'In progress', count: 1 },
  { id: 'ready', title: 'Ready', count: 5 },
  { id: 'backlog', title: 'Backlog', count: 1 },
  { id: 'paused', title: 'Paused', count: 1 },
  { id: 'unknown', title: 'A column this page does not know', count: 0 },
];

export const attention: Attention[] = [
  {
    kind: 'gate',
    subject: { type: 'task', id: 'design-system' },
    tasks: ['design-system'],
    title: 'Design waits at its gate',
    detail: null,
    todo: 'Review the design and approve it: jig task gate design-system approved',
    url: null,
  },
  {
    kind: 'pull-request-ci-failed',
    subject: { type: 'task', id: 'refusal-fixture' },
    tasks: ['refusal-fixture'],
    title: 'CI failed',
    detail: 'pull request #19',
    todo: 'Look at the failing check.',
    url: 'https://github.com/fapost-lab/jig-ui/pull/19',
  },
  {
    kind: 'housekeeping',
    subject: { type: 'project', id: null },
    tasks: [],
    title: 'Housekeeping never ran',
    detail: null,
    todo: 'Run jig housekeeping.',
    url: 'https://example.com/docs',
  },
];

export const actions = [
  { id: 'approve-gate', command: 'jig task gate design-system approved' },
  { id: 'answer-stop', command: 'jig task autopilot pause-request resume --answer <text>' },
  { id: 'pause', command: 'jig task pause design-system' },
  { id: 'something-new', command: 'jig task something-new design-system' },
];

const base = {
  state: 'ready' as const,
  issue: null,
  baseBranch: 'main',
  createdAt: '2026-10-17',
  updatedAt: '2026-10-18',
  knowledgeConsolidated: false,
  worktree: null,
  gateBy: null,
  run: null,
  housekeepingFlags: [],
  attention: [],
};

/** Details with everything a task can carry, and with as little as a task not started. */
export const details: ReadyDetails[] = [
  {
    ...base,
    ...tasks[2]!,
    gate: 'approved',
    gateBy: 'human',
    branch: 'task/pause-request',
    worktree: { uncommitted: 4 },
    issue: '#42',
    pullRequest: pr('open', 'red'),
    run: {
      mode: 'attended',
      stage: 'implement',
      stageAt: '2026-10-18T09:00:00Z',
      stopReason: 'Which column takes a paused task that already has an open pull request?',
      stopAt: '2026-10-18T09:12:00Z',
      phase: null,
    },
    housekeepingFlags: ['needs-consolidation'],
    attention: [attention[0]!],
    actions,
    column: { id: 'needs-you', title: 'Needs you' },
  },
  {
    ...base,
    ...tasks[10]!,
    branch: null,
    actions: [{ id: 'start', command: 'jig task start file-backlog-task' }],
    column: { id: 'backlog', title: 'Backlog' },
  },
];

const ready = (id: string, more: Partial<Extract<Project, { state: 'ready' }>> = {}): Project => ({
  id,
  state: 'ready',
  jigVersion: '0.29.0',
  counts: { active: 11, paused: 1, ready: 3 },
  attention: [],
  housekeepingStale: false,
  ...more,
});

/** A project in each state the workspace shows. */
export const projects: Project[] = [
  ready('jig-ui', { attention, housekeepingStale: true }),
  ready('nextjs-store', { counts: { active: 0, paused: 0, ready: 0 } }),
  { id: 'old-jig', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' },
  { id: 'new-jig', state: 'incompatible', jigVersion: '1.0.0' },
  { id: 'busy', state: 'unreadable', code: 'locked' },
  { id: 'moved', state: 'unavailable', reason: 'missing' },
];

export const specItems: SpecItem[] = [
  { text: '`design-system` — design system and canvas', checked: true, task: 'design-system', fog: false },
  {
    text: '`specs-and-epics` — specs and epics (after: project board — `jig spec list`)',
    checked: false,
    task: 'specs-and-epics',
    fog: false,
  },
  { text: '`old-task` — a task no longer live', checked: false, task: 'old-task', fog: false },
  { text: 'invoices from orders, no task filed yet', checked: false, task: null, fog: false },
  { text: 'fog: registration by `jig init`', checked: false, task: null, fog: true },
];

export const specs: Spec[] = [
  {
    id: 'jig-ui',
    title: 'Jig UI — a local control center for Jig projects',
    missingFiles: [],
    release: null,
    epic: null,
    progress: { done: 2, total: 6, filed: 2, fog: 1 },
    phases: [
      {
        phase: 0,
        title: 'Package and release',
        done: 1,
        total: 1,
        filed: 0,
        fog: 0,
        items: [{ ...specItems[0]!, text: 'package and release', task: null }],
      },
      { phase: 1, title: 'Read-only UI', done: 1, total: 5, filed: 2, fog: 1, items: specItems },
    ],
  },
  {
    id: 'billing',
    title: 'Billing in one place',
    missingFiles: [],
    release: 'minor',
    epic: { branch: 'epic/billing', state: 'open', checkedOut: false, missing: false, fetched: true },
    progress: { done: 0, total: 1, filed: 0, fog: 0 },
    phases: [{ phase: null, title: null, done: 0, total: 1, filed: 0, fog: 0, items: [specItems[3]!] }],
  },
  {
    id: 'lost-epic',
    title: 'An epic whose branch is gone',
    missingFiles: [],
    release: 'major',
    epic: { branch: 'epic/lost', state: 'open', checkedOut: true, missing: true, fetched: false },
    progress: null,
    phases: [],
  },
  { id: 'half-written', title: null, missingFiles: ['spec.md', 'roadmap.md'], release: null, epic: null, progress: null, phases: [] },
];
