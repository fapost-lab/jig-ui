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

/** A live task as a board shows it; where it stands is Jig's, the column the board's. */
export interface Task {
  id: string;
  class: string | null;
  status: 'active' | 'ready';
  goal: string | null;
  paused: boolean;
  started: boolean;
  gate: string | null;
  autopilot: string | null;
  pullRequest: { url: string; state: string | null; ci: string | null } | null;
}

/** A project's live tasks and how many finished ones are left out, or why it cannot be read. */
export type ProjectTasks = { state: 'ready'; tasks: Task[]; finished: number } | Exclude<ProjectView, { state: 'ready' }>;

export type Refusal = { code: 'not-a-repository' | 'worktree' | 'no-jig'; message: string };

/** A connected project changed; `revision` is Jig's with the read that saw it, `null` when unreadable. */
export type Change = { id: string; revision: number | null };

/**
 * The port through which the server reads and changes connected projects, named by id. The local
 * adapter (`local.ts`) holds the registry and runs Jig; a remote one would sit on the projects' machine.
 */
export interface ProjectSource {
  /** Every connected project, in the order it was connected. */
  workspace(): Promise<ProjectView[]>;
  /** Connects the project a path names; one already connected keeps its id. */
  connect(path: string): Promise<{ project: ProjectView; created: boolean } | Refusal>;
  /** A connected project's live tasks; `undefined` when no project has that id. */
  tasks(id: string): Promise<ProjectTasks | undefined>;
  /** False when no project has that id. Nothing in the project is touched. */
  disconnect(id: string): Promise<boolean>;
  /**
   * Calls `listener` whenever a connected project changed — connected and disconnected included;
   * returns the unsubscribe. Projects are followed only while someone listens.
   */
  subscribe(listener: (change: Change) => void): () => void;
}
