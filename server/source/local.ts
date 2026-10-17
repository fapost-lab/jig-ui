import { existsSync } from 'node:fs';
import { jigVersion, MIN_JIG_VERSION, supports } from '../jig/client.js';
import type { Project } from '../registry/projects.js';
import { mainCheckout } from './checkout.js';

/** What the page learns about a connected project; never its path. */
export type ProjectState =
  | { id: string; state: 'ready'; jigVersion: string }
  | { id: string; state: 'unsupported'; jigVersion: string | null; minimum: string }
  | { id: string; state: 'unavailable'; reason: 'missing' | 'no-jig' };

export type Refusal = { code: 'not-a-repository' | 'worktree' | 'no-jig'; message: string };

/** Jig's version in the checkout: `null` when Jig is there but names no version Jig UI can read. */
async function version(root: string): Promise<string | null | undefined> {
  try {
    return await jigVersion(root);
  } catch {
    return null;
  }
}

/** The main checkout `path` names, or why it cannot be connected. A Jig below the minimum can. */
export async function connectable(path: string): Promise<{ root: string } | Refusal> {
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

/** Reads a connected project's state; a project below the minimum Jig is not read any further. */
export async function projectState({ id, path }: Project): Promise<ProjectState> {
  if (!existsSync(path)) return { id, state: 'unavailable', reason: 'missing' };
  const v = await version(path);
  if (v === undefined) return { id, state: 'unavailable', reason: 'no-jig' };
  if (v === null || !supports(v)) return { id, state: 'unsupported', jigVersion: v, minimum: MIN_JIG_VERSION };
  return { id, state: 'ready', jigVersion: v };
}
