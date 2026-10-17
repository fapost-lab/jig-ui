import { existsSync } from 'node:fs';
import { JigRefusal, JigShapeError, jigVersion, MIN_JIG_VERSION, readStatus, readTasks, supports, type TaskSummary } from '../jig/client.js';
import { addProject, type Project, readProjects, removeProject } from '../registry/projects.js';
import { mainCheckout } from './checkout.js';
import type { ProjectSource, ProjectView, Refusal, TaskCounts } from './project-source.js';

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

/** Reads a connected project; one below the minimum Jig, or gone, is not read any further. */
async function view({ id, path }: Project): Promise<ProjectView> {
  if (!existsSync(path)) return { id, state: 'unavailable', reason: 'missing' };
  const v = await version(path);
  if (v === undefined) return { id, state: 'unavailable', reason: 'no-jig' };
  if (v === null || !supports(v)) return { id, state: 'unsupported', jigVersion: v, minimum: MIN_JIG_VERSION };
  try {
    const [status, { tasks }] = await Promise.all([readStatus(path), readTasks(path)]);
    return {
      id,
      state: 'ready',
      jigVersion: v,
      counts: count(tasks),
      attention: status.attention,
      housekeepingStale: status.housekeepingStale,
    };
  } catch (error) {
    if (error instanceof JigShapeError) return { id, state: 'incompatible', jigVersion: v };
    // Only the code goes on: Jig's message may name a path.
    return { id, state: 'unreadable', code: error instanceof JigRefusal ? error.code : 'failed' };
  }
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
    disconnect(id) {
      return removeProject(configDir, id);
    },
  };
}
