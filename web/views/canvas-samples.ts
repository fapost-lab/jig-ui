// Sample data for the canvas: every state a component shows, in the shapes of api.ts.
import type {
  Attention,
  Column,
  DocumentText,
  Project,
  ReadyDetails,
  ReadyKnowledge,
  SourceDiff,
  Setting,
  Settings,
  Spec,
  SpecItem,
  Task,
  TaskArtifact,
  TaskArtifacts,
  UpgradePlan,
} from '@/api';
import type { FinishedTask } from '@/lib/finished';
import type { HousekeepingState } from '@/lib/projects';
import type { PlanState, UpgradeRun } from '@/lib/upgrade';

const task = (id: string, more: Partial<Task>): Task => ({
  id,
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  pauseRequest: null,
  pauseRequestable: true,
  resumable: false,
  closable: false,
  resumesTo: null,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  priority: null,
  queue: null,
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
    priority: 0,
    queue: { level: null, position: 100 },
    goal: 'shadcn-vue on Tailwind v4 with light and dark themes; #/canvas with every component in every variant; the three screens rebuilt on it.',
  }),
  task('registry-schema', {
    gate: 'changed',
    priority: 3,
    queue: { level: null, position: 200 },
    goal: 'Version the registry file so a newer Jig UI can read an older one.',
  }),
  task('pause-request', {
    class: 'T3',
    autopilot: 'stopped',
    goal: 'A drop on the paused column writes a sticky request through Jig; the card shows it with its age and a cancel.',
  }),
  task('specs-and-epics', {
    autopilot: 'on',
    queue: { level: null, position: 300 },
    goal: "Show each spec with its phases, progress and epic branch beside the board, from Jig's spec list.",
  }),
  task('task-details', { status: 'ready', closable: true, pullRequest: pr('open', 'green'), goal: "Open a task's details from its card." }),
  task('refusal-fixture', {
    class: 'T0',
    status: 'ready',
    pullRequest: pr('open', 'red'),
    goal: 'Replace the refusal text in task-list-states.json with one Jig prints.',
  }),
  task('docs-board', {
    class: 'T1',
    status: 'ready',
    closable: true,
    pullRequest: pr('open', 'pending'),
    goal: 'Describe the five columns on the projects page of the docs.',
  }),
  task('live-updates', {
    status: 'ready',
    closable: true,
    pullRequest: pr('merged', 'none'),
    goal: 'Follow connected projects without a reload.',
  }),
  task('no-pr-yet', { class: 'T1', status: 'ready', goal: 'Ready, nothing pushed.' }),
  task('jig-init-hook', {
    class: 'T3',
    paused: true,
    pauseRequestable: false,
    goal: 'Register a project in an installed Jig UI from jig init.',
  }),
  task('file-backlog-task', { class: null, started: false, goal: 'File a minimal backlog task from the page through jig task new.' }),
  task('a-task-with-a-rather-long-identifier-that-wraps', { goal: null }),
  task('conflict-display', {
    pauseRequest: { requestedAt: '2026-10-22T09:00:00Z' },
    pauseRequestable: false,
    goal: 'Show what changed when a write was based on a stale read.',
  }),
  task('resume-from-page', {
    class: 'T3',
    paused: true,
    pauseRequestable: false,
    resumable: true,
    resumesTo: 'in-progress',
    goal: 'A drop out of Paused, or the card menu, resumes the task through jig task resume.',
  }),
];

/** The samples placed as the board places them: every column with cards. */
export const board: Column[] = [
  { id: 'needs-you', title: 'Needs you', cards: tasks.slice(0, 3) },
  { id: 'in-progress', title: 'In progress', cards: [tasks[3]!, tasks[12]!, tasks[11]!] },
  { id: 'ready', title: 'Ready', cards: tasks.slice(4, 9) },
  { id: 'backlog', title: 'Backlog', cards: [tasks[10]!] },
  { id: 'paused', title: 'Paused', cards: [tasks[9]!, tasks[13]!] },
];

/** A board with no live task. */
export const emptyBoard: Column[] = board.map((c) => ({ ...c, cards: [] }));

/** Closed with its pull request merged, abandoned with none, and one without a goal. */
export const finished: FinishedTask[] = [
  {
    id: 'file-backlog-task',
    status: 'consolidated',
    goal: 'File a minimal backlog task from the page.',
    updatedAt: '2026-10-25',
    pullRequest: { url: 'https://github.com/fapost-lab/jig-ui/pull/40', state: 'merged' },
  },
  { id: 'pr-template', status: 'abandoned', goal: 'A pull request template.', updatedAt: '2026-10-17', pullRequest: null },
  { id: 'old-spike', status: 'abandoned', goal: null, updatedAt: '2026-10-12', pullRequest: null },
];

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
    versions: null,
  },
  {
    kind: 'pull-request-ci-failed',
    subject: { type: 'task', id: 'refusal-fixture' },
    tasks: ['refusal-fixture'],
    title: 'CI failed',
    detail: 'pull request #19',
    todo: 'Look at the failing check.',
    url: 'https://github.com/fapost-lab/jig-ui/pull/19',
    versions: null,
  },
  {
    kind: 'housekeeping',
    subject: { type: 'project', id: null },
    tasks: [],
    title: 'Housekeeping never ran',
    detail: null,
    todo: 'Run jig housekeeping.',
    url: 'https://example.com/docs',
    versions: null,
  },
];

export const actions = [
  { id: 'approve-gate', command: 'jig task gate design-system approved' },
  { id: 'answer-stop', command: 'jig task autopilot pause-request resume --answer <text>' },
  { id: 'pause', command: 'jig task pause design-system' },
  { id: 'request-pause', command: 'jig queue request task:design-system pause' },
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
  place: null,
  dependsOn: [],
};

/** Details with everything a task can carry, one queued at the top, and one with as little as a task not started. */
export const details: ReadyDetails[] = [
  {
    ...base,
    ...tasks[2]!,
    priority: 1,
    queue: { level: 'epic:booking', position: 200 },
    place: { rank: 2, of: 3 },
    dependsOn: [
      { on: 'task:design-system', reason: 'Its card takes the new tokens', through: null },
      { on: 'epic:refunds', reason: 'A refund pauses the booking', through: 'epic:booking' },
    ],
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
    ...tasks[1]!,
    place: { rank: 2, of: 4 },
    branch: 'task/registry-schema',
    actions: [{ id: 'pause', command: 'jig task pause registry-schema' }],
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
  upgrade: null,
  ...more,
});

/** A project in each state the workspace shows. */
export const projects: Project[] = [
  ready('jig-ui', { attention, housekeepingStale: true }),
  ready('nextjs-store', { counts: { active: 0, paused: 0, ready: 0 } }),
  ready('legacy-shop', {
    jigVersion: '0.34.0',
    counts: { active: 2, paused: 0, ready: 0 },
    attention: [
      {
        kind: 'upgrade-available',
        subject: { type: 'project', id: null },
        tasks: [],
        title: 'Jig in this project is older than on this machine',
        detail: 'this project runs 0.34.0; this machine has 0.35.0',
        todo: 'jig upgrade',
        url: null,
        versions: { from: '0.34.0', to: '0.35.0' },
      },
    ],
  }),
  { id: 'old-jig', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0', upgrade: null },
  { id: 'new-jig', state: 'incompatible', jigVersion: '1.0.0', upgrade: null },
  { id: 'busy', state: 'unreadable', code: 'locked', upgrade: null },
  { id: 'moved', state: 'unavailable', reason: 'missing', upgrade: null },
];

const plan: UpgradePlan = { mode: 'copy', from: '0.34.0', to: '0.35.0', outcome: 'planned', git: null, manualSteps: [], wouldStop: [] };

/** Housekeeping from a card: under way, Jig's report as it printed it, Jig's refusal with its reasons. */
export const housekeepingRuns: HousekeepingState[] = [
  { state: 'running' },
  {
    state: 'done',
    report: [
      'needs you (1):',
      '  merged but not consolidated, run jig-consolidate: release-0-6-0',
      'removed (2): moved to …, recoverable for 7 days',
      '  quiet-design-nits, quiet-design',
      'housekeeping: deleted branch task/quiet-design',
    ],
  },
  { state: 'refused', message: "Jig's housekeeping failed.", reasons: ['housekeeping.trash_ttl: not a duration'] },
];

/** The upgrade panel before a run: reading the dry run, its plan with and without steps by hand, a stop, a refusal. */
export const plans: PlanState[] = [
  { state: 'reading' },
  { state: 'planned', plan },
  { state: 'planned', plan: { ...plan, manualSteps: ['Restart your agent sessions: the skills changed.'] } },
  {
    state: 'planned',
    plan: {
      ...plan,
      wouldStop: [
        'the working tree has uncommitted changes; commit them, stash them (`git stash`), or finish the task they belong to, then run `jig upgrade` again',
      ],
    },
  },
  { state: 'refused', message: 'Jig refused the upgrade.' },
  {
    state: 'refused',
    message: 'Jig refused the upgrade.',
    reasons: ['cannot determine the framework source root; pass --from <dir>'],
  },
];

const git = {
  level: 'pr',
  branch: 'jig/upgrade-0.35.0',
  commit: '279390b',
  pushed: true,
  pullRequest: 'https://github.com/fapost-lab/jig-ui/pull/49',
  merged: false,
};
const done = (more: Partial<UpgradePlan>): UpgradeRun => ({
  state: 'done',
  at: '2026-10-27T08:00:00Z',
  upgrade: { ...plan, outcome: 'upgraded', git, ...more },
});

/** An upgrade under way, and what one can come to. */
export const runs: UpgradeRun[] = [
  { state: 'running', since: new Date(Date.now() - 120_000).toISOString(), to: '0.35.0' },
  done({ git: { ...git, merged: true } }),
  done({ manualSteps: ['Restart your agent sessions: the skills changed.'] }),
  done({ outcome: 'staged', git: { ...git, level: 'none', commit: null, pushed: false, pullRequest: null } }),
  done({ outcome: 'nothing-to-do', git: null }),
  {
    state: 'refused',
    at: '2026-10-27T08:00:00Z',
    code: 'upgrade-blocked',
    reasons: [
      'task up-x is started and its branch task/up-x is checked out here (record .ai/runtime/working/up-x); the upgrade would take this checkout off it',
    ],
  },
  { state: 'refused', at: '2026-10-27T08:00:00Z', code: 'failed', reasons: [] },
  {
    state: 'refused',
    at: '2026-10-27T08:00:00Z',
    code: 'failed',
    reasons: ['cannot determine the framework source root; pass --from <dir>'],
  },
];

export const specItems: SpecItem[] = [
  { id: 'i-0a1b2c3d4e5f', text: '`design-system` — design system and canvas', checked: true, task: 'design-system', fog: false },
  {
    id: 'i-1b2c3d4e5f60',
    text: '`specs-and-epics` — specs and epics (after: project board — `jig spec list`)',
    checked: false,
    task: 'specs-and-epics',
    fog: false,
  },
  { id: 'i-2c3d4e5f6071', text: '`old-task` — a task no longer live', checked: false, task: 'old-task', fog: false },
  { id: 'i-3d4e5f607182', text: 'invoices from orders, no task filed yet', checked: false, task: null, fog: false },
  { id: 'i-4e5f60718293', text: 'fog: registration by `jig init`', checked: false, task: null, fog: true },
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
        items: [{ ...specItems[0]!, id: 'i-5f6071829304', text: 'package and release', task: null }],
      },
      { phase: 1, title: 'Read-only UI', done: 1, total: 5, filed: 2, fog: 1, items: specItems },
    ],
    waiting: null,
    queue: null,
  },
  {
    id: 'billing',
    title: 'Billing in one place',
    missingFiles: [],
    release: 'minor',
    epic: { branch: 'epic/billing', state: 'open', checkedOut: false, missing: false, fetched: true },
    progress: { done: 0, total: 1, filed: 0, fog: 0 },
    phases: [{ phase: null, title: null, done: 0, total: 1, filed: 0, fog: 0, items: [specItems[3]!] }],
    waiting: null,
    queue: { position: 100, priority: 1 },
  },
  {
    id: 'lost-epic',
    title: 'An epic whose branch is gone',
    missingFiles: [],
    release: 'major',
    epic: { branch: 'epic/lost', state: 'open', checkedOut: true, missing: true, fetched: false },
    progress: null,
    phases: [],
    waiting: null,
    queue: null,
  },
  {
    id: 'half-written',
    title: null,
    missingFiles: ['spec.md', 'roadmap.md'],
    release: null,
    epic: null,
    progress: null,
    phases: [],
    waiting: null,
    queue: null,
  },
];

/**
 * A spec with edits waiting on its branch, in each state they reach: committed only, pushed, in a pull request. On the
 * branch the fog item moved to Phase 2, an item was added and one was filed.
 */
const shop = specs[0]!;
const onBranch: Spec['phases'] = [
  { ...shop.phases[0]!, items: [...shop.phases[0]!.items, { ...specItems[3]!, id: 'i-60718293a4b5', text: 'refunds by card' }] },
  {
    ...shop.phases[1]!,
    items: [specItems[0]!, specItems[1]!, specItems[2]!, { ...specItems[3]!, text: '`invoices` — invoices from orders', task: 'invoices' }],
  },
  { phase: 2, title: 'Writes', done: 0, total: 0, filed: 0, fog: 1, items: [specItems[4]!] },
];
const waiting = { branch: 'spec/jig-ui', base: 'main', commits: 3, progress: shop.progress, phases: onBranch };
export const waitingSpecs: Spec[] = [
  { ...shop, id: 'committed', waiting: { ...waiting, pushed: false, pr: null } },
  { ...shop, id: 'pushed', waiting: { ...waiting, pushed: true, pr: null } },
  { ...shop, id: 'in-review', waiting: { ...waiting, pushed: true, pr: 'https://github.com/fapost-lab/jig-ui/pull/116' } },
];

/** Open epics in the order the Specs view shows them: three queued, one not yet. */
export const epics: Spec[] = [
  specs[1]!,
  { ...specs[1]!, id: 'refunds', title: 'Refunds', queue: { position: 200, priority: null } },
  { ...specs[1]!, id: 'exports', title: 'Exports', queue: { position: 300, priority: 4 } },
  { ...specs[1]!, id: 'payouts', title: 'Payouts', queue: null },
];

const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

/** A task's documents: written ones, an empty one, one Jig cannot read. */
export const documents: TaskArtifacts = {
  state: 'ready',
  artifacts: [
    { kind: 'task', state: 'present', reason: null, updatedAt: hourAgo, bytes: 1749 },
    { kind: 'design', state: 'present', reason: null, updatedAt: hourAgo, bytes: 5288 },
    { kind: 'plan', state: 'present', reason: null, updatedAt: hourAgo, bytes: 2140 },
    { kind: 'verification', state: 'empty', reason: null, updatedAt: hourAgo, bytes: 0 },
    { kind: 'handoff', state: 'unavailable', reason: 'outside workspace', updatedAt: null, bytes: null },
  ],
};

/** The design open, as Markdown with what a document carries: headings, a list, code, a table, a quote. */
export const openDocument: TaskArtifact = {
  state: 'ready',
  kind: 'design',
  updatedAt: hourAgo,
  bytes: 5288,
  content: [
    '# Design — task-artifacts',
    '',
    '## What changes',
    '',
    "A task's full details page gets a **Documents** section, each one opened on a click.",
    '',
    '- `readArtifacts(root, task)` runs `jig task artifacts <task> --json`',
    '- `readArtifact(root, task, kind)` runs `jig task artifact read <task> <kind> --json`',
    '',
    '```ts',
    "export const ARTIFACTS_JIG_VERSION = '0.39.0';",
    '```',
    '',
    '| state | listed |',
    '| --- | --- |',
    '| present | yes |',
    '| missing | no |',
    '',
    '> A document shows the paths its authors wrote.',
  ].join('\n'),
};

const setting = (key: string, more: Partial<Setting>): Setting => ({
  key,
  value: null,
  set: false,
  source: 'default',
  scope: 'local only',
  kind: 'text',
  allowed: null,
  default: null,
  description: `What ${key} sets.`,
  secret: false,
  ...more,
});

/** One key of each kind and source, the token set, and the project's keys, as Jig 0.40.0 lists them. */
const settingKeys: Setting[] = [
  setting('profiles', { scope: 'project', source: 'project', kind: 'list', value: '[node]', set: true, default: '[generic]' }),
  setting('forge', {
    scope: 'project',
    source: 'project',
    kind: 'choice',
    value: 'github',
    set: true,
    allowed: ['auto', 'github', 'gitlab', 'none'],
    default: 'auto',
  }),
  setting('housekeeping.cadence', { scope: 'local', source: 'project', kind: 'duration', value: '1d', set: true, default: '1d' }),
  setting('agent.git', {
    source: 'local',
    kind: 'choice',
    value: 'pr',
    set: true,
    allowed: ['none', 'commit', 'push', 'pr', 'merge'],
    default: 'none',
  }),
  setting('autopilot.unattended', { kind: 'boolean', value: 'false', allowed: ['true', 'false'], default: 'false' }),
  setting('agent.ci_timeout', { kind: 'number', value: '30', default: '30' }),
  setting('claude.review_model', {}),
  setting('notify.telegram.token', { source: 'local', set: true, secret: true }),
];
const readSettings: Settings = { state: 'ready', keys: settingKeys, revision: 1 };

/** The settings dialog in each of its states. */
export const settingStates: {
  label: string;
  settings?: Settings;
  pending?: string;
  notice?: string;
}[] = [
  { label: 'ready', settings: readSettings },
  { label: 'saving', settings: readSettings, pending: 'agent.git' },
  {
    label: 'refused',
    settings: readSettings,
    notice: "Jig did not change housekeeping.cadence: invalid value 'soon': not a whole number of days (e.g. 1d, 3d)",
  },
  { label: 'reading' },
  { label: 'old Jig', settings: { id: 'jig-ui', state: 'unsupported', jigVersion: '0.39.0', minimum: '0.40.0' } },
  { label: 'unreadable', settings: { id: 'jig-ui', state: 'unreadable', code: 'timeout' } },
];

/** What a record of Jig 0.40.0 reads for the fields Jig 0.41.0 added. */
const older = { decidable: null, reason: null, lossy: null };

/** Knowledge Jig 0.40.0 lists as waiting for a decision: a proposal, stubs whose file is there and gone, decisions waiting, each state of a linked file. */
export const knowledge: ReadyKnowledge = {
  state: 'ready',
  revision: 1,
  canRead: false,
  canDrop: false,
  proposals: [
    {
      id: 'feature-checkout',
      type: 'feature',
      domains: ['shop'],
      path: '.ai/knowledge/features/checkout.md',
      paths: ['src/checkout/**', 'src/cart/**'],
      summary: 'How checkout takes a card payment',
      source: null,
      bytes: null,
      waiting: null,
      ...older,
    },
    {
      id: 'convention-coding-style',
      type: 'convention',
      domains: [],
      path: '.ai/knowledge/sources/coding-style.md',
      paths: [],
      summary: null,
      source: 'docs/style.md',
      bytes: 2310,
      waiting: null,
      ...older,
    },
    {
      id: 'convention-ops',
      type: 'convention',
      domains: [],
      path: '.ai/knowledge/sources/ops.md',
      paths: [],
      summary: null,
      source: 'docs/ops.md',
      bytes: null,
      waiting: null,
      ...older,
    },
    {
      id: 'adr-20261106-payments-provider',
      type: 'adr',
      domains: [],
      path: '.ai/knowledge/adr/20261106-payments-provider.md',
      paths: ['src/payments/**'],
      summary: 'Card payments go through one provider',
      source: null,
      bytes: null,
      waiting: { decision: 'accepted', pr: 'https://github.com/fapost-lab/acme/pull/12' },
      ...older,
    },
  ],
  sources: [
    { id: 'convention-team-rules', state: 'changed', source: 'docs/rules.md', bytes: 106, waiting: null, ...older },
    { id: 'convention-release', state: 'changed', source: 'docs/release.md', bytes: 3400, waiting: null, ...older },
    { id: 'convention-legacy', state: 'unrecorded', source: 'docs/legacy.md', bytes: 800, waiting: null, ...older },
    { id: 'convention-deploy', state: 'missing', source: 'docs/deploy.md', bytes: null, waiting: null, ...older },
    {
      id: 'convention-review',
      state: 'changed',
      source: 'docs/review.md',
      bytes: 512,
      waiting: { decision: 'reviewed', pr: null },
      ...older,
    },
  ],
  waiting: { branch: 'knowledge/decisions', base: 'main', pushed: true, pr: 'https://github.com/fapost-lab/acme/pull/12' },
};

/** Open diffs of the linked files: one read (a line not UTF-8 dropped), one being read, one Jig could not read. */
export const knowledgeDiffs: Record<string, SourceDiff | 'reading'> = {
  'convention-team-rules': {
    state: 'ready',
    diff: '--- docs/rules.md (approved)\n+++ docs/rules.md\n@@ -1,4 +1,5 @@\n # Team rules\n \n - Review every change.\n-- Ship on green.\n+- Ship on green, after CI on Windows too.\n+- Never on a Friday.\n',
    lossy: true,
  },
  'convention-release': 'reading',
  'convention-review': { id: 'acme', state: 'unreadable', code: 'failed' },
};

/** What Jig 0.41.0 reads of each record a decision can be sent on now. */
const judged = { decidable: true, reason: null, lossy: false };

/**
 * Knowledge Jig 0.41.0 lists: proposals whose text can be read — one not pushed, one that reached the base after the
 * decisions were cut, one whose file name lost bytes, one Jig no longer lists by the time its text is read —, and linked files that can be dropped, one dropped and waiting, one
 * changed only here.
 */
export const knowledgeLater: ReadyKnowledge = {
  state: 'ready',
  revision: 1,
  canRead: true,
  canDrop: true,
  proposals: [
    {
      id: 'feature-checkout',
      type: 'feature',
      domains: ['shop'],
      path: '.ai/knowledge/features/checkout.md',
      paths: ['src/checkout/**'],
      summary: 'How checkout takes a card payment',
      source: null,
      bytes: null,
      waiting: null,
      ...judged,
    },
    {
      id: 'convention-coding-style',
      type: 'convention',
      domains: [],
      path: '.ai/knowledge/sources/coding-style.md',
      paths: [],
      summary: null,
      source: 'docs/style.md',
      bytes: 26,
      waiting: null,
      ...judged,
    },
    {
      id: 'convention-build',
      type: 'convention',
      domains: [],
      path: '.ai/knowledge/sources/build.md',
      paths: [],
      summary: null,
      source: 'Makefile',
      bytes: 31,
      waiting: null,
      ...judged,
    },
    {
      id: 'feature-search',
      type: 'feature',
      domains: [],
      path: '.ai/knowledge/features/search.md',
      paths: ['src/search/**'],
      summary: null,
      source: null,
      bytes: null,
      waiting: null,
      decidable: false,
      reason: 'not-on-base',
      lossy: false,
    },
    {
      id: 'feature-billing',
      type: 'feature',
      domains: [],
      path: '.ai/knowledge/features/billing.md',
      paths: ['src/billing/**'],
      summary: 'How invoices are issued',
      source: null,
      bytes: null,
      waiting: null,
      decidable: false,
      reason: 'not-on-branch',
      lossy: true,
    },
    {
      id: 'feature-legacy-auth',
      type: 'feature',
      domains: [],
      path: '.ai/knowledge/features/legacy-auth.md',
      paths: ['src/auth/**'],
      summary: 'How the old login works',
      source: null,
      bytes: null,
      waiting: null,
      ...judged,
    },
  ],
  sources: [
    { id: 'convention-team-rules', state: 'changed', source: 'docs/rules.md', bytes: 85, waiting: null, ...judged },
    { id: 'convention-legacy', state: 'unrecorded', source: 'docs/legacy.md', bytes: 20, waiting: null, ...judged },
    { id: 'convention-deploy', state: 'missing', source: 'docs/deploy.md', bytes: null, waiting: null, ...judged },
    {
      id: 'convention-release',
      state: 'changed',
      source: 'docs/release.md',
      bytes: 3400,
      waiting: { decision: 'rejected', pr: null },
      ...judged,
    },
    {
      id: 'convention-review',
      state: 'changed',
      source: 'docs/review.md',
      bytes: 512,
      waiting: null,
      decidable: false,
      reason: 'not-on-base',
      lossy: false,
    },
  ],
  waiting: { branch: 'knowledge/decisions', base: 'main', pushed: true, pr: null },
};

/** Open document texts: a feature's, a stub's with its Markdown file (bytes dropped), a stub's with a file that is not Markdown, one being read, one Jig could not read, one no longer proposed. */
export const knowledgeTexts: Record<string, DocumentText | 'reading' | 'not-found'> = {
  'feature-checkout': {
    state: 'ready',
    content:
      '---\nid: feature-checkout\ntype: feature\nstatus: proposed\n---\n# Checkout\n\n## What\n\nHow checkout takes a card payment: the cart calls `pay()` once, and a declined card leaves the order open.\n\n## Constraints\n\n- One provider (see the payments ADR).\n- No card number is stored.\n',
    lossy: false,
    source: null,
  },
  'convention-coding-style': {
    state: 'ready',
    content:
      '---\nid: convention-coding-style\ntype: convention\nstatus: proposed\nsource: docs/style.md\n---\n# Coding style\n\nLinked source: [docs/style.md](../../../docs/style.md). The source owns its rules.\n',
    lossy: false,
    source: { content: '# Style\n\nUse tabs  here.\n', lossy: true },
  },
  'convention-build': {
    state: 'ready',
    content: '---\nid: convention-build\nsource: Makefile\n---\n# Build\n\nLinked source: [Makefile](../../../Makefile).\n',
    lossy: false,
    source: { content: 'build:\n\tnpm run build\n\ttsc -p .\n', lossy: false },
  },
  'feature-search': 'reading',
  'feature-billing': { id: 'acme', state: 'unreadable', code: 'failed' },
  'feature-legacy-auth': 'not-found',
};

/** The project item that sends the person to the Knowledge view. */
export const knowledgeAttention: Attention = {
  kind: 'knowledge-proposed',
  subject: { type: 'project', id: null },
  tasks: [],
  title: 'Knowledge is waiting for your decision',
  detail: '4 document(s) proposed',
  todo: "Ask the agent: what's proposed? (jig-accept)",
  url: null,
  versions: null,
};
