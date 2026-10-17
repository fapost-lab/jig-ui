import { existsSync } from 'node:fs';
import { JigRefusal, JigShapeError, jigVersion, MIN_JIG_VERSION, readStatus, readTasks, supports, type TaskSummary } from '../jig/client.js';
import { addProject, type Project, readProjects, removeProject } from '../registry/projects.js';
import { mainCheckout } from './checkout.js';
import type { ProjectSource, ProjectTasks, ProjectView, Refusal, TaskCounts } from './project-source.js';

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

function view(project: Project): Promise<ProjectView> {
  return reading(project, async (root, jigVersion) => {
    const [status, { tasks }] = await Promise.all([readStatus(root), readTasks(root)]);
    return {
      id: project.id,
      state: 'ready' as const,
      jigVersion,
      counts: count(tasks),
      attention: status.attention,
      housekeepingStale: status.housekeepingStale,
    };
  });
}

function tasksOf(project: Project): Promise<ProjectTasks> {
  return reading(project, async (root) => {
    const { tasks, hidden } = await readTasks(root);
    return {
      state: 'ready' as const,
      // Jig's live list holds active and ready tasks only.
      tasks: tasks.flatMap((t) =>
        t.status === 'active' || t.status === 'ready'
          ? [
              {
                id: t.id,
                class: t.class,
                status: t.status,
                goal: t.goal,
                paused: t.paused,
                started: t.branch !== null,
                gate: t.gate?.state ?? null,
                autopilot: t.autopilot?.state ?? null,
                pullRequest: t.pullRequest,
              },
            ]
          : [],
      ),
      finished: hidden,
    };
  });
}

/** The local adapter: the registry in the config directory, and Jig run in each main checkout. */
export function localSource(configDir: string): ProjectSource {
  return {
    async workspace() {
      return Promise.all((await readProjects(configDir)).map(view));
    },
    async connect(path) {
      const found = await connectable(path);
      if ('code' in found) return found;
      const { project, created } = await addProject(configDir, found.root);
      return { project: await view(project), created };
    },
    async tasks(id) {
      const project = (await readProjects(configDir)).find((p) => p.id === id);
      return project && tasksOf(project);
    },
    disconnect(id) {
      return removeProject(configDir, id);
    },
  };
}
