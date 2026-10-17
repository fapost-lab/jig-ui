import type { Attention } from '../jig/client.js';

export type { Attention };
export { RegistryUnreadable } from '../registry/projects.js';

/** A project's live tasks by where they stand. */
export interface TaskCounts {
  active: number;
  paused: number;
  ready: number;
}

/** What the page learns about a connected project; never its path. */
export type ProjectView =
  | { id: string; state: 'ready'; jigVersion: string; counts: TaskCounts; attention: Attention[]; housekeepingStale: boolean }
  | { id: string; state: 'unsupported'; jigVersion: string | null; minimum: string }
  | { id: string; state: 'incompatible'; jigVersion: string }
  | { id: string; state: 'unavailable'; reason: 'missing' | 'no-jig' }
  | { id: string; state: 'unreadable'; code: string };

export type Refusal = { code: 'not-a-repository' | 'worktree' | 'no-jig'; message: string };

/**
 * The port through which the server reads and changes connected projects, named by id. The local
 * adapter (`local.ts`) holds the registry and runs Jig; a remote one would sit on the projects' machine.
 */
export interface ProjectSource {
  /** Every connected project, in the order it was connected. */
  workspace(): Promise<ProjectView[]>;
  /** Connects the project a path names; one already connected keeps its id. */
  connect(path: string): Promise<{ project: ProjectView; created: boolean } | Refusal>;
  /** False when no project has that id. Nothing in the project is touched. */
  disconnect(id: string): Promise<boolean>;
}
