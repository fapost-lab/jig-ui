import type { Attention, Place, Spec, SpecItem, SpecPhase, SpecProgress, Upgrade } from '../jig/client.js';

export type { Attention, Place, Spec, SpecItem, SpecPhase, SpecProgress, Upgrade };
export { RegistryUnreadable } from '../registry/projects.js';

/** A project's live tasks by where they stand. */
export interface TaskCounts {
  active: number;
  paused: number;
  ready: number;
}

/** What the page learns about a connected project; never its path. */
export type ProjectView =
  | {
      id: string;
      state: 'ready';
      jigVersion: string;
      counts: TaskCounts;
      attention: Attention[];
      housekeepingStale: boolean;
    }
  | {
      id: string;
      state: 'unsupported';
      jigVersion: string | null;
      minimum: string;
    }
  | {
      id: string;
      state: 'incompatible';
      jigVersion: string;
    }
  | {
      id: string;
      state: 'unavailable';
      reason: 'missing' | 'no-jig';
    }
  | {
      id: string;
      state: 'unreadable';
      code: string;
    };

type NotReady = Exclude<ProjectView, { state: 'ready' }>;

/**
 * An upgrade of a project's Jig started from the page, kept in memory while this server runs: under way, what Jig did,
 * or why it did not get there — Jig's code, and for `upgrade-blocked` its reasons.
 */
export type UpgradeRun =
  | {
      state: 'running';
      since: string;
      to: string;
    }
  | {
      state: 'done';
      at: string;
      upgrade: Upgrade;
    }
  | {
      state: 'refused';
      at: string;
      code: string;
      reasons: string[];
    };

/** A connected project as the workspace shows it, with the upgrade started from the page, if any. */
export type WorkspaceProject = ProjectView & { upgrade: UpgradeRun | null };

/** What a dry run of the upgrade came to: Jig's plan, a refusal by code, or why the project cannot be read. */
export type Planned =
  | {
      state: 'planned';
      plan: Upgrade;
    }
  | {
      state: 'refused';
      code: string;
    }
  | NotReady;

/** An upgrade asked for: under way at once, or refused — `running`, or `not-found` when the project shows none to make. */
export type Started =
  | { state: 'started' }
  | {
      state: 'refused';
      code: string;
    }
  | NotReady;

/** A live task as a board shows it; where it stands is Jig's, the column the board's. */
export interface Task {
  id: string;
  class: string | null;
  status: 'active' | 'ready';
  goal: string | null;
  paused: boolean;
  /** A pause asked of the task through Jig and not yet honoured: it pauses at its next stage boundary. */
  pauseRequest: {
    requestedAt: string;
  } | null;
  /** Jig offers to ask it to pause (its `request-pause` action); a request is taken back while there is one. */
  pauseRequestable: boolean;
  /** Paused, and resumable from the page: Jig offers its `resume` action and takes `task resume --revision` (0.35.0). */
  resumable: boolean;
  started: boolean;
  gate: string | null;
  autopilot: string | null;
  pullRequest: {
    url: string;
    state: string | null;
    ci: string | null;
    fetchedAt: string | null;
  } | null;
  /** 0, the most urgent, to 5, from Jig's queue; `null` unset or not queued. */
  priority: number | null;
  /** Where the task is in Jig's queue: its level (`null` the top, `epic:<spec>` an open epic's) and place there; `null` when not queued. */
  queue: {
    level: string | null;
    position: number;
  } | null;
}

/** One live task in full, as its details show it; never where its worktree is. */
export interface TaskDetails extends Task {
  issue: string | null;
  branch: string | null;
  baseBranch: string;
  createdAt: string | null;
  updatedAt: string | null;
  knowledgeConsolidated: boolean;
  /** How many files differ in the worktree the task's branch is checked out in. */
  worktree: { uncommitted: number } | null;
  gateBy: string | null;
  /** The autopilot run beyond its state: the stage it entered last, the question it stopped on. */
  run: {
    mode: string | null;
    stage: string | null;
    stageAt: string | null;
    stopReason: string | null;
    stopAt: string | null;
    phase: string | null;
  } | null;
  housekeepingFlags: string[];
  /** What Jig offers to do next, with its command. Refused ones are left out: Jig's reasons may name a path. */
  actions: {
    id: string;
    command: string;
  }[];
  /** What needs the person about this task, from Jig's attention items. */
  attention: Attention[];
}

/** A task that is closed or abandoned, as long as Jig keeps its workspace: housekeeping moves a closed one's to trash once it sees it merged, an abandoned one's after a while. */
export interface FinishedTask {
  id: string;
  status: 'consolidated' | 'abandoned';
  goal: string | null;
  /** The day Jig last changed the task, which for a finished one is the day it finished. */
  updatedAt: string | null;
  pullRequest: {
    url: string;
    state: string | null;
  } | null;
}

/** A project's live tasks, the finished ones Jig still keeps and the revision a write based on them carries, or why it cannot be read. */
export type ProjectTasks =
  | {
      state: 'ready';
      tasks: Task[];
      finished: FinishedTask[];
      revision: number;
    }
  | NotReady;

/** One live task of a project, `null` when the project has no live task of that id; or why the project cannot be read. */
export type ProjectTask =
  | {
      state: 'ready';
      task: TaskDetails | null;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/** A project's specs, in Jig's order, or why the project cannot be read. */
export type ProjectSpecs =
  | {
      state: 'ready';
      specs: Spec[];
    }
  | Exclude<ProjectView, { state: 'ready' }>;

export type Refusal = {
  code: 'not-a-repository' | 'worktree' | 'no-jig';
  message: string;
};

/** What a write came to: done, refused by Jig's failure code (`stale-revision`: the project changed since), or why the project cannot be read. */
export type Written =
  | { state: 'written' }
  | {
      state: 'refused';
      code: string;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/** A connected project changed; `revision` is Jig's with the read that saw it, `null` when unreadable. */
export type Change = {
  id: string;
  revision: number | null;
};

/**
 * The port through which the server reads and changes connected projects, named by id. The local
 * adapter (`local.ts`) holds the registry and runs Jig; a remote one would sit on the projects' machine.
 */
export interface ProjectSource {
  /** Every connected project, in the order it was connected. */
  workspace(): Promise<WorkspaceProject[]>;
  /** Connects the project a path names; one already connected keeps its id. */
  connect(path: string): Promise<
    | {
        project: ProjectView;
        created: boolean;
      }
    | Refusal
  >;
  /** A connected project's live tasks; `undefined` when no project has that id. */
  tasks(id: string): Promise<ProjectTasks | undefined>;
  /** One live task of a connected project; `undefined` when no project has that id. */
  task(id: string, taskId: string): Promise<ProjectTask | undefined>;
  /** A connected project's specs with their roadmaps; `undefined` when no project has that id. */
  specs(id: string): Promise<ProjectSpecs | undefined>;
  /**
   * Moves a live task in its project's queue, against the revision of the read it was based on; `place.after`
   * names another live task. `undefined` when no project has that id.
   */
  move(id: string, taskId: string, place: Place, revision: number): Promise<Written | undefined>;
  /** Sets a live task's priority, `null` for none, as `move` writes. */
  prioritise(id: string, taskId: string, priority: number | null, revision: number): Promise<Written | undefined>;
  /** Asks a live task to pause at its next stage boundary, as `move` writes. */
  requestPause(id: string, taskId: string, revision: number): Promise<Written | undefined>;
  /** Takes back the pause asked of a live task, as `move` writes. */
  cancelPause(id: string, taskId: string, revision: number): Promise<Written | undefined>;
  /** Resumes a paused live task in the project's main checkout, as `move` writes; a stash its pause kept is applied there. */
  resume(id: string, taskId: string, revision: number): Promise<Written | undefined>;
  /**
   * Files a new task with only its goal, then reads the project again. No revision: it writes nothing that exists, and
   * a taken id is Jig's `already-exists`. `undefined` when no project has that id.
   */
  fileTask(id: string, taskId: string, goal: string): Promise<Written | undefined>;
  /**
   * What upgrading the project's Jig would do, changing nothing, for a project that shows Jig's `upgrade-available`
   * item; refused `not-found` without one, `running` while its upgrade runs. `undefined` when no project has that id.
   */
  planUpgrade(id: string): Promise<Planned | undefined>;
  /**
   * Starts upgrading the project's Jig and answers at once; the run, and then what it came to, is the project's
   * `upgrade` in the workspace, and listeners hear when it starts and ends. Refused as `planUpgrade` is. No revision:
   * Jig itself answers `nothing-to-do` or `upgrade-blocked`. While it runs the project is not read again.
   */
  upgrade(id: string): Promise<Started | undefined>;
  /** Forgets what the project's last upgrade came to; one under way stays. False when no project has that id. */
  dismissUpgrade(id: string): Promise<boolean>;
  /** False when no project has that id, `upgrading` while its upgrade runs. Nothing in the project is touched. */
  disconnect(id: string): Promise<boolean | 'upgrading'>;
  /**
   * Calls `listener` whenever a connected project changed — connected and disconnected included;
   * returns the unsubscribe. Projects are followed only while someone listens.
   */
  subscribe(listener: (change: Change) => void): () => void;
}
