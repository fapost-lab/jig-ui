import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);

/** The oldest Jig Jig UI reads and writes: 0.29.0 is the first that prints JSON, 0.31.0 the first with a queue. */
export const MIN_JIG_VERSION = '0.31.0';

const SCRIPT = '.ai/scripts/jig';
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

let gitBash: Promise<string> | undefined;

/**
 * The bash that runs `.ai/scripts/jig`. On Windows it is Git's, found next to git itself
 * (`<git>/mingw64/libexec/git-core` → `<git>/bin/bash.exe`): a `bash` on PATH may be WSL's.
 */
async function bash(platform: NodeJS.Platform): Promise<string> {
  if (platform !== 'win32') return 'bash';
  // Asked once per process; a failed ask is forgotten, so the next run asks again.
  gitBash ??= run('git', ['--exec-path'], { timeout: TIMEOUT_MS }).then(
    ({ stdout }) => resolve(stdout.trim(), '..', '..', '..', 'bin', 'bash.exe'),
    (error: unknown) => {
      gitBash = undefined;
      throw error;
    },
  );
  return gitBash;
}

/**
 * Runs the project's own Jig in its main checkout, without a shell. Git bash on Windows parses its own command line:
 * it globs an argument Node left unquoted (a one-word goal `out*` became `out.json`), and with `MSYS=noglob` it reads
 * `\"` as a backslash and a quote instead (CI, task `file-backlog-task`). There the arguments go in the environment,
 * and a fixed script hands them to Jig, so nothing parses a person's text. The script sources Jig (which finds itself
 * by `BASH_SOURCE`) rather than `exec` it: Git bash's `exec` starts a second bash and waits for it, and every run took
 * half as long again (CI, task `conflict-display`).
 */
async function jig(root: string, args: string[], platform: NodeJS.Platform): Promise<string> {
  const argv = [SCRIPT, ...args];
  const { stdout } =
    platform === 'win32'
      ? await run(await bash(platform), ['-c', `. ${argv.map((_, i) => `"$JIG_UI_ARG_${i}"`).join(' ')}`], {
          cwd: root,
          timeout: TIMEOUT_MS,
          env: { ...process.env, ...Object.fromEntries(argv.map((arg, i) => [`JIG_UI_ARG_${i}`, arg])) },
        })
      : await run(await bash(platform), argv, { cwd: root, timeout: TIMEOUT_MS });
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

const CODES = new Set(['usage', 'not-a-repository', 'not-initialised', 'stale-revision', 'not-found', 'already-exists', 'failed']);

/** Jig answered in a shape this Jig UI does not read: a Jig newer than the contract its tests pin. */
export class JigShapeError extends Error {
  constructor() {
    super('jig answered in a shape this Jig UI does not read');
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Runs a `--json` command and returns its `data` and the clone's revision — for a write, the one it was checked against. Jig's refusal throws
 * JigRefusal, as does output that is no JSON at all (a crash); an envelope of another shape throws
 * JigShapeError.
 */
async function readJson(
  root: string,
  args: string[],
  platform: NodeJS.Platform,
): Promise<{
  revision: number;
  data: Json;
}> {
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
    throw new JigRefusal(typeof code === 'string' && CODES.has(code) ? code : 'failed');
  }
  if (!isObject(envelope.data)) throw new JigShapeError();
  return { revision: envelope.revision, data: envelope.data };
}

/** `data` read through `schema`, the shape its contract test pins; anything else is a Jig this Jig UI does not read. */
function parsed<S extends z.ZodType>(schema: S, data: Json): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new JigShapeError();
  return result.data;
}

// Each shape of Jig's output once: what Jig prints (snake_case, every field Jig UI reads present —
// `null` where Jig has nothing, never left out), turned into what Jig UI's types say. Keys Jig adds
// without raising `schema` are dropped.
const text = z.string();
const maybe = z.string().nullable();
const count = z.int().nonnegative();

/** Something that needs the person, as `jig status --json` reports it; a kind this Jig UI does not know is shown by its texts. */
const Attention = z.object({
  kind: text,
  subject: z.object({ type: text, id: maybe }),
  tasks: z.array(text),
  title: text,
  detail: maybe,
  todo: text,
  url: maybe,
});
export type Attention = z.output<typeof Attention>;

const Status = z.object({
  attention: z.array(Attention),
  housekeeping: z.object({ stale: z.boolean() }).nullable(),
});

/** What needs the person in a project, most urgent first, and whether the pull request facts behind it may be missing. */
export async function readStatus(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  attention: Attention[];
  housekeepingStale: boolean;
}> {
  const { revision, data } = await readJson(root, ['status'], platform);
  const { attention, housekeeping } = parsed(Status, data);
  return { revision, attention, housekeepingStale: housekeeping?.stale === true };
}

/** Jig's action ids this Jig UI knows; Jig may add ids without raising `schema`, and a consumer ignores those. */
const ACTIONS = new Set([
  'start',
  'pause',
  'resume',
  'request-pause',
  'cancel-pause-request',
  'approve-gate',
  'answer-stop',
  'set-class',
  'ship',
  'close',
  'abandon',
  'reopen',
]);

/** What a person may do next with a task, as Jig decides it from the task's state. */
const TaskAction = z.object({
  id: text,
  /** The Jig command that takes it; a word in `<…>` is a value the person supplies. */
  command: text,
  offered: z.boolean(),
  /** Jig's refusal, word for word, when not offered; it may name a path. */
  reason: maybe,
});
export type TaskAction = z.output<typeof TaskAction>;

/** A task as `jig task list --all --json` reports it, as far as Jig UI reads it; the statuses are Jig's (schemas/state.md). */
const TaskRow = z
  .object({
    id: text,
    class: maybe,
    status: z.enum(['active', 'ready', 'consolidated', 'abandoned']),
    issue: maybe,
    goal: maybe,
    knowledge_consolidated: z.boolean(),
    paused: z.boolean(),
    /** A pause asked of the task and not yet honoured; its reason is a person's text and not read. */
    pause_request: z.object({ requested_at: text }).nullable(),
    created_at: maybe,
    updated_at: maybe,
    /** `null` while the task has not been started. */
    branch: maybe,
    base_branch: text,
    /** The worktree that has the task's branch checked out: only how many files differ there, never where it is. */
    worktree: z.object({ uncommitted: z.number() }).nullable(),
    gate: z.object({ state: text, by: maybe }).nullable(),
    autopilot: z
      .object({ state: text, mode: maybe, stage: maybe, stage_at: maybe, stop_reason: maybe, stop_at: maybe, phase: maybe })
      .nullable(),
    pull_request: z.object({ url: text, state: maybe, ci: maybe, fetched_at: maybe }).nullable(),
    housekeeping_flags: z.array(text),
    actions: z.array(TaskAction),
  })
  .transform(({ autopilot: run, pull_request: pr, ...t }) => ({
    id: t.id,
    class: t.class,
    status: t.status,
    issue: t.issue,
    goal: t.goal,
    knowledgeConsolidated: t.knowledge_consolidated,
    paused: t.paused,
    pauseRequest: t.pause_request && { requestedAt: t.pause_request.requested_at },
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    branch: t.branch,
    baseBranch: t.base_branch,
    worktree: t.worktree,
    gate: t.gate,
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
    housekeepingFlags: t.housekeeping_flags,
    actions: t.actions.filter((a) => ACTIONS.has(a.id)),
  }));
export type TaskSummary = z.output<typeof TaskRow>;

const TaskList = z.object({ tasks: z.array(TaskRow) });

/** The project's tasks, the finished ones too while Jig keeps their workspace (`jig task list --all --json`). */
export async function readTasks(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  tasks: TaskSummary[];
}> {
  const { revision, data } = await readJson(root, ['task', 'list', '--all'], platform);
  return { revision, ...parsed(TaskList, data) };
}

/** How far a roadmap or one of its phases is: items checked, all items, items with a task filed, fog items. */
const SpecProgress = z.object({ done: count, total: count, filed: count, fog: count });
export type SpecProgress = z.output<typeof SpecProgress>;

/** A roadmap item: its words as the roadmap has them, and the task it names, if any. */
const SpecItem = z.object({ text, checked: z.boolean(), task: maybe, fog: z.boolean() });
export type SpecItem = z.output<typeof SpecItem>;

/** A roadmap phase; `phase` and `title` are `null` for items before any phase heading. */
const SpecPhase = SpecProgress.extend({ phase: count.nullable(), title: maybe, items: z.array(SpecItem) });
export type SpecPhase = z.output<typeof SpecPhase>;

/** A spec as `jig spec list --json` reports it; the roadmap is read from the epic while one is open. */
const SpecRow = z
  .object({
    id: text,
    title: maybe,
    /** The spec's own files that are not there: `spec.md`, `roadmap.md`. */
    missing_files: z.array(text),
    /** The version level the epic's release raises, as the roadmap records it. */
    release: maybe,
    epic: z
      .object({ branch: text, state: z.enum(['open', 'finished']), checked_out: z.boolean(), missing: z.boolean(), ref: maybe })
      .nullable(),
    /** `null` when the roadmap could not be read. */
    progress: SpecProgress.nullable(),
    phases: z.array(SpecPhase),
  })
  .transform(({ missing_files, epic, ...s }) => ({
    id: s.id,
    title: s.title,
    missingFiles: missing_files,
    release: s.release,
    // `fetched`: the roadmap was read from the remote branch as of the last fetch; `missing`: the branch is nowhere.
    epic: epic && {
      branch: epic.branch,
      state: epic.state,
      checkedOut: epic.checked_out,
      missing: epic.missing,
      fetched: epic.ref?.startsWith('refs/remotes/') === true,
    },
    progress: s.progress,
    phases: s.phases,
  }));
export type Spec = z.output<typeof SpecRow>;

const SpecList = z.object({ specs: z.array(SpecRow) });

/** The project's specs (`jig spec list --json`), in Jig's order. */
export async function readSpecs(root: string, platform: NodeJS.Platform = process.platform): Promise<Spec[]> {
  const { data } = await readJson(root, ['spec', 'list'], platform);
  return parsed(SpecList, data).specs;
}

/** A task in Jig's queue: its level (`null` the top, `epic:<spec>` an open epic's), its place there, its priority. */
const QueueItem = z.object({
  kind: text,
  id: text,
  level: maybe,
  /** Sparse; compared only within one level. */
  position: z.int(),
  /** 0, the most urgent, to 5; `null` unset. A label: the order is `position`'s. */
  priority: z.int().min(0).max(5).nullable(),
});
export type QueueItem = Omit<z.output<typeof QueueItem>, 'kind'>;

const Queue = z.object({ items: z.array(QueueItem) });

/** The tasks in the project's queue (`jig queue list --json`), in Jig's order; a task not queued is not there, nor is an epic. */
export async function readQueue(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  items: QueueItem[];
}> {
  const { revision, data } = await readJson(root, ['queue', 'list'], platform);
  const items = parsed(Queue, data)
    .items.filter((i) => i.kind === 'task')
    .map(({ id, level, position, priority }) => ({ id, level, position, priority }));
  return { revision, items };
}

/** Where a moved task goes: after a task already in its level of the queue, or to the top or bottom of that level. */
export type Place =
  | {
      after: string;
    }
  | 'top'
  | 'bottom';

/**
 * Moves a task in the queue (`jig queue move`), adding it when it is not there; refused as `stale-revision`
 * when anything was written in the clone since `revision`. Ids go to Jig as `task:<id>`, never as a flag.
 */
export async function moveInQueue(
  root: string,
  task: string,
  place: Place,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const where = place === 'top' ? ['--top'] : place === 'bottom' ? ['--bottom'] : ['--after', `task:${place.after}`];
  await readJson(root, ['queue', 'move', `task:${task}`, ...where, '--revision', String(revision)], platform);
}

/** Sets a task's priority in the queue (`jig queue set`), `null` for none; refused as `moveInQueue` is. */
export async function setPriority(
  root: string,
  task: string,
  priority: number | null,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const value = priority === null ? 'none' : String(priority);
  await readJson(root, ['queue', 'set', `task:${task}`, '--priority', value, '--revision', String(revision)], platform);
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

/**
 * Asks a task to pause at its next stage boundary (`jig queue request … pause`); refused as `already-exists` when a
 * pause is already asked, `failed` when the task is paused or finished, and as `moveInQueue` is.
 */
export async function requestPause(
  root: string,
  task: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  await readJson(root, ['queue', 'request', `task:${task}`, 'pause', '--revision', String(revision)], platform);
}

/** Takes back a pause asked of a task (`jig queue cancel … pause`); refused as `not-found` when none is asked. */
export async function cancelPause(
  root: string,
  task: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  await readJson(root, ['queue', 'cancel', `task:${task}`, 'pause', '--revision', String(revision)], platform);
}

/**
 * Files a task with only its goal (`jig task new <id> --goal <text>`); refused as `already-exists` when the id is
 * taken — by a finished task too — and `usage` for an id or goal Jig does not take. No revision: it writes nothing
 * that exists (adr-20261022-filing-a-task-carries-no-revision).
 */
export async function fileTask(root: string, id: string, goal: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  await readJson(root, ['task', 'new', id, '--goal', goal], platform);
}
