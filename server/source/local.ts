import { existsSync } from 'node:fs';
import {
  JigRefusal,
  JigShapeError,
  jigVersion,
  MIN_JIG_VERSION,
  readSpecs,
  readStatus,
  readTasks,
  supports,
  type TaskSummary,
  watchDir,
  writtenByReads,
} from '../jig/client.js';
import { addProject, type Project, readProjects, removeProject } from '../registry/projects.js';
import { type Watch, watchTree } from '../watch/watch.js';
import { mainCheckout } from './checkout.js';
import type {
  Attention,
  Change,
  ProjectSource,
  ProjectSpecs,
  ProjectTasks,
  ProjectView,
  Refusal,
  Task,
  TaskCounts,
  TaskDetails,
} from './project-source.js';

/** Jig's version in the checkout: `null` when Jig is there but names no version Jig UI can read. */
async function version(root: string): Promise<string | null | undefined> {
  try {
    return await jigVersion(root);
  } catch {
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
  if ((await version(checkout.root)) === undefined) {
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

/** A live task as a board's card shows it. */
const card = (t: TaskSummary & { status: Task['status'] }): Task => ({
  id: t.id,
  class: t.class,
  status: t.status,
  goal: t.goal,
  paused: t.paused,
  started: t.branch !== null,
  gate: t.gate?.state ?? null,
  autopilot: t.autopilot?.state ?? null,
  pullRequest: t.pullRequest,
});

/** A live task in full; where its worktree is was never read, and an action Jig refuses is left out. */
const details = (t: TaskSummary & { status: Task['status'] }, attention: Attention[]): TaskDetails => ({
  ...card(t),
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
});

/**
 * Runs `read` on a connected project whose Jig Jig UI reads; a project gone, below the minimum, or
 * refusing the read comes back as its state instead.
 */
async function reading<T>({ id, path }: Project, read: (root: string, jigVersion: string) => Promise<T>): Promise<T | NotReady> {
  if (!existsSync(path)) return { id, state: 'unavailable', reason: 'missing' };
  const v = await version(path);
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
    const [status, list, specs] = await Promise.all([readStatus(root), readTasks(root), readSpecs(root)]);
    return { status, list, specs, jigVersion };
  });
  if (!('list' in read)) return { view: read, tasks: read, details: [], specs: read, revision: null };
  const { status, list, specs, jigVersion } = read;
  // Jig's live list holds active and ready tasks only.
  const live = list.tasks.filter((t): t is TaskSummary & { status: Task['status'] } => t.status === 'active' || t.status === 'ready');
  return {
    view: {
      id: project.id,
      state: 'ready',
      jigVersion,
      counts: count(list.tasks),
      attention: status.attention,
      housekeepingStale: status.housekeepingStale,
    },
    tasks: { state: 'ready', tasks: live.map(card), finished: list.hidden },
    details: live.map((t) => details(t, status.attention)),
    specs: { state: 'ready', specs },
    revision: list.revision,
  };
}

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
  const listeners = new Set<(change: Change) => void>();
  let rescan: NodeJS.Timeout | undefined;
  /** Counts the times following started; a read that finishes after a stop belongs to none. */
  let session = 0;
  const following = (): boolean => rescan !== undefined;
  /** The ids the last sweep of this following found registered; none before its first. */
  let known: Set<string> | undefined;

  const entryOf = (project: Project): Entry => {
    let entry = entries.get(project.id);
    if (!entry) entries.set(project.id, (entry = { project, held: false, dirty: false, news: false }));
    return entry;
  };

  /** Keeps what was shown over one torn read; otherwise the read is what the project shows. */
  function settle(entry: Entry, read: Read): void {
    if (torn(read) && entry.shown && !torn(entry.shown) && !entry.held) {
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
    if (entry.reading) {
      entry.dirty = true;
      return entry.reading;
    }
    entry.reading = (async () => {
      do {
        entry.dirty = false;
        const before = entry.shown && JSON.stringify(entry.shown);
        settle(entry, await readProject(entry.project));
        const changed = before !== undefined && JSON.stringify(entry.shown) !== before;
        if (following() && entries.get(entry.project.id) === entry && (entry.news || changed)) {
          entry.news = false;
          signal({ id: entry.project.id, revision: entry.shown?.revision ?? null });
        }
      } while (entry.dirty);
    })().finally(() => (entry.reading = undefined));
    return entry.reading;
  }

  function signal(change: Change): void {
    for (const listener of listeners) listener(change);
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
      entry.shown = undefined;
      entry.held = false;
    }
  }

  return {
    async workspace() {
      return Promise.all((await readProjects(configDir)).map(async (p) => (await shown(p)).view));
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
    async specs(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      return project && (await shown(project)).specs;
    },
    async disconnect(id) {
      if (!(await removeProject(configDir, id))) return false;
      entries.get(id)?.watch?.close();
      entries.delete(id);
      known?.delete(id); // connected again before the next sweep, it is news again
      if (following()) signal({ id, revision: null });
      return true;
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
