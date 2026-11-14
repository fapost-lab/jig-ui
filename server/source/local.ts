import { existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  addItem,
  ARTIFACTS_JIG_VERSION,
  cancelPause,
  closeTask,
  DECIDE_JIG_VERSION,
  decideKnowledge,
  FILE_NEW_JIG_VERSION,
  fileItem,
  fileNewItem,
  fileTask,
  hasJig,
  housekeeping,
  JigRefusal,
  JigShapeError,
  KNOWLEDGE_JIG_VERSION,
  KNOWLEDGE_TEXT_JIG_VERSION,
  LAND_JIG_VERSION,
  landUpgrade,
  jigVersion,
  MIN_JIG_VERSION,
  moveInQueue,
  moveItem,
  planUpgrade,
  type QueueItem,
  readArtifact,
  readArtifacts,
  readKnowledge,
  readKnowledgeText,
  readQueue,
  readSettings,
  readSourceDiff,
  readSpecs,
  readStatus,
  refresh as refreshClone,
  REFRESH_JIG_VERSION,
  readFinishedTasks,
  readTasks,
  releaseNamed,
  pauseTask,
  PAUSE_JIG_VERSION,
  requestPause,
  RESUME_JIG_VERSION,
  resumeTask,
  ROADMAP_JIG_VERSION,
  runUpgrade,
  selfUpdate as runSelfUpdate,
  setPriority,
  setSetting,
  SETTINGS_JIG_VERSION,
  supports,
  type TaskSummary,
  unsetSetting,
  watchDir,
  writtenByReads,
} from '../jig/client.js';
import { addProject, type Project, readProjects, removeProject } from '../registry/projects.js';
import { type Watch, watchTree } from '../watch/watch.js';
import { mainCheckout } from './checkout.js';
import { scanFolder, tilde } from './scan.js';
import type {
  Attention,
  Change,
  DocumentDecision,
  FinishedTask,
  LandedAll,
  MergeWait,
  Machine,
  ProjectSource,
  ProjectSpecs,
  ProjectTasks,
  ProjectView,
  Refreshed,
  Refusal,
  SelfUpdateRun,
  ShownSpec,
  Spec,
  SpecPhase,
  Task,
  TaskCounts,
  TaskDetails,
  UpgradeRun,
  WorkspaceProject,
  Written,
} from './project-source.js';

/** Jig's version in the checkout: `null` when Jig is there but names no version Jig UI can read. A Jig too slow to answer throws its JigRefusal. */
async function version(root: string): Promise<string | null | undefined> {
  try {
    return await jigVersion(root);
  } catch (error) {
    if (error instanceof JigRefusal) throw error;
    return null;
  }
}

/** The main checkout `path` names, or why it cannot be connected. A Jig below the minimum can. */
async function connectable(path: string): Promise<{ root: string } | Refusal> {
  const checkout = await mainCheckout(path);
  if (checkout.kind === 'not-a-repository') {
    return { code: 'not-a-repository', message: 'This is not a directory inside a git repository.' };
  }
  if (checkout.kind === 'worktree') {
    return { code: 'worktree', message: "This is a worktree. Connect its clone's main checkout instead." };
  }
  if (!hasJig(checkout.root)) {
    return { code: 'no-jig', message: 'There is no Jig in this repository. Run jig init in it first.' };
  }
  return { root: checkout.root };
}

function count(tasks: TaskSummary[]): TaskCounts {
  return {
    active: tasks.filter((t) => t.status === 'active' && !t.paused).length,
    paused: tasks.filter((t) => t.paused).length,
    ready: tasks.filter((t) => t.status === 'ready' && !t.paused).length,
  };
}

type NotReady = Exclude<ProjectView, { state: 'ready' }>;

/** One read of a project: what the workspace, the board, each task's details and the specs show, and the revision it came from. */
type Read = {
  view: ProjectView;
  tasks: ProjectTasks;
  details: TaskDetails[];
  specs: ProjectSpecs;
  revision: number | null;
};

type Live = TaskSummary & { status: Task['status'] };

/** Filing an item's task on Jig 0.40.0: the task was filed, and Jig refused to name it on the item. */
class Unnamed extends JigRefusal {}

/** A roadmap item of `phases` by its handle. */
const itemIn = (phases: SpecPhase[], item: string) => phases.flatMap((p) => p.items).find((i) => i.id === item);
type Finished = TaskSummary & { status: FinishedTask['status'] };

/** A finished task as the list of them shows it. */
const gone = (t: Finished): FinishedTask => ({
  id: t.id,
  status: t.status,
  goal: t.goal,
  updatedAt: t.updatedAt,
  pullRequest: t.pullRequest && { url: t.pullRequest.url, state: t.pullRequest.state },
});

/**
 * Ready and closable as done: Jig offers `close`, or the only thing between them is its forge cache — the knowledge
 * decision is recorded and the pull request is not known to be closed unmerged. The cache is written only by
 * `jig housekeeping`, so a project that has not run it lately offers no close for a merged task; the command asks the
 * forge itself and refuses one that has not merged.
 *
 * On the staging flow (`staging` is there) the pull request is the one into staging, and Jig 0.45.0's close command
 * closes the task once that one merged, before the work reached the base (fapost-lab/jig#509). There only housekeeping's `needs-consolidation`,
 * a merge into the base, makes a task closable.
 */
function closable(t: Live): boolean {
  if (t.status !== 'ready') return false;
  if (t.staging !== undefined) return t.knowledgeConsolidated && t.parked === null && t.housekeepingFlags.includes('needs-consolidation');
  if (t.actions.some((a) => a.id === 'close' && a.offered)) return true;
  return t.knowledgeConsolidated && t.pullRequest !== null && t.pullRequest.state !== 'closed';
}

const offers = (t: Live, action: string): boolean => t.actions.some((a) => a.id === action && a.offered);

/** What the project's Jig takes, for the writes a card offers: `task resume --revision`, and `task pause --revision`. */
interface Takes {
  resume: boolean;
  pause: boolean;
}

/** A live task as a board's card shows it, with its place in the queue if it has one. */
const card = (t: Live, q: QueueItem | undefined, takes: Takes): Task => ({
  id: t.id,
  class: t.class,
  status: t.status,
  goal: t.goal,
  paused: t.paused,
  pauseRequest: t.pauseRequest,
  pauseRequestable: offers(t, 'request-pause'),
  // Jig 0.45.0 also withholds the request, offering `pause`, from a started task whose pause is asked already: an agent
  // may be in one of its stages, so only a task nobody started is paused at once.
  pausable: takes.pause && t.branch === null && offers(t, 'pause') && !offers(t, 'request-pause'),
  resumable: takes.resume && offers(t, 'resume'),
  closable: closable(t),
  staging: t.staging ?? null,
  parked: t.parked ?? null,
  started: t.branch !== null,
  gate: t.gate?.state ?? null,
  autopilot: t.autopilot?.state ?? null,
  pullRequest: t.pullRequest,
  priority: q?.priority ?? null,
  queue: q ? { level: q.level, position: q.position } : null,
});

/**
 * The queue as the page shows it: the live tasks and the open epics. Jig keeps a finished task, or a finished epic, in
 * its queue until `jig queue remove`, which nothing runs for it.
 */
interface ShownQueue {
  tasks: QueueItem[];
  epics: QueueItem[];
}

/** A queued task's place among the tasks and epics of its level: 1 the first. */
function placeIn(
  queue: ShownQueue,
  q: QueueItem,
): {
  rank: number;
  of: number;
} {
  const level = [...queue.tasks, ...queue.epics].filter((i) => i.level === q.level).sort((a, b) => a.position - b.position);
  return { rank: level.indexOf(q) + 1, of: level.length };
}

/** What a queued task waits for, as Jig declares it, met or not: its own dependencies, then its epic's. */
const waitsFor = (queue: ShownQueue, q: QueueItem): TaskDetails['dependsOn'] => [
  ...q.dependsOn.map((d) => ({ ...d, through: null })),
  ...(queue.epics.find((e) => `epic:${e.id}` === q.level)?.dependsOn.map((d) => ({ ...d, through: q.level })) ?? []),
];

/** A live task in full; where its worktree is was never read, and an action Jig refuses is left out. */
const details = (t: Live, q: QueueItem | undefined, queue: ShownQueue, attention: Attention[], takes: Takes): TaskDetails => ({
  ...card(t, q, takes),
  issue: t.issue,
  branch: t.branch,
  baseBranch: t.baseBranch,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  knowledgeConsolidated: t.knowledgeConsolidated,
  worktree: t.worktree,
  gateBy: t.gate?.by ?? null,
  run: t.autopilot && {
    mode: t.autopilot.mode,
    stage: t.autopilot.stage,
    stageAt: t.autopilot.stageAt,
    stopReason: t.autopilot.stopReason,
    stopAt: t.autopilot.stopAt,
    phase: t.autopilot.phase,
  },
  housekeepingFlags: t.housekeepingFlags,
  actions: t.actions.filter((a) => a.offered).map(({ id, command }) => ({ id, command })),
  attention: attention.filter((a) => a.tasks.includes(t.id)),
  place: q ? placeIn(queue, q) : null,
  dependsOn: q ? waitsFor(queue, q) : [],
});

/**
 * Runs `read` on a connected project whose Jig Jig UI reads; a project gone, below the minimum, or
 * refusing the read comes back as its state instead.
 */
async function reading<T>({ id, path }: Project, read: (root: string, jigVersion: string) => Promise<T>): Promise<T | NotReady> {
  if (!existsSync(path)) return { id, state: 'unavailable', reason: 'missing' };
  let v: string | null | undefined;
  try {
    v = await version(path);
  } catch (error) {
    return { id, state: 'unreadable', code: (error as JigRefusal).code };
  }
  if (v === undefined) return { id, state: 'unavailable', reason: 'no-jig' };
  if (v === null || !supports(v)) return { id, state: 'unsupported', jigVersion: v, minimum: MIN_JIG_VERSION };
  try {
    return await read(path, v);
  } catch (error) {
    if (error instanceof JigShapeError) return { id, state: 'incompatible', jigVersion: v };
    // Only the code goes on: Jig's message may name a path.
    return { id, state: 'unreadable', code: error instanceof JigRefusal ? error.code : 'failed' };
  }
}

async function readProject(project: Project): Promise<Read> {
  const read = await reading(project, async (root, jigVersion) => {
    const [status, list, queue, specs] = await Promise.all([readStatus(root), readTasks(root), readQueue(root), readSpecs(root)]);
    return { status, list, queue, specs, jigVersion };
  });
  if (!('list' in read)) return { view: read, tasks: read, details: [], specs: read, revision: null };
  const { status, list, queue, specs, jigVersion } = read;
  // Jig's own list holds the live ones; `finished` counts the closed and abandoned ones it left out, read on demand.
  const live = list.tasks.filter((t): t is Live => t.status === 'active' || t.status === 'ready');
  const queued = new Map(queue.items.map((q) => [q.id, q]));
  const open = new Set(specs.specs.filter((s) => s.epic?.state === 'open').map((s) => s.id));
  const shownQueue = {
    tasks: queue.items.filter((q) => live.some((t) => t.id === q.id)),
    epics: queue.epics.filter((e) => open.has(e.id)),
  };
  // The oldest of the reads the board is made of: a write against it is refused if anything was written after any of them.
  const revision = Math.min(status.revision, list.revision, queue.revision);
  const takes = { resume: supports(jigVersion, RESUME_JIG_VERSION), pause: supports(jigVersion, PAUSE_JIG_VERSION) };
  return {
    view: {
      id: project.id,
      state: 'ready',
      jigVersion,
      counts: count(live),
      attention: status.attention,
      housekeepingStale: status.housekeepingStale,
      origin: status.origin,
      closable: live.filter(closable).map((t) => t.id),
      revision,
    },
    tasks: { state: 'ready', tasks: live.map((t) => card(t, queued.get(t.id), takes)), finishedCount: list.finished, revision },
    details: live.map((t) => details(t, queued.get(t.id), shownQueue, status.attention, takes)),
    // The specs are read beside the queue: a write of an epic carries the older of the two reads, or of the board's.
    specs: {
      state: 'ready',
      specs: ordered(specs.specs, queue.epics),
      revision: Math.min(revision, specs.revision),
      editable: supports(jigVersion, ROADMAP_JIG_VERSION),
    },
    revision,
  };
}

/** The specs as the page shows them (`ProjectSpecs`): the queued epics by position, then the other open epics, then the rest. */
function ordered(specs: Spec[], epics: QueueItem[]): ShownSpec[] {
  const queued = new Map(epics.map((e) => [e.id, e]));
  const shown = specs.map((s) => {
    const q = s.epic?.state === 'open' ? queued.get(s.id) : undefined;
    return { ...s, queue: q ? { position: q.position, priority: q.priority } : null };
  });
  const rank = (s: ShownSpec) => (s.queue ? 0 : s.epic?.state === 'open' ? 1 : 2);
  return shown.sort((a, b) => rank(a) - rank(b) || (a.queue && b.queue ? a.queue.position - b.queue.position : 0));
}

/** The version Jig's `upgrade-available` item in a read names for this machine; none without the item. */
const upgradeTo = (read: Read): string | undefined =>
  read.view.state === 'ready' ? (read.view.attention.find((a) => a.kind === 'upgrade-available')?.versions?.to ?? undefined) : undefined;

/** Jig says a newer release than this machine's is out: `jig self-update` comes before the project's upgrade. */
const releaseOut = (read: Read): boolean => read.view.state === 'ready' && read.view.attention.some((a) => a.kind === 'release-available');

/** A read that may have caught Jig mid-write: worth one more try before it is believed. */
const torn = (read: Read): boolean => read.view.state === 'unreadable' || read.view.state === 'incompatible';

/** What the adapter knows of one connected project. */
interface Entry {
  project: Project;
  /** What the project shows now. */
  shown?: Read;
  /** The following `shown` was read in; a read from before it, or while not following, is not served from. */
  readIn?: number;
  /** `shown` was kept over one torn read; the next torn read is believed. */
  held: boolean;
  watch?: Watch;
  /** The read under way; a change meanwhile sets `dirty` for one more after it. */
  reading?: Promise<void>;
  dirty: boolean;
  /** Registered since the page last read the workspace: its first read is signalled too. */
  news: boolean;
  /** The upgrade started from the page, kept until dismissed or the next one starts. */
  upgrade?: UpgradeRun;
  /** The writes, and the on-demand reads (a task's documents, the settings, the finished tasks), under way: an upgrade starts once they have ended. */
  writes: Set<Promise<unknown>>;
  /**
   * The pull request the page's last upgrade left open, kept until a landing brings it here: before housekeeping hears
   * of it, it is all that says the project waits — a `not-merged` Check merge must not forget it.
   */
  openPullRequest?: {
    to: string | null;
    url: string;
  };
}

export interface LocalOptions {
  /** How often every followed project is read again, for changes the system watcher dropped. */
  rescanMs?: number;
  quietMs?: number;
  maxWaitMs?: number;
}

/**
 * The local adapter: the registry in the config directory, Jig run in each main checkout, and a
 * Watcher on each project's `.ai/` while someone listens. Then reads are served from what the
 * watch last read, and a change is signalled only when a new read differs from it.
 */
export function localSource(configDir: string, { rescanMs = 60_000, quietMs, maxWaitMs }: LocalOptions = {}): ProjectSource {
  const entries = new Map<string, Entry>();
  /** The last upgrade start or disconnect: they run one at a time, each checking what the one before changed. */
  let changing: Promise<unknown> = Promise.resolve();
  function oneAtATime<T>(change: () => Promise<T>): Promise<T> {
    const done = changing.then(change);
    changing = done.catch(() => undefined);
    return done;
  }
  /** The runs that change this machine's Jig or every project, kept until dismissed or the next one starts. */
  const machine: Omit<Machine, 'release' | 'landingAll'> = { selfUpdate: null, upgradeAll: null };
  /** Check all merges is under way. */
  let landingAll = false;

  /** The newest release any connected project's last read names. */
  function newestRelease(): string | null {
    let newest: string | null = null;
    for (const entry of entries.values()) {
      const read = entry.shown;
      if (read?.view.state !== 'ready') continue;
      for (const item of read.view.attention) {
        const named = releaseNamed(item);
        // `supports(a, b)` is a ≥ b.
        if (named && (newest === null || !supports(newest, named))) newest = named;
      }
    }
    return newest;
  }
  const listeners = new Set<(change: Change) => void>();
  let rescan: NodeJS.Timeout | undefined;
  /** Counts the times following started; a read that finishes after a stop belongs to none. */
  let session = 0;
  const following = (): boolean => rescan !== undefined;
  /** The ids the last sweep of this following found registered; none before its first. */
  let known: Set<string> | undefined;

  const entryOf = (project: Project): Entry => {
    let entry = entries.get(project.id);
    if (!entry) entries.set(project.id, (entry = { project, held: false, dirty: false, news: false, writes: new Set() }));
    return entry;
  };

  /** Keeps what was shown over one torn read; otherwise the read is what the project shows. */
  function settle(entry: Entry, read: Read): void {
    // While following, only a read this following showed is kept: one from before it was never shown through it.
    const ours = !following() || entry.readIn === session;
    if (torn(read) && entry.shown && !torn(entry.shown) && !entry.held && ours) {
      entry.held = true;
      return;
    }
    entry.held = false;
    entry.shown = read;
    entry.readIn = following() ? session : undefined;
  }

  /**
   * Reads the project again — one read at a time — and signals when what it shows changed. The
   * first read since following started signals nothing: every page reads when its stream opens.
   */
  function refresh(entry: Entry, news = false): Promise<void> {
    entry.news ||= news;
    // Jig replaces its own scripts while it upgrades: a read could run one half placed. The run reads once it ends.
    if (entry.upgrade?.state === 'running' && entry.shown) return Promise.resolve();
    if (entry.reading) {
      entry.dirty = true;
      return entry.reading;
    }
    entry.reading = (async () => {
      do {
        entry.dirty = false;
        const was = entry.readIn;
        const before = JSON.stringify(entry.shown);
        settle(entry, await readProject(entry.project));
        // Compared only with a read of this following, checked once the read is in: one from before
        // it, or from a following that ended meanwhile, was never shown through this one.
        const changed = following() && was === session && JSON.stringify(entry.shown) !== before;
        // News lasts one read: one made while nobody listens tells nobody, and must not tell the next listener.
        const news = entry.news;
        entry.news = false;
        if (following() && entries.get(entry.project.id) === entry && (news || changed)) {
          signal({ id: entry.project.id, revision: entry.shown?.revision ?? null });
        }
      } while (entry.dirty);
    })().finally(() => (entry.reading = undefined));
    return entry.reading;
  }

  function signal(change: Change): void {
    for (const listener of listeners) listener(change);
  }

  /** Tells the listeners that what the project shows beyond Jig's read — its upgrade — changed. */
  function signalUpgrade(entry: Entry): void {
    if (following() && entries.get(entry.project.id) === entry) signal({ id: entry.project.id, revision: entry.shown?.revision ?? null });
  }

  /** A self-update, an Upgrade all or a project's upgrade is under way: the next one waits for it to end. */
  const anyRunning = (): boolean =>
    landingAll ||
    machine.selfUpdate?.state === 'running' ||
    machine.upgradeAll?.state === 'running' ||
    [...entries.values()].some((e) => e.upgrade?.state === 'running');

  /** Tells the listeners that the machine's runs changed: through every project followed, the page reads the workspace. */
  function signalMachine(): void {
    if (!following()) return;
    for (const [id, entry] of entries) signal({ id, revision: entry.shown?.revision ?? null });
  }

  /**
   * The main checkout whose Jig hands `jig self-update` to the machine's: one whose last read says a release is out —
   * a Jig that knows the command — else the first connected project with a Jig.
   */
  async function selfUpdateRoot(): Promise<string | undefined> {
    const projects = (await readProjects(configDir).catch(() => [])).filter((p) => hasJig(p.path));
    const saysRelease = (id: string): boolean => {
      const read = entries.get(id)?.shown;
      return read !== undefined && releaseOut(read);
    };
    return (projects.find((p) => saysRelease(p.id)) ?? projects[0])?.path;
  }

  /**
   * Updates this machine's Jig through the project in `root`, then reads every connected project again: each now shows
   * the upgrade the new Jig makes. The run is marked at once, before the first await.
   */
  async function updatingMachine(root: string): Promise<Exclude<SelfUpdateRun, { state: 'running' }>> {
    machine.selfUpdate = { state: 'running', since: new Date().toISOString() };
    signalMachine();
    let run: Exclude<SelfUpdateRun, { state: 'running' }>;
    try {
      run = { state: 'done', at: '', said: await runSelfUpdate(root) };
    } catch (error) {
      run = { state: 'failed', at: '', reasons: error instanceof JigRefusal ? error.reasons : [] };
    }
    run = { ...run, at: new Date().toISOString() };
    machine.selfUpdate = run;
    const projects = await readProjects(configDir).catch(() => []);
    await Promise.allSettled(projects.map((p) => refresh(entryOf(p))));
    signalMachine();
    return run;
  }

  /** Upgrades every connected project that shows an upgrade, one at a time, after this machine's Jig when a release is out. */
  async function upgradingAll(): Promise<void> {
    const upgraded: string[] = [];
    const skipped: string[] = [];
    let failed: string[] | null = null;
    const since = machine.upgradeAll?.state === 'running' ? machine.upgradeAll.since : new Date().toISOString();
    const progress = (current: string): void => {
      machine.upgradeAll = { state: 'running', since, current, upgraded: [...upgraded] };
      signalMachine();
    };
    try {
      const projects = await readProjects(configDir).catch(() => []);
      if ((await Promise.all(projects.map(shown))).some(releaseOut)) {
        const root = await selfUpdateRoot();
        const run = root ? await updatingMachine(root) : undefined;
        if (!run) failed = ['No connected project has a Jig to run jig self-update through.'];
        else if (run.state === 'failed') failed = run.reasons.length ? run.reasons : ['jig self-update failed.'];
      }
      if (!failed) {
        for (const project of projects) {
          // Picked in turn with disconnects, as a single upgrade starts: one disconnected meanwhile is never upgraded,
          // and one marked running cannot be disconnected.
          const entry = await oneAtATime(async () => {
            if (!(await readProjects(configDir).catch(() => [])).some((p) => p.id === project.id)) return undefined;
            const picked = entryOf(project);
            const to = upgradeTo(await shown(project));
            if (to === undefined || picked.upgrade?.state === 'running') {
              skipped.push(project.id);
              return undefined;
            }
            progress(project.id);
            picked.upgrade = { state: 'running', since: new Date().toISOString(), to };
            signalUpgrade(picked);
            return picked;
          });
          if (!entry) continue;
          await upgrading(entry);
          upgraded.push(project.id);
        }
      }
    } finally {
      machine.upgradeAll = { state: 'done', at: new Date().toISOString(), upgraded, skipped, failed };
      signalMachine();
    }
  }

  /** The project's last read when an upgrade may start from it: ready and naming a version to upgrade to. */
  async function upgradable(id: string): Promise<
    | {
        entry: Entry;
        to: string;
      }
    | {
        state: 'refused';
        code: string;
      }
    | NotReady
    | undefined
  > {
    const project = (await readProjects(configDir)).find((p) => p.id === id);
    if (!project) return undefined;
    const read = await shown(project);
    if (read.view.state !== 'ready') return read.view;
    const entry = entryOf(project);
    // One upgrade at a time on this machine: a self-update or an Upgrade all under way holds every project's.
    if (
      entry.upgrade?.state === 'running' ||
      machine.selfUpdate?.state === 'running' ||
      machine.upgradeAll?.state === 'running' ||
      landingAll
    ) {
      return { state: 'refused', code: 'running' };
    }
    const to = upgradeTo(read);
    return to === undefined ? { state: 'refused', code: 'not-found' } : { entry, to };
  }

  /**
   * The project's upgrade that waits for its pull request: Jig's item for it (the project's own Jig, 0.39.0), or the pull
   * request the page's last upgrade left open — before housekeeping hears of it. None when the project's Jig cannot land.
   */
  function mergeWaitOf(read: Read, entry: Entry): MergeWait | undefined {
    if (read.view.state !== 'ready' || !supports(read.view.jigVersion, LAND_JIG_VERSION)) return undefined;
    const item = read.view.attention.find((a) => a.kind === 'upgrade-pull-request-waiting' || a.kind === 'upgrade-pull-request-merged');
    if (item?.pullRequest)
      return { state: item.kind === 'upgrade-pull-request-merged' ? 'merged' : 'open', to: item.pullRequest.to, url: item.url };
    return entry.openPullRequest && { state: 'open', ...entry.openPullRequest };
  }

  /** The project when its upgrade pull request may be checked now, marked running before the first await by the caller. */
  async function landable(
    id: string,
    checkAll: boolean,
  ): Promise<
    | {
        entry: Entry;
        to: string;
      }
    | {
        state: 'refused';
        code: string;
      }
    | NotReady
    | undefined
  > {
    const project = (await readProjects(configDir)).find((p) => p.id === id);
    if (!project) return undefined;
    const read = await shown(project);
    if (read.view.state !== 'ready') return read.view;
    const entry = entryOf(project);
    const busy = entry.upgrade?.state === 'running' || machine.selfUpdate?.state === 'running' || machine.upgradeAll?.state === 'running';
    if (busy || (!checkAll && landingAll)) return { state: 'refused', code: 'running' };
    const wait = mergeWaitOf(read, entry);
    return wait === undefined ? { state: 'refused', code: 'not-found' } : { entry, to: wait.to ?? '' };
  }

  /** Lands the upgrade, then keeps what it came to — refused `not-merged` included — and reads the project again. */
  async function landing(entry: Entry): Promise<Exclude<UpgradeRun, { state: 'running' }>> {
    await Promise.allSettled([entry.reading, ...entry.writes]);
    let run: Exclude<UpgradeRun, { state: 'running' }>;
    try {
      run = { state: 'done', at: '', upgrade: await landUpgrade(entry.project.path) };
    } catch (error) {
      run =
        error instanceof JigRefusal
          ? { state: 'refused', at: '', code: error.code, reasons: error.reasons }
          : { state: 'refused', at: '', code: 'failed', reasons: [] };
    }
    run = { ...run, at: new Date().toISOString() };
    entry.upgrade = run;
    // Brought here, or nothing left to bring: the pull request no longer waits. A refusal leaves it waiting.
    if (run.state === 'done') entry.openPullRequest = undefined;
    await refresh(entry);
    signalUpgrade(entry);
    return run;
  }

  /** Marks the project landing and starts it; one at a time with upgrade starts and disconnects. */
  function startLanding(id: string, checkAll = false) {
    return oneAtATime(
      async (): Promise<
        | { run: ReturnType<typeof landing> }
        | {
            state: 'refused';
            code: string;
          }
        | NotReady
        | undefined
      > => {
        const found = await landable(id, checkAll);
        if (!found || !('entry' in found)) return found;
        found.entry.upgrade = { state: 'running', since: new Date().toISOString(), to: found.to, landing: true };
        signalUpgrade(found.entry);
        return { run: landing(found.entry) };
      },
    );
  }

  /** Runs the upgrade to its end, then keeps what it came to and reads the project again. */
  async function upgrading(entry: Entry): Promise<void> {
    // A read or a write under way runs Jig in the same checkout.
    await Promise.allSettled([entry.reading, ...entry.writes]);
    let run: UpgradeRun;
    try {
      run = { state: 'done', at: '', upgrade: await runUpgrade(entry.project.path) };
    } catch (error) {
      run =
        error instanceof JigRefusal
          ? { state: 'refused', at: '', code: error.code, reasons: error.reasons }
          : { state: 'refused', at: '', code: 'failed', reasons: [] };
    }
    entry.upgrade = { ...run, at: new Date().toISOString() };
    const git = run.state === 'done' ? run.upgrade.git : null;
    if (run.state === 'done' && git?.pullRequest && !git.merged) entry.openPullRequest = { to: run.upgrade.to, url: git.pullRequest };
    await refresh(entry);
    signalUpgrade(entry);
  }

  /** What the project shows: from the watch while following, read through Jig otherwise. */
  async function shown(project: Project): Promise<Read> {
    const entry = entryOf(project);
    if (!(following() && entry.shown && entry.readIn === session)) await (entry.reading ?? refresh(entry));
    return entry.shown as Read;
  }

  function follow(entry: Entry): void {
    if (entry.watch?.open) return;
    entry.watch = watchTree(watchDir(entry.project.path), {
      ignore: writtenByReads,
      onChange: () => void refresh(entry),
      quietMs,
      maxWaitMs,
    });
  }

  /**
   * Follows every registered project and reads it again; forgets one no longer registered, such as
   * one a read in flight brought back after its disconnect.
   */
  async function sweep(): Promise<void> {
    // An unreadable registry is the page's to show, through its own read.
    const projects = await readProjects(configDir).catch(() => undefined);
    if (!projects || !following()) return;
    const ids = new Set(projects.map((p) => p.id));
    const before = known;
    known = ids;
    for (const [id, entry] of entries) {
      if (ids.has(id)) continue;
      entry.watch?.close();
      entries.delete(id);
    }
    for (const project of projects) {
      const entry = entryOf(project);
      follow(entry); // a watcher that failed, or a directory that came back
      void refresh(entry, before !== undefined && !before.has(project.id)); // one another Jig UI connected
    }
  }

  function start(): void {
    session++;
    known = undefined;
    rescan = setInterval(() => void sweep(), rescanMs);
    rescan.unref();
    void sweep();
  }

  /** Stops following; what was read while following may be old by the next subscribe, so it goes. */
  function stop(): void {
    clearInterval(rescan);
    rescan = undefined;
    for (const entry of entries.values()) {
      entry.watch?.close();
      entry.watch = undefined;
      // A project being upgraded keeps its read: it is read again only once the upgrade ends.
      if (entry.upgrade?.state !== 'running') entry.shown = undefined;
      entry.held = false;
    }
  }

  /**
   * Runs a write in a project once every task it names is live in what the project shows — so nothing but an id
   * Jig itself listed reaches Jig's arguments; a new task's id names none, and the HTTP boundary checks it against
   * Jig's grammar instead — then reads the project again, refused or not: the page reads next. `taskIds` are among
   * the live tasks of the last read and pass `allowed` there, `specIds` among its specs with an open epic; `write` gets
   * that read for checks of its own. A note it answers goes on with `written`.
   */
  async function writing(
    id: string,
    taskIds: string[],
    write: (root: string, jigVersion: string, read: Read) => Promise<string | string[] | Refreshed | null | void>,
    specIds: string[] = [],
    allowed: (task: Task) => boolean = () => true,
  ): Promise<Written | undefined> {
    const project = (await readProjects(configDir)).find((p) => p.id === id);
    if (!project) return undefined;
    const read = await shown(project);
    const { view, tasks, specs } = read;
    if (view.state !== 'ready') return view;
    if (tasks.state !== 'ready') return tasks;
    const open = specs.state === 'ready' ? specs.specs.filter((s) => s.epic?.state === 'open').map((s) => s.id) : [];
    if (!taskIds.every((t) => tasks.tasks.some((live) => live.id === t && allowed(live))) || !specIds.every((s) => open.includes(s))) {
      return { state: 'refused', code: 'not-found' };
    }
    const entry = entryOf(project);
    // Jig replaces its own scripts while it upgrades: the write waits for the person to try again.
    if (entry.upgrade?.state === 'running') return { state: 'refused', code: 'upgrading' };
    let written: Written = { state: 'written' };
    const run = write(project.path, view.jigVersion, read);
    entry.writes.add(run);
    try {
      const note = await run;
      if (Array.isArray(note)) written = { state: 'written', report: note };
      else if (typeof note === 'object' && note) written = { state: 'written', refreshed: note };
      else if (note) written = { state: 'written', note };
    } catch (error) {
      // Only the code goes on, and reasons Jig UI cut the paths out of: Jig's message may name a path.
      written =
        error instanceof JigRefusal && error.reasons.length > 0
          ? { state: 'refused', code: error.code, reasons: error.reasons }
          : { state: 'refused', code: error instanceof JigRefusal ? error.code : 'failed' };
      if (error instanceof Unnamed) written = { ...written, filed: true };
    } finally {
      entry.writes.delete(run);
    }
    await refresh(entry);
    return written;
  }

  /**
   * A roadmap write, run only once the project's Jig makes it and the last read shows the spec, and in the roadmap the
   * page shows — the one waiting on the spec's branch when there is one, where Jig resolves an item — what `names`
   * checks: the phase, the items. Anything else is `not-found`, Jig not run.
   */
  function roadmapWriting(
    id: string,
    specId: string,
    names: (phases: SpecPhase[]) => boolean,
    write: (root: string, read: Read, jigVersion: string) => Promise<string | null>,
  ): Promise<Written | undefined> {
    return writing(id, [], async (root, jigVersion, read) => {
      if (!supports(jigVersion, ROADMAP_JIG_VERSION)) throw new JigRefusal('unsupported');
      const spec = read.specs.state === 'ready' ? read.specs.specs.find((s) => s.id === specId) : undefined;
      if (!spec || !names(spec.waiting?.phases ?? spec.phases)) throw new JigRefusal('not-found');
      return write(root, read, jigVersion);
    });
  }

  /** A settings write, refused `unsupported` with Jig not run on a project whose Jig cannot take it. */
  function settingWrite(jigVersion: string, write: () => Promise<void>): Promise<void> {
    return supports(jigVersion, SETTINGS_JIG_VERSION) ? write() : Promise.reject(new JigRefusal('unsupported'));
  }

  /**
   * Reads through the project's Jig in its main checkout on demand, as the board's read holds none: a task's documents —
   * Jig finds a worktree task's workspace itself —, the settings or the finished tasks; kept nowhere, so a failure is its
   * answer and leaves what the project shows alone. With `taskId`, `null` for a task not live in the last
   * read, Jig not run, or a document Jig does not have. Ready, it answers with the project's Jig version. A Jig older than
   * `minimum` answers `unsupported`, with that version as its minimum. While the project upgrades it runs no Jig there
   * (`unreadable`, `upgrading`), and an upgrade waits for a read under way.
   */
  async function onDemand<T>(
    id: string,
    minimum: string,
    read: (root: string) => Promise<T>,
    taskId?: string,
  ): Promise<
    | {
        state: 'ready';
        read: T | null;
        jigVersion: string;
      }
    | Exclude<ProjectView, { state: 'ready' }>
    | undefined
  > {
    const project = (await readProjects(configDir)).find((p) => p.id === id);
    if (!project) return undefined;
    const { view, details } = await shown(project);
    if (view.state !== 'ready') return view;
    const { jigVersion } = view;
    if (!supports(jigVersion, minimum)) return { id, state: 'unsupported', jigVersion, minimum };
    // Only a live task's id reaches Jig, never one the address made up (`--help`).
    if (taskId !== undefined && !details.some((t) => t.id === taskId)) return { state: 'ready', read: null, jigVersion };
    const entry = entryOf(project);
    // Jig replaces its own scripts while it upgrades (adr-20261027-upgrading-a-project-runs-in-the-background).
    if (entry.upgrade?.state === 'running') return { id, state: 'unreadable', code: 'upgrading' };
    const run = read(project.path);
    const held = run.then(
      () => {},
      () => {},
    );
    entry.writes.add(held);
    try {
      return { state: 'ready', read: await run, jigVersion };
    } catch (error) {
      if (error instanceof JigRefusal && error.code === 'not-found') return { state: 'ready', read: null, jigVersion };
      if (error instanceof JigShapeError) return { id, state: 'incompatible', jigVersion };
      // Only the code goes on: Jig's message may name a path.
      return { id, state: 'unreadable', code: error instanceof JigRefusal ? error.code : 'failed' };
    } finally {
      entry.writes.delete(held);
    }
  }

  /** A project as the workspace shows it: what its read says, and the upgrade started from the page. */
  const listed = async (project: Project): Promise<WorkspaceProject> => {
    const read = await shown(project);
    const entry = entryOf(project);
    const wait = mergeWaitOf(read, entry);
    return { ...read.view, upgrade: entry.upgrade ?? null, ...(wait ? { mergeWait: wait } : {}) };
  };

  return {
    async workspace() {
      return Promise.all((await readProjects(configDir)).map(listed));
    },
    async connected() {
      return (await readProjects(configDir)).map((p) => p.id);
    },
    async project(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      return project && listed(project);
    },
    async connect(path) {
      const found = await connectable(path);
      if ('code' in found) return found;
      const { project, created } = await addProject(configDir, found.root);
      const entry = entryOf(project);
      if (following()) follow(entry);
      // News too when another Jig UI registered it since the last sweep: this page has not heard of it.
      const news = created || (known !== undefined && !known.has(project.id));
      known?.add(project.id);
      await refresh(entry, news);
      return { project: (entry.shown as Read).view, created };
    },
    async scan(folder) {
      const root = await realpath(folder ?? homedir()).catch(() => undefined);
      if (root === undefined || !(await stat(root).catch(() => undefined))?.isDirectory()) {
        return { code: 'not-a-folder', message: 'There is no folder at this path.' };
      }
      const home = await realpath(homedir()).catch(() => homedir());
      const connected = new Set((await readProjects(configDir)).map((p) => p.path));
      const { found, ...rest } = await scanFolder(root, { home, connected });
      return { folder: tilde(root, home), found: found.map((path) => ({ path: tilde(path, home) })), ...rest };
    },
    async tasks(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      return project && (await shown(project)).tasks;
    },
    async task(id, taskId) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      if (!project) return undefined;
      const read = await shown(project);
      if (read.tasks.state !== 'ready') return read.tasks;
      return { state: 'ready', task: read.details.find((t) => t.id === taskId) ?? null };
    },
    async finished(id) {
      // Every Jig the board reads has `--status`: 0.31.0, its minimum.
      const answer = await onDemand(id, MIN_JIG_VERSION, readFinishedTasks);
      if (answer?.state !== 'ready') return answer;
      return {
        state: 'ready',
        tasks: (answer.read ?? []).filter((t): t is Finished => t.status === 'consolidated' || t.status === 'abandoned').map(gone),
      };
    },
    async artifacts(id, taskId) {
      const answer = await onDemand(id, ARTIFACTS_JIG_VERSION, (root) => readArtifacts(root, taskId), taskId);
      return answer?.state === 'ready' ? { state: 'ready', artifacts: answer.read } : answer;
    },
    async artifact(id, taskId, kind) {
      const answer = await onDemand(id, ARTIFACTS_JIG_VERSION, (root) => readArtifact(root, taskId, kind), taskId);
      return answer?.state === 'ready' ? { state: 'ready', artifact: answer.read && { ...answer.read, kind } } : answer;
    },
    async specs(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      return project && (await shown(project)).specs;
    },
    async readAgain(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      if (!project) return undefined;
      const entry = entryOf(project);
      await refresh(entry);
      return (entry.shown as Read).view;
    },
    move(id, taskId, place, revision) {
      const named = typeof place === 'object' ? [taskId, 'after' in place ? place.after : place.before] : [taskId];
      return writing(id, named, (root) => moveInQueue(root, `task:${taskId}`, place, revision));
    },
    moveEpic(id, specId, place, revision) {
      const named = typeof place === 'object' ? [specId, 'after' in place ? place.after : place.before] : [specId];
      return writing(id, [], (root) => moveInQueue(root, `epic:${specId}`, place, revision), named);
    },
    prioritiseEpic(id, specId, priority, revision) {
      return writing(id, [], (root) => setPriority(root, `epic:${specId}`, priority, revision), [specId]);
    },
    prioritise(id, taskId, priority, revision) {
      return writing(id, [taskId], (root) => setPriority(root, `task:${taskId}`, priority, revision));
    },
    requestPause(id, taskId, revision) {
      return writing(id, [taskId], (root) => requestPause(root, taskId, revision));
    },
    pause(id, taskId, revision) {
      return writing(
        id,
        [taskId],
        (root) => pauseTask(root, taskId, revision),
        [],
        (t) => t.pausable,
      );
    },
    cancelPause(id, taskId, revision) {
      return writing(id, [taskId], (root) => cancelPause(root, taskId, revision));
    },
    resume(id, taskId, revision) {
      return writing(id, [taskId], (root) => resumeTask(root, taskId, revision));
    },
    close(id, taskId, revision) {
      return writing(
        id,
        [taskId],
        (root, jigVersion) => closeTask(root, taskId, revision, jigVersion),
        [],
        (t) => t.closable,
      );
    },
    fileTask(id, taskId, goal) {
      // A new id names no live task: Jig itself refuses a taken one.
      return writing(id, [], (root) => fileTask(root, taskId, goal));
    },
    housekeeping(id) {
      return writing(id, [], (root) => housekeeping(root));
    },
    refresh(id) {
      return writing(id, [], (root, jigVersion) =>
        supports(jigVersion, REFRESH_JIG_VERSION) ? refreshClone(root) : Promise.reject(new JigRefusal('unsupported')),
      );
    },
    addItem(id, specId, phase, text, revision) {
      return roadmapWriting(
        id,
        specId,
        (phases) => phases.some((p) => p.phase === phase),
        (root) => addItem(root, specId, phase, text, revision),
      );
    },
    moveItem(id, specId, item, place, revision) {
      return roadmapWriting(
        id,
        specId,
        (phases) =>
          itemIn(phases, item) !== undefined &&
          (place === 'top' || ('after' in place ? itemIn(phases, place.after) !== undefined : phases.some((p) => p.phase === place.phase))),
        (root) => moveItem(root, specId, item, place, revision),
      );
    },
    fileItem(id, specId, item, taskId, goal, revision) {
      return roadmapWriting(
        id,
        specId,
        (phases) => {
          const named = itemIn(phases, item);
          return named !== undefined && !named.checked && named.task === null;
        },
        async (root, read, jigVersion) => {
          // A task filed earlier is named as it is, against the read the person saw.
          if (read.tasks.state === 'ready' && read.tasks.tasks.some((t) => t.id === taskId)) {
            return fileItem(root, specId, item, taskId, revision);
          }
          if (goal === null) throw new JigRefusal('usage');
          // From Jig 0.41.0 one write files the task and names it, against the read the person saw; a refusal files nothing.
          if (supports(jigVersion, FILE_NEW_JIG_VERSION)) return fileNewItem(root, specId, item, taskId, goal, revision);
          // `none`, the default, refuses every roadmap write: filed first, the task would be left with no item naming it.
          if ((await readSettings(root)).keys.find((k) => k.key === 'agent.git')?.value === 'none') {
            throw new JigRefusal('git-not-allowed');
          }
          await fileTask(root, taskId, goal);
          try {
            // `task new` moved the clone's revision: the item is named against a read after it, its handle guarding it.
            return await fileItem(root, specId, item, taskId, (await readQueue(root)).revision);
          } catch (error) {
            // Filed and not named: filing again with the same id names it as it is.
            throw error instanceof JigRefusal ? new Unnamed(error.code, error.reasons) : new Unnamed('failed');
          }
        },
      );
    },
    async settings(id) {
      const answer = await onDemand(id, SETTINGS_JIG_VERSION, (root) => readSettings(root));
      if (answer?.state !== 'ready') return answer;
      // `config keys` names nothing that could be missing: a `not-found` from it is a Jig that failed.
      return answer.read ? { state: 'ready', ...answer.read } : { id, state: 'unreadable', code: 'failed' };
    },
    setSetting(id, key, value, revision) {
      return writing(id, [], (root, jigVersion) => settingWrite(jigVersion, () => setSetting(root, key, value, revision)));
    },
    unsetSetting(id, key, revision) {
      return writing(id, [], (root, jigVersion) => settingWrite(jigVersion, () => unsetSetting(root, key, revision)));
    },
    async knowledge(id) {
      const answer = await onDemand(id, KNOWLEDGE_JIG_VERSION, (root) => readKnowledge(root));
      if (answer?.state !== 'ready') return answer;
      // The lists name nothing that could be missing: a `not-found` from them is a Jig that failed.
      if (!answer.read) return { id, state: 'unreadable', code: 'failed' };
      // A document's text and a dropped link came in the same Jig.
      const later = supports(answer.jigVersion, KNOWLEDGE_TEXT_JIG_VERSION);
      return {
        state: 'ready',
        ...answer.read,
        canRead: later,
        canDrop: later,
        canDecideMany: supports(answer.jigVersion, DECIDE_JIG_VERSION),
      };
    },
    async knowledgeDiff(id, docId) {
      const answer = await onDemand(id, KNOWLEDGE_JIG_VERSION, async (root) =>
        // Only a stub Jig itself listed with a changed file reaches Jig's arguments.
        (await readKnowledge(root)).sources.some((s) => s.id === docId && s.state === 'changed') ? readSourceDiff(root, docId) : null,
      );
      return answer?.state === 'ready' ? { state: 'ready', diff: answer.read } : answer;
    },
    async knowledgeText(id, docId) {
      const answer = await onDemand(id, KNOWLEDGE_TEXT_JIG_VERSION, async (root) =>
        // Only a document Jig itself listed as proposed reaches Jig's arguments.
        (await readKnowledge(root)).proposals.some((p) => p.id === docId) ? readKnowledgeText(root, docId) : null,
      );
      return answer?.state === 'ready' ? { state: 'ready', text: answer.read } : answer;
    },
    async decideKnowledge(id, decisions, revision) {
      let doc: string | null = null;
      const written = await writing(id, [], async (root, jigVersion) => {
        if (!supports(jigVersion, KNOWLEDGE_JIG_VERSION)) throw new JigRefusal('unsupported');
        // No held read lists knowledge: Jig's own lists, read now, name what each decision may take.
        const { proposals, sources } = await readKnowledge(root);
        const later = supports(jigVersion, KNOWLEDGE_TEXT_JIG_VERSION);
        // From Jig 0.41.0 `reject` also drops the link of a stub listed as changed, unrecorded or missing.
        const open = ({ doc, decision }: DocumentDecision) =>
          decision === 'reviewed'
            ? sources.some((s) => s.id === doc && s.state !== 'missing' && s.waiting === null)
            : proposals.some((p) => p.id === doc && p.waiting === null) ||
              (decision === 'reject' && later && sources.some((s) => s.id === doc && s.waiting === null));
        doc = decisions.find((d) => !open(d))?.doc ?? null;
        if (doc !== null) throw new JigRefusal('not-found');
        try {
          return await decideKnowledge(root, decisions, revision, jigVersion);
        } catch (error) {
          if (error instanceof JigRefusal) doc = error.doc ?? null;
          // Listed in the checkout, yet not where Jig 0.40.0 decides: `knowledge/decisions`, cut from origin's base. Jig
          // 0.41.0 says so itself, as `not-on-base` or `not-on-branch`, and its `not-found` is one.
          throw error instanceof JigRefusal && error.code === 'not-found' && !later ? new JigRefusal('not-on-branch') : error;
        }
      });
      return written?.state === 'refused' ? { ...written, doc } : written;
    },
    async planUpgrade(id) {
      const found = await upgradable(id);
      if (!found || !('entry' in found)) return found;
      try {
        return { state: 'planned', plan: await planUpgrade(found.entry.project.path) };
      } catch (error) {
        if (!(error instanceof JigRefusal)) return { state: 'refused', code: 'failed' };
        return error.reasons.length
          ? { state: 'refused', code: error.code, reasons: error.reasons }
          : { state: 'refused', code: error.code };
      }
    },
    upgrade(id) {
      // Two starts at once make one run; a disconnect sent with a start finds the run, or the start no project.
      return oneAtATime(async () => {
        const found = await upgradable(id);
        if (!found || !('entry' in found)) return found;
        found.entry.upgrade = { state: 'running', since: new Date().toISOString(), to: found.to };
        signalUpgrade(found.entry);
        void upgrading(found.entry);
        return { state: 'started' } as const;
      });
    },
    async land(id) {
      const started = await startLanding(id);
      if (!started || !('run' in started)) return started;
      await started.run;
      return { state: 'ended' } as const;
    },
    async landAll() {
      // Marked in turn with the other runs' starts: a self-update between its check and its mark cannot slip past.
      const started = await oneAtATime(async () => {
        if (anyRunning()) return false;
        landingAll = true;
        return true;
      });
      if (!started) return { state: 'refused', code: 'running' } as const;
      signalMachine();
      const landed: LandedAll = { landed: [], waiting: [], stopped: [] };
      try {
        for (const project of await readProjects(configDir).catch(() => [])) {
          const started = await startLanding(project.id, true);
          if (!started || !('run' in started)) continue; // nothing to check there, or it cannot be read
          const run = await started.run;
          if (run.state === 'done') landed.landed.push(project.id);
          else (run.code === 'not-merged' ? landed.waiting : landed.stopped).push(project.id);
        }
      } finally {
        landingAll = false;
        signalMachine();
      }
      return { state: 'ended', landed } as const;
    },
    async dismissUpgrade(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      if (!project) return false;
      const entry = entryOf(project);
      if (entry.upgrade && entry.upgrade.state !== 'running') {
        entry.upgrade = undefined;
        signalUpgrade(entry);
      }
      return true;
    },
    machine() {
      return { ...machine, release: newestRelease(), landingAll };
    },
    async selfUpdate() {
      // Started in turn with upgrade starts and disconnects, and awaited after it: a call meanwhile is refused, not queued.
      const started = await oneAtATime(
        async (): Promise<
          | { run: ReturnType<typeof updatingMachine> }
          | {
              state: 'refused';
              code: string;
            }
        > => {
          if (anyRunning()) return { state: 'refused', code: 'running' };
          const root = await selfUpdateRoot();
          if (!root) return { state: 'refused', code: 'not-found' };
          return { run: updatingMachine(root) }; // marked running before its first await
        },
      );
      if ('state' in started) return started;
      const run = await started.run;
      return run.state === 'done' ? { state: 'done', said: run.said } : { state: 'failed', reasons: run.reasons };
    },
    upgradeAll() {
      return oneAtATime(async () => {
        if (anyRunning()) return { state: 'refused', code: 'running' } as const;
        machine.upgradeAll = { state: 'running', since: new Date().toISOString(), current: null, upgraded: [] };
        signalMachine();
        void upgradingAll().catch(() => undefined); // its `finally` has kept what it came to
        return { state: 'started' } as const;
      });
    },
    dismissUpgradeAll() {
      if (machine.upgradeAll?.state === 'running' || machine.selfUpdate?.state === 'running') return;
      machine.upgradeAll = null;
      machine.selfUpdate = null;
      signalMachine();
    },
    disconnect(id) {
      return oneAtATime(async () => {
        // The run is the entry's: without it a project connected again would be read, and upgraded, meanwhile.
        if (entries.get(id)?.upgrade?.state === 'running') return 'upgrading' as const;
        if (!(await removeProject(configDir, id))) return false;
        entries.get(id)?.watch?.close();
        entries.delete(id);
        known?.delete(id); // connected again before the next sweep, it is news again
        if (following()) signal({ id, revision: null });
        return true;
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!following()) start();
      return () => {
        if (listeners.delete(listener) && listeners.size === 0) stop();
      };
    },
  };
}
