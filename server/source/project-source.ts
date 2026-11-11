import type {
  Artifact,
  ArtifactKind,
  Attention,
  ItemPlace,
  Knowledge,
  KnowledgeDecision,
  Place,
  Setting,
  Spec,
  SpecItem,
  SpecPhase,
  SpecProgress,
  Upgrade,
} from '../jig/client.js';

export type {
  Artifact,
  ArtifactKind,
  Attention,
  ItemPlace,
  Knowledge,
  KnowledgeDecision,
  Place,
  Setting,
  Spec,
  SpecItem,
  SpecPhase,
  SpecProgress,
  Upgrade,
};
export { ARTIFACT_KINDS } from '../jig/client.js';
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
      /** The live tasks closable as done from the page, as their cards on the board say (`Task.closable`). */
      closable: string[];
      /** The revision a close from the card carries: the board's, from the same read. */
      revision: number;
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
      /** Jig's reasons, the paths cut out; none when it gave none. */
      reasons?: string[];
    }
  | NotReady;

/** An upgrade asked for: under way at once, or refused — `running`, or `not-found` when the project shows none to make. */
export type Started =
  | { state: 'started' }
  | {
      state: 'refused';
      code: string;
      /** Jig's reasons, the paths cut out; none when it gave none. */
      reasons?: string[];
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

/** A project's live tasks, how many finished ones Jig still keeps and the revision a write based on them carries, or why it cannot be read. */
export type ProjectTasks =
  | {
      state: 'ready';
      tasks: Task[];
      finishedCount: number;
      revision: number;
    }
  | NotReady;

/** The finished tasks Jig still keeps, read on demand; or why they cannot be read, which says nothing of the project's own read. */
export type ProjectFinished =
  | {
      state: 'ready';
      tasks: FinishedTask[];
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/** One live task of a project, `null` when the project has no live task of that id; or why the project cannot be read. */
export type ProjectTask =
  | {
      state: 'ready';
      task: TaskDetails | null;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/**
 * A task's documents that are there, in Jig's order, `null` when Jig has no task of that id; or why they cannot be
 * listed — a project whose Jig is older than 0.39.0 is `unsupported`, with 0.39.0 as its minimum.
 */
export type TaskArtifacts =
  | {
      state: 'ready';
      artifacts: Artifact[] | null;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/**
 * The project's settings and the person's own in this clone, every key Jig reads, with the revision they were read at; or
 * why they cannot be read — a project whose Jig is older than 0.40.0 is `unsupported`, with 0.40.0 as its minimum.
 */
export type ProjectSettings =
  | {
      state: 'ready';
      keys: Setting[];
      revision: number;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/**
 * What waits for a person's decision in a project's knowledge — proposals, approved stubs whose linked file changed, is
 * gone or has no approved text — with the revision a decision carries; or why it cannot be read. Paths in it are the
 * project's own, relative to it (adr-20261106-knowledge-decisions-from-the-page).
 */
export type ProjectKnowledge =
  | ({
      state: 'ready';
      /** Jig 0.41.0 and later: a proposal's text can be read (`knowledgeText`), and `reject` drops a stub's link. */
      canRead: boolean;
      canDrop: boolean;
    } & Knowledge)
  | Exclude<ProjectView, { state: 'ready' }>;

/** How the file a stub links changed since it was approved, `null` when it links none that changed; or why it cannot be read. */
export type SourceChange =
  | {
      state: 'ready';
      diff: {
        diff: string | null;
        lossy: boolean;
      } | null;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/**
 * A proposed document's whole file, frontmatter included, and for a stub the file it links as it is now (`null` for any
 * other document and for a stub whose file is gone), `lossy` where bytes that are not UTF-8 were dropped; `null` for a
 * document not proposed; or why it cannot be read.
 */
export type KnowledgeText =
  | {
      state: 'ready';
      text: {
        content: string;
        lossy: boolean;
        source: {
          content: string;
          lossy: boolean;
        } | null;
      } | null;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

/** One of a task's documents as it is written, `null` when the task or the document is not there; or why it cannot be read. */
export type TaskArtifact =
  | {
      state: 'ready';
      artifact: {
        kind: ArtifactKind;
        updatedAt: string | null;
        bytes: number | null;
        content: string;
      } | null;
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
 * none, each in Jig's order — and the revision a write based on them carries; `editable` when the project's Jig adds,
 * moves and files roadmap items; or why the project cannot be read.
 */
export type ProjectSpecs =
  | {
      state: 'ready';
      specs: ShownSpec[];
      revision: number;
      editable: boolean;
    }
  | Exclude<ProjectView, { state: 'ready' }>;

export type Refusal = {
  code: 'not-a-repository' | 'worktree' | 'no-jig';
  message: string;
};

/**
 * What a scan of a folder found: the main checkouts with Jig not connected yet, by path in the `~/` form the connect
 * field takes, and the folder itself in that form; the connected ones only counted. `skipped` names the home folder's
 * folders passed over because macOS asks before an app reads them; `stopped`, that the walk hit its limit.
 */
export type FoundProjects = {
  folder: string;
  found: { path: string }[];
  connected: number;
  skipped: string[];
  stopped: boolean;
};

/** What a write came to: done, refused by Jig's failure code (`stale-revision`: the project changed since), or why the project cannot be read. */
export type Written =
  | {
      state: 'written';
      /** Jig's note for the person, without a path, where a write carries one: whose step is next, or what failed after the commit (a roadmap edit). */
      note?: string;
      /** Jig's report as it printed it, a line each, without a path (housekeeping). */
      report?: string[];
    }
  | {
      state: 'refused';
      code: string;
      /** Jig's own reasons, without a path, where a command's refusal carries them (closing a task). */
      reasons?: string[];
      /** Filing an item's task on Jig 0.40.0: the task was filed, and Jig refused to name it on the item. */
      filed?: true;
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
  /**
   * Looks for Jig projects under a folder — the home folder of the machine with the projects when none is given —
   * reading folder listings only — no Jig, no git; a path that is not a folder is refused. The one answer that carries
   * paths: the person named the folder and must recognise what they connect.
   */
  scan(folder?: string): Promise<
    | FoundProjects
    | {
        code: 'not-a-folder';
        message: string;
      }
  >;
  /** A connected project's live tasks; `undefined` when no project has that id. */
  tasks(id: string): Promise<ProjectTasks | undefined>;
  /** One live task of a connected project; `undefined` when no project has that id. */
  task(id: string, taskId: string): Promise<ProjectTask | undefined>;
  /** A task's documents, read through the project's Jig at each call; `undefined` when no project has that id. */
  artifacts(id: string, taskId: string): Promise<TaskArtifacts | undefined>;
  /** One of a task's documents as it is written, read through the project's Jig; `undefined` when no project has that id. */
  artifact(id: string, taskId: string, kind: ArtifactKind): Promise<TaskArtifact | undefined>;
  /** A connected project's specs with their roadmaps; `undefined` when no project has that id. */
  specs(id: string): Promise<ProjectSpecs | undefined>;
  /** A project's finished tasks, read through Jig at each call and kept nowhere; a failure stays this read's. */
  finished(id: string): Promise<ProjectFinished | undefined>;
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
  /**
   * Adds an item with `text` at the bottom of a numbered phase of a spec's roadmap, as `move` writes: the spec and the
   * phase must be in the last read — the roadmap waiting on the spec's branch when there is one. Jig commits it on the
   * spec's branch and goes as far as `agent.git` allows; its note comes back. Below Jig 0.40.0 refused `unsupported`.
   */
  addItem(id: string, specId: string, phase: number, text: string, revision: number): Promise<Written | undefined>;
  /** Moves a roadmap item, and `place.after` names another, both in the last read; as `addItem` writes. */
  moveItem(id: string, specId: string, item: string, place: ItemPlace, revision: number): Promise<Written | undefined>;
  /**
   * Names a task on an unchecked roadmap item that names none, as `addItem` writes. A live task is named as it is, with
   * `revision`; any other id is filed with `goal` (`null`: refused `usage`) and named. From Jig 0.41.0 that is one write
   * with `revision`, and a refusal files nothing. On Jig 0.40.0 the task is filed first, then named with the revision read
   * after it — refused at once as `git-not-allowed` when the clone's `agent.git` is `none`, so nothing is filed that Jig
   * could not name — and a refusal after the filing comes back `filed`.
   */
  fileItem(id: string, specId: string, item: string, taskId: string, goal: string | null, revision: number): Promise<Written | undefined>;
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
   * Tidies the project as Jig's session hook does once a day — merged tasks' workspaces to the trash, merged branches
   * deleted as its settings allow — then reads it again, answering Jig's report. No revision and no live id: it acts on
   * the clone as it is when it runs, under Jig's own lock. Refused `upgrading` while the project's upgrade runs.
   * `undefined` when no project has that id.
   */
  housekeeping(id: string): Promise<Written | undefined>;
  /** A connected project's settings, read through its Jig at each call; `undefined` when no project has that id. */
  settings(id: string): Promise<ProjectSettings | undefined>;
  /**
   * Sets one of the person's own settings in the project's clone, never the project's file, against the revision of the
   * settings read, then reads the project again. A project whose Jig is older than 0.40.0 is refused `unsupported`, Jig
   * not run. `undefined` when no project has that id.
   */
  setSetting(id: string, key: string, value: string, revision: number): Promise<Written | undefined>;
  /** Takes one of the person's own settings out of the clone's file, so the project's value or Jig's default answers, as `setSetting` writes. */
  unsetSetting(id: string, key: string, revision: number): Promise<Written | undefined>;
  /** What waits for a person's decision in a connected project's knowledge, read through its Jig at each call; `undefined` when no project has that id. */
  knowledge(id: string): Promise<ProjectKnowledge | undefined>;
  /**
   * How the file a stub links changed since it was approved, read through the project's Jig for a stub a knowledge read
   * just before lists as `changed` — anything else is `null`, Jig not run. `undefined` when no project has that id.
   */
  knowledgeDiff(id: string, docId: string): Promise<SourceChange | undefined>;
  /**
   * A proposed document's text, read through the project's Jig for a document a knowledge read just before lists as
   * proposed — anything else is `null`, Jig not run. Below Jig 0.41.0 `unsupported`. `undefined` when no project has that id.
   */
  knowledgeText(id: string, docId: string): Promise<KnowledgeText | undefined>;
  /**
   * Decides one document against the revision of the knowledge read it was based on: `accept` or `reject` a proposal,
   * `reviewed` keeps a stub's changed or unrecorded file, and from Jig 0.41.0 `reject` drops the link of a stub whose file
   * changed, has no approved text or is gone. Jig runs only for what a knowledge read just before lists as open to that
   * decision — else `refused: not-found` —, commits it on `knowledge/decisions` and goes as far as `agent.git` allows; its
   * note comes back. A document not yet where the decision is judged is `refused: not-on-base` or `not-on-branch` by Jig
   * 0.41.0; Jig 0.40.0 does not find it, as the branch starts from origin's base, and that is `refused: not-on-branch`
   * too. Below Jig 0.40.0 refused `unsupported`. `undefined` when no project has that id.
   */
  decideKnowledge(id: string, docId: string, decision: KnowledgeDecision, revision: number): Promise<Written | undefined>;
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
