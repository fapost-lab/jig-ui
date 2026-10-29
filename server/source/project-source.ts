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
      /** Landing a merged upgrade (`jig upgrade --land`), not upgrading. */
      landing?: boolean;
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

/** This machine's Jig moved to its newest release from the page (`jig self-update`): under way, what Jig said, or why not. */
export type SelfUpdateRun =
  | {
      state: 'running';
      since: string;
    }
  | {
      state: 'done';
      at: string;
      /** Jig's line, as `self-update: updated 0.37.0 -> 0.38.0 (abc1234)`. */
      said: string;
    }
  | {
      state: 'failed';
      at: string;
      reasons: string[];
    };

/**
 * Every connected project upgraded from the page one at a time: this machine's Jig first when a release is out, then
 * each project that shows an upgrade to make, in the order they were connected. Each project's own run is its `upgrade`.
 */
export type UpgradeAllRun =
  | {
      state: 'running';
      since: string;
      /** The project being upgraded now; `null` while this machine's Jig is updated or the projects are read. */
      current: string | null;
      /** The projects upgraded so far, in order. */
      upgraded: string[];
    }
  | {
      state: 'done';
      at: string;
      upgraded: string[];
      /** The connected projects left alone: up to date, or not readable. */
      skipped: string[];
      /** Why it stopped before the projects: this machine's Jig could not be updated. */
      failed: string[] | null;
    };

/** What the workspace shows beyond its projects: the runs that change this machine's Jig or many projects. */
export interface Machine {
  /**
   * The newest Jig release a connected project's last read names (`release-available`), as `0.38.0`: a fact of the
   * machine, not of one project — each project hears of a release only at its own housekeeping. `null` when none does.
   */
  release: string | null;
  selfUpdate: SelfUpdateRun | null;
  upgradeAll: UpgradeAllRun | null;
  /** Check all merges is under way. */
  landingAll: boolean;
}

/** What Check all merges came to: the projects whose upgrade landed, whose pull request is still open, and the rest. */
export interface LandedAll {
  landed: string[];
  waiting: string[];
  /** Refused otherwise — a dirty tree, another branch checked out — or failed; each card says why. */
  stopped: string[];
}

/** A connected project as the workspace shows it, with the upgrade started from the page, if any. */
/**
 * An upgrade of the project that ended in a pull request and waits for it: still open, or merged and not brought here
 * yet. Only where the project's Jig can land it (0.39.0).
 */
export interface MergeWait {
  state: 'open' | 'merged';
  /** The version the upgrade goes to; `null` when Jig does not know it. */
  to: string | null;
  url: string | null;
}

export type WorkspaceProject = ProjectView & {
  upgrade: UpgradeRun | null;
  /** Present while an upgrade waits for its pull request: the card offers Check merge, not Upgrade. */
  mergeWait?: MergeWait;
};

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
  /**
   * Ready, and closable as done from the page: Jig offers its `close` action, or withholds it only because its forge
   * cache has not heard of a merge — the knowledge decision is recorded and the pull request is not closed unmerged.
   * Jig itself asks the forge when it closes.
   */
  closable: boolean;
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
  /** Its place among the items of its level in the queue, tasks and epics alike, 1 the first; `null` when not queued. */
  place: {
    rank: number;
    of: number;
  } | null;
  /** What it waits for in Jig's queue: another item (`task:<id>`, `epic:<spec>`) and the reason given, listed as declared, met or not. `through` names the epic whose dependency it inherits, `null` for its own. */
  dependsOn: {
    on: string;
    reason: string;
    through: string | null;
  }[];
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

/** A spec with its open epic's place in Jig's queue: `null` without an open epic, or with one not queued. */
export type ShownSpec = Spec & {
  queue: {
    position: number;
    priority: number | null;
  } | null;
};

/**
 * A project's specs — the queued epics first, in the queue's order, then the other open epics, then the specs with
 * none, each in Jig's order — and the revision a write based on them carries; or why the project cannot be read.
 */
export type ProjectSpecs =
  | {
      state: 'ready';
      specs: ShownSpec[];
      revision: number;
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
      /** Jig's own reasons, without a path, where a command's refusal carries them (closing a task). */
      reasons?: string[];
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
  /** The ids of the connected projects, in the order they were connected, without reading any. */
  connected(): Promise<string[]>;
  /** One connected project as the workspace shows it; `undefined` when no project has that id. */
  project(id: string): Promise<WorkspaceProject | undefined>;
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
  /** Reads a connected project through Jig now, as a person's Read again asks; `undefined` when no project has that id. */
  readAgain(id: string): Promise<ProjectView | undefined>;
  /**
   * Moves a live task in its project's queue, against the revision of the read it was based on; `place.after`
   * names another live task. `undefined` when no project has that id.
   */
  move(id: string, taskId: string, place: Place, revision: number): Promise<Written | undefined>;
  /** Moves the open epic of a spec in the queue, as `move` writes; `place.after` and `place.before` name another one. */
  moveEpic(id: string, specId: string, place: Place, revision: number): Promise<Written | undefined>;
  /** Sets the priority of a spec's open epic, `null` for none, as `move` writes. */
  prioritiseEpic(id: string, specId: string, priority: number | null, revision: number): Promise<Written | undefined>;
  /** Sets a live task's priority, `null` for none, as `move` writes. */
  prioritise(id: string, taskId: string, priority: number | null, revision: number): Promise<Written | undefined>;
  /** Asks a live task to pause at its next stage boundary, as `move` writes. */
  requestPause(id: string, taskId: string, revision: number): Promise<Written | undefined>;
  /** Takes back the pause asked of a live task, as `move` writes. */
  cancelPause(id: string, taskId: string, revision: number): Promise<Written | undefined>;
  /** Resumes a paused live task in the project's main checkout, as `move` writes; a stash its pause kept is applied there. */
  resume(id: string, taskId: string, revision: number): Promise<Written | undefined>;
  /**
   * Closes a closable live task as done, as `move` writes; any other is refused `not-found` without running Jig. Jig's
   * refusal — the pull request not merged, the knowledge decision not recorded — comes back with its reasons.
   */
  close(id: string, taskId: string, revision: number): Promise<Written | undefined>;
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
  /** The runs started from the page that change this machine's Jig or every project. */
  machine(): Machine;
  /**
   * Moves this machine's Jig to its newest release and answers once it has, then reads every project again: they now
   * show the upgrade it makes possible. Touches no project. Refused `running` while it, an upgrade or Upgrade all runs,
   * `not-found` when no connected project has a Jig to run it through.
   */
  selfUpdate(): Promise<
    | {
        state: 'done';
        said: string;
      }
    | {
        state: 'failed';
        reasons: string[];
      }
    | {
        state: 'refused';
        code: string;
      }
  >;
  /**
   * Starts upgrading every connected project and answers at once: this machine's Jig first when a project says a
   * release is out, then one project at a time. Refused `running` while it, a self-update or an upgrade runs.
   */
  upgradeAll(): Promise<
    | { state: 'started' }
    | {
        state: 'refused';
        code: string;
      }
  >;
  /**
   * Checks whether the project's upgrade pull request was merged and, if so, brings it here (`jig upgrade --land`, Jig
   * 0.39.0): the base branch checked out and fast-forwarded. Answers once Jig has; what it came to is the project's
   * `upgrade` — Jig's answer, or refused `not-merged` while the pull request is open. Refused `not-found` without an
   * upgrade pull request to check, `running` while an upgrade runs. `undefined` when no project has that id.
   */
  land(id: string): Promise<
    | { state: 'ended' }
    | {
        state: 'refused';
        code: string;
      }
    | NotReady
    | undefined
  >;
  /** Checks every project's upgrade pull request in turn, as `land` does each. Refused `running` while an upgrade runs. */
  landAll(): Promise<
    | {
        state: 'ended';
        landed: LandedAll;
      }
    | {
        state: 'refused';
        code: string;
      }
  >;
  /** Forgets what the last Upgrade all and self-update came to; one under way stays. */
  dismissUpgradeAll(): void;
  /** False when no project has that id, `upgrading` while its upgrade runs. Nothing in the project is touched. */
  disconnect(id: string): Promise<boolean | 'upgrading'>;
  /**
   * Calls `listener` whenever a connected project changed — connected and disconnected included;
   * returns the unsubscribe. Projects are followed only while someone listens.
   */
  subscribe(listener: (change: Change) => void): () => void;
}
