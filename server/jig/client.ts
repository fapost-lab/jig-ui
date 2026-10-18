import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** The oldest Jig whose reads Jig UI understands: 0.29.0 is the first that prints JSON. */
export const MIN_JIG_VERSION = '0.29.0';

const SCRIPT = join('.ai', 'scripts', 'jig');
const TIMEOUT_MS = 10_000;

/** The directory whose changes may change what Jig reports: the main checkout's `.ai/`. */
export const watchDir = (root: string): string => join(root, '.ai');

/**
 * True for a path under `.ai/` (with `/` separators) that Jig writes while it only reads — its
 * records of what it is doing under `runtime/` — so a change there is no sign of a change, and
 * watching it would make every read trigger the next. `runtime/revision/` is where the clone's
 * revision rises on each Jig write, and stays a sign. Jig names no such path in its contract
 * (Jig 0.29.0, found by watching which files its reads touch).
 */
export const writtenByReads = (path: string): boolean =>
  (path === 'runtime' || path.startsWith('runtime/')) && !path.startsWith('runtime/revision');

/**
 * The bash that runs `.ai/scripts/jig`. On Windows it is Git's, found next to git itself
 * (`<git>/mingw64/libexec/git-core` → `<git>/bin/bash.exe`): a `bash` on PATH may be WSL's.
 */
async function bash(platform: NodeJS.Platform): Promise<string> {
  if (platform !== 'win32') return 'bash';
  const { stdout } = await run('git', ['--exec-path'], { timeout: TIMEOUT_MS });
  return resolve(stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
}

/** Runs the project's own Jig in its main checkout, without a shell. */
async function jig(root: string, args: string[], platform: NodeJS.Platform): Promise<string> {
  const { stdout } = await run(await bash(platform), [SCRIPT, ...args], { cwd: root, timeout: TIMEOUT_MS });
  return stdout;
}

/**
 * The project's Jig version, `undefined` when the checkout has no Jig. Throws when Jig is there but
 * does not answer with a version.
 */
export async function jigVersion(root: string, platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  if (!existsSync(join(root, SCRIPT))) return undefined;
  const match = /^jig (\d+\.\d+\.\d+)\b/.exec((await jig(root, ['--version'], platform)).trim());
  if (!match?.[1]) throw new Error('jig --version did not print a version');
  return match[1];
}

/** Why a JSON read was refused: Jig's failure code (`failed` for one this Jig UI does not know, or a shape it cannot read). */
export class JigRefusal extends Error {
  constructor(readonly code: string) {
    super(`jig refused: ${code}`);
  }
}

const CODES = new Set(['usage', 'not-a-repository', 'not-initialised', 'failed']);

/** Jig answered in a shape this Jig UI does not read: a Jig newer than the contract its tests pin. */
export class JigShapeError extends Error {
  constructor() {
    super('jig answered in a shape this Jig UI does not read');
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';

/**
 * Runs a `--json` read and returns its `data` and the clone's revision. Jig's refusal throws
 * JigRefusal, as does output that is no JSON at all (a crash); an envelope of another shape throws
 * JigShapeError.
 */
async function readJson(root: string, args: string[], platform: NodeJS.Platform): Promise<{ revision: number; data: Json }> {
  let stdout: string;
  try {
    stdout = await jig(root, [...args, '--json'], platform);
  } catch (error) {
    // A refusal is an envelope too, printed before the non-zero exit.
    stdout = (error as { stdout?: string }).stdout ?? '';
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new JigRefusal('failed');
  }
  if (!isObject(envelope) || envelope.schema !== 1 || typeof envelope.revision !== 'number') throw new JigShapeError();
  if (isObject(envelope.error)) {
    const code = envelope.error.code;
    throw new JigRefusal(isString(code) && CODES.has(code) ? code : 'failed');
  }
  if (!isObject(envelope.data)) throw new JigShapeError();
  return { revision: envelope.revision, data: envelope.data };
}

/** Something that needs the person, as `jig status --json` reports it; a kind this Jig UI does not know is shown by its texts. */
export interface Attention {
  kind: string;
  subject: { type: string; id: string | null };
  tasks: string[];
  title: string;
  detail: string | null;
  todo: string;
  url: string | null;
}

const isAttention = (v: unknown): v is Attention =>
  isObject(v) &&
  isString(v.kind) &&
  isObject(v.subject) &&
  isString(v.subject.type) &&
  isNullableString(v.subject.id) &&
  Array.isArray(v.tasks) &&
  v.tasks.every(isString) &&
  isString(v.title) &&
  isNullableString(v.detail) &&
  isString(v.todo) &&
  isNullableString(v.url);

/** What needs the person in a project, most urgent first, and whether the pull request facts behind it may be missing. */
export async function readStatus(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{ revision: number; attention: Attention[]; housekeepingStale: boolean }> {
  const { revision, data } = await readJson(root, ['status'], platform);
  const { attention, housekeeping } = data;
  if (!Array.isArray(attention) || !attention.every(isAttention)) throw new JigShapeError();
  if (housekeeping !== null && !(isObject(housekeeping) && typeof housekeeping.stale === 'boolean')) throw new JigShapeError();
  return {
    revision,
    attention: attention.map(({ kind, subject, tasks, title, detail, todo, url }) => ({
      kind,
      subject: { type: subject.type, id: subject.id },
      tasks: [...tasks],
      title,
      detail,
      todo,
      url,
    })),
    housekeepingStale: housekeeping?.stale === true,
  };
}

/** What a person may do next with a task, as Jig decides it from the task's state. */
export interface TaskAction {
  id: string;
  /** The Jig command that takes it; a word in `<…>` is a value the person supplies. */
  command: string;
  offered: boolean;
  /** Jig's refusal, word for word, when not offered; it may name a path. */
  reason: string | null;
}

/** A task as `jig task list --json` reports it, as far as Jig UI reads it; the statuses are Jig's (schemas/state.md). */
export interface TaskSummary {
  id: string;
  class: string | null;
  status: 'active' | 'ready' | 'consolidated' | 'abandoned';
  issue: string | null;
  goal: string | null;
  knowledgeConsolidated: boolean;
  paused: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** `null` while the task has not been started. */
  branch: string | null;
  baseBranch: string;
  /** The worktree that has the task's branch checked out: only how many files differ there, never where it is. */
  worktree: { uncommitted: number } | null;
  gate: { state: string; by: string | null } | null;
  autopilot: {
    state: string;
    mode: string | null;
    stage: string | null;
    stageAt: string | null;
    stopReason: string | null;
    stopAt: string | null;
    phase: string | null;
  } | null;
  pullRequest: { url: string; state: string | null; ci: string | null; fetchedAt: string | null } | null;
  housekeepingFlags: string[];
  actions: TaskAction[];
}

const STATUSES = new Set(['active', 'ready', 'consolidated', 'abandoned']);
/** Jig's action ids this Jig UI knows; Jig may add ids without raising `schema`, and a consumer ignores those. */
const ACTIONS = new Set(['start', 'pause', 'resume', 'approve-gate', 'answer-stop', 'set-class', 'ship', 'close', 'abandon', 'reopen']);
const nullableStrings = (v: Json, keys: string[]): boolean => keys.every((k) => isNullableString(v[k]));
const isGate = (v: unknown): boolean => v === null || (isObject(v) && isString(v.state) && isNullableString(v.by));
const isAutopilot = (v: unknown): boolean =>
  v === null || (isObject(v) && isString(v.state) && nullableStrings(v, ['mode', 'stage', 'stage_at', 'stop_reason', 'stop_at', 'phase']));
const isPullRequest = (v: unknown): boolean =>
  v === null || (isObject(v) && isString(v.url) && nullableStrings(v, ['state', 'ci', 'fetched_at']));
const isWorktree = (v: unknown): boolean => v === null || (isObject(v) && typeof v.uncommitted === 'number');
const isAction = (v: unknown): v is TaskAction =>
  isObject(v) && isString(v.id) && isString(v.command) && typeof v.offered === 'boolean' && isNullableString(v.reason);

/** A row of Jig's task list as Jig names it, only the fields Jig UI reads. */
interface TaskRow {
  id: string;
  class: string | null;
  status: TaskSummary['status'];
  issue: string | null;
  goal: string | null;
  knowledge_consolidated: boolean;
  paused: boolean;
  created_at: string | null;
  updated_at: string | null;
  branch: string | null;
  base_branch: string;
  worktree: { uncommitted: number } | null;
  gate: { state: string; by: string | null } | null;
  autopilot: {
    state: string;
    mode: string | null;
    stage: string | null;
    stage_at: string | null;
    stop_reason: string | null;
    stop_at: string | null;
    phase: string | null;
  } | null;
  pull_request: { url: string; state: string | null; ci: string | null; fetched_at: string | null } | null;
  housekeeping_flags: string[];
  actions: TaskAction[];
}

const isTaskRow = (v: unknown): v is TaskRow =>
  isObject(v) &&
  isString(v.id) &&
  isString(v.status) &&
  STATUSES.has(v.status) &&
  nullableStrings(v, ['class', 'issue', 'goal', 'created_at', 'updated_at', 'branch']) &&
  typeof v.knowledge_consolidated === 'boolean' &&
  typeof v.paused === 'boolean' &&
  isString(v.base_branch) &&
  isWorktree(v.worktree) &&
  isGate(v.gate) &&
  isAutopilot(v.autopilot) &&
  isPullRequest(v.pull_request) &&
  Array.isArray(v.housekeeping_flags) &&
  v.housekeeping_flags.every(isString) &&
  Array.isArray(v.actions) &&
  v.actions.every(isAction);

function summary(t: TaskRow): TaskSummary {
  const { gate, autopilot: run, pull_request: pr } = t;
  return {
    id: t.id,
    class: t.class,
    status: t.status,
    issue: t.issue,
    goal: t.goal,
    knowledgeConsolidated: t.knowledge_consolidated,
    paused: t.paused,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    branch: t.branch,
    baseBranch: t.base_branch,
    worktree: t.worktree && { uncommitted: t.worktree.uncommitted },
    gate: gate && { state: gate.state, by: gate.by },
    autopilot: run && {
      state: run.state,
      mode: run.mode,
      stage: run.stage,
      stageAt: run.stage_at,
      stopReason: run.stop_reason,
      stopAt: run.stop_at,
      phase: run.phase,
    },
    pullRequest: pr && { url: pr.url, state: pr.state, ci: pr.ci, fetchedAt: pr.fetched_at },
    housekeepingFlags: [...t.housekeeping_flags],
    actions: t.actions.filter((a) => ACTIONS.has(a.id)).map(({ id, command, offered, reason }) => ({ id, command, offered, reason })),
  };
}

/** The project's live tasks (`jig task list --json`) and how many finished ones it left out. */
export async function readTasks(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{ revision: number; tasks: TaskSummary[]; hidden: number }> {
  const { revision, data } = await readJson(root, ['task', 'list'], platform);
  if (!Array.isArray(data.tasks) || !data.tasks.every(isTaskRow) || typeof data.hidden !== 'number') throw new JigShapeError();
  return { revision, tasks: data.tasks.map(summary), hidden: data.hidden };
}

/** A roadmap item: its words as the roadmap has them, and the task it names, if any. */
export interface SpecItem {
  text: string;
  checked: boolean;
  task: string | null;
  fog: boolean;
}

/** How far a roadmap or one of its phases is: items checked, all items, items with a task filed, fog items. */
export interface SpecProgress {
  done: number;
  total: number;
  filed: number;
  fog: number;
}

/** A roadmap phase; `phase` and `title` are `null` for items before any phase heading. */
export interface SpecPhase extends SpecProgress {
  phase: number | null;
  title: string | null;
  items: SpecItem[];
}

/** A spec as `jig spec list --json` reports it; the roadmap is read from the epic while one is open. */
export interface Spec {
  id: string;
  title: string | null;
  /** The spec's own files that are not there: `spec.md`, `roadmap.md`. */
  missingFiles: string[];
  /** The version level the epic's release raises, as the roadmap records it. */
  release: string | null;
  /** `fetched`: the roadmap was read from the remote branch as of the last fetch; `missing`: the branch is nowhere. */
  epic: { branch: string; state: 'open' | 'finished'; checkedOut: boolean; missing: boolean; fetched: boolean } | null;
  /** `null` when the roadmap could not be read. */
  progress: SpecProgress | null;
  phases: SpecPhase[];
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isProgress = (v: unknown): v is SpecProgress =>
  isObject(v) && isCount(v.done) && isCount(v.total) && isCount(v.filed) && isCount(v.fog);
const isItem = (v: unknown): v is SpecItem =>
  isObject(v) && isString(v.text) && typeof v.checked === 'boolean' && isNullableString(v.task) && typeof v.fog === 'boolean';
const isPhase = (v: unknown): v is SpecPhase =>
  isObject(v) &&
  isProgress(v) &&
  (v.phase === null || isCount(v.phase)) &&
  isNullableString(v.title) &&
  Array.isArray(v.items) &&
  v.items.every(isItem);

/** A spec as Jig names it, only the fields Jig UI reads. */
interface SpecRow {
  id: string;
  title: string | null;
  missing_files: string[];
  release: string | null;
  epic: { branch: string; state: 'open' | 'finished'; checked_out: boolean; missing: boolean; ref: string | null } | null;
  progress: SpecProgress | null;
  phases: SpecPhase[];
}

const isEpic = (v: unknown): boolean =>
  v === null ||
  (isObject(v) &&
    isString(v.branch) &&
    (v.state === 'open' || v.state === 'finished') &&
    typeof v.checked_out === 'boolean' &&
    typeof v.missing === 'boolean' &&
    isNullableString(v.ref));

const isSpecRow = (v: unknown): v is SpecRow =>
  isObject(v) &&
  isString(v.id) &&
  isNullableString(v.title) &&
  Array.isArray(v.missing_files) &&
  v.missing_files.every(isString) &&
  isNullableString(v.release) &&
  isEpic(v.epic) &&
  (v.progress === null || isProgress(v.progress)) &&
  Array.isArray(v.phases) &&
  v.phases.every(isPhase);

const progress = ({ done, total, filed, fog }: SpecProgress): SpecProgress => ({ done, total, filed, fog });

/** The project's specs (`jig spec list --json`), in Jig's order. */
export async function readSpecs(root: string, platform: NodeJS.Platform = process.platform): Promise<Spec[]> {
  const { data } = await readJson(root, ['spec', 'list'], platform);
  if (!Array.isArray(data.specs) || !data.specs.every(isSpecRow)) throw new JigShapeError();
  return data.specs.map((s) => ({
    id: s.id,
    title: s.title,
    missingFiles: [...s.missing_files],
    release: s.release,
    epic: s.epic && {
      branch: s.epic.branch,
      state: s.epic.state,
      checkedOut: s.epic.checked_out,
      missing: s.epic.missing,
      fetched: s.epic.ref?.startsWith('refs/remotes/') === true,
    },
    progress: s.progress && progress(s.progress),
    phases: s.phases.map((p) => ({
      ...progress(p),
      phase: p.phase,
      title: p.title,
      items: p.items.map(({ text, checked, task, fog }) => ({ text, checked, task, fog })),
    })),
  }));
}

/** True when `version` is at least the minimum Jig UI reads. */
export function supports(version: string, minimum: string = MIN_JIG_VERSION): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}
