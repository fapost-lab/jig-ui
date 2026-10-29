import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);

/** The oldest Jig Jig UI reads and writes: 0.29.0 is the first that prints JSON, 0.31.0 the first with a queue. */
export const MIN_JIG_VERSION = '0.31.0';

/** The first Jig whose `task resume` takes `--revision` and `--json` (fapost-lab/jig#295). */
export const RESUME_JIG_VERSION = '0.35.0';

const SCRIPT = '.ai/scripts/jig';
/** A read's limit: 10 s ran out with several projects read at once, each four Jig runs (task `read-timeout`). */
const TIMEOUT_MS = 30_000;
/** A dry run compares every framework file; a real upgrade at `agent.git: merge` also waits for CI. */
const PLAN_TIMEOUT_MS = 60_000;
const UPGRADE_TIMEOUT_MS = 30 * 60_000;

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
async function jig(root: string, args: string[], platform: NodeJS.Platform, timeout = TIMEOUT_MS): Promise<string> {
  if (stopping) throw new Error('Jig UI is stopping');
  const argv = [SCRIPT, ...args];
  // Elsewhere each run leads a process group of its own, so that stopping Jig UI can stop all of it (`stopJig`).
  const running =
    platform === 'win32'
      ? run(await bash(platform), ['-c', `. ${argv.map((_, i) => `"$JIG_UI_ARG_${i}"`).join(' ')}`], {
          cwd: root,
          timeout,
          env: { ...process.env, ...Object.fromEntries(argv.map((arg, i) => [`JIG_UI_ARG_${i}`, arg])) },
        })
      : leading(await bash(platform), argv, root, timeout);
  runs.set(running.child, running);
  try {
    return (await running).stdout;
  } finally {
    runs.delete(running.child);
  }
}

/**
 * `execFile` for a run that leads a process group of its own — `execFile` does not hand `detached` on to `spawn` — so
 * that the whole run, not only its bash, can be signalled. Answers as `execFile` does: `stdout` once the run closes with
 * 0; otherwise an error carrying `stdout`, `stderr` and, past `timeout`, `killed`. Unlike `execFile`, its output has no
 * size limit. The group has no controlling terminal: a prompt on `/dev/tty` fails instead of waiting in Jig UI's.
 */
function leading(file: string, args: string[], cwd: string, timeout: number): Promise<{ stdout: string }> & { child: ChildProcess } {
  const child = spawn(file, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let [stdout, stderr, killed] = ['', '', false];
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const answer = new Promise<{ stdout: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      killed = true;
      signalGroup(child, 'SIGTERM');
    }, timeout);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(Object.assign(error, { stdout, stderr, killed }));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout });
      else reject(Object.assign(new Error(`${file} ended with ${signal ?? code}`), { code, signal, stdout, stderr, killed }));
    });
  });
  return Object.assign(answer, { child });
}

/** Signals a run and all it started: its process group where it leads one (negative pid), else the run alone. */
function signalGroup(child: ChildProcess, name: NodeJS.Signals): void {
  try {
    if (child.pid !== undefined && process.platform !== 'win32') process.kill(-child.pid, name);
    else child.kill(name);
  } catch {
    // Already gone.
  }
}

/** Every Jig run under way. */
const runs = new Map<ChildProcess, Promise<unknown>>();

/** Jig UI is stopping: a run asked for meanwhile is refused, not started and left behind. */
let stopping = false;

/**
 * Stops every Jig run under way, as Ctrl+C in a terminal would: SIGINT to the run's whole process group — the script
 * and the git, `gh` or CI wait it started — then SIGKILL to what has not ended within `graceMs`. Jig UI calls it as it
 * stops, however it was stopped: an upgrade it started must not run on with nobody to read how it ended. `jig upgrade`
 * stopped this way leaves its branch, and the next one says what to do.
 */
export async function stopJig(graceMs = 5_000): Promise<void> {
  stopping = true;
  await Promise.all(
    [...runs].map(async ([child, ended]) => {
      const kill = setTimeout(() => signalGroup(child, 'SIGKILL'), graceMs);
      signalGroup(child, 'SIGINT');
      // Over once its answer is in — nothing it started holds its output — or a second after the SIGKILL: a process that
      // left the group (a daemon git or ssh started) may hold the output on, out of any signal's reach.
      let deadline: NodeJS.Timeout | undefined;
      await Promise.race([ended.catch(() => undefined), new Promise((done) => (deadline = setTimeout(done, graceMs + 1_000)))]);
      clearTimeout(kill);
      clearTimeout(deadline);
    }),
  );
}

/** The checkout has a Jig of its own to run. */
export const hasJig = (root: string): boolean => existsSync(join(root, SCRIPT));

/**
 * The project's Jig version, `undefined` when the checkout has no Jig. Throws when Jig is there but
 * does not answer with a version.
 */
export async function jigVersion(
  root: string,
  platform: NodeJS.Platform = process.platform,
  timeout = TIMEOUT_MS,
): Promise<string | undefined> {
  if (!existsSync(join(root, SCRIPT))) return undefined;
  let out: string;
  try {
    out = await jig(root, ['--version'], platform, timeout);
  } catch (error) {
    if (timedOut(error)) throw new JigRefusal('timeout');
    throw error;
  }
  const match = /^jig (\d+\.\d+\.\d+)\b/.exec(out.trim());
  if (!match?.[1]) throw new Error('jig --version did not print a version');
  return match[1];
}

/** Node stopped the run at its limit: Jig did not answer in time. */
const timedOut = (error: unknown): boolean => (error as { killed?: boolean }).killed === true;

/**
 * Why a JSON read was refused: Jig's failure code (`failed` for one this Jig UI does not know, or a shape it cannot
 * read; `timeout` when Jig did not answer within the limit), and for `upgrade-blocked` every reason Jig gave, without a path.
 */
export class JigRefusal extends Error {
  constructor(
    readonly code: string,
    readonly reasons: string[] = [],
  ) {
    super(`jig refused: ${code}`);
  }
}

/**
 * Jig's text for a person with every absolute path in it cut out: no path reaches the page. Jig 0.35.0 names only
 * paths under the project, relative to it, since it runs in the project's root; this keeps a later one from leaking.
 */
export const withoutPaths = (text: string): string => text.replace(/(?<=^|[\s(`'"])(?:[A-Za-z]:)?[\\/][^\s)`'"]*/g, '…');

const CODES = new Set([
  'usage',
  'not-a-repository',
  'not-initialised',
  'stale-revision',
  'not-found',
  'already-exists',
  'not-paused',
  'wrong-checkout',
  'stash-conflict',
  'upgrade-blocked',
  'failed',
]);

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
  timeout?: number,
): Promise<{
  revision: number;
  data: Json;
}> {
  let stdout: string;
  try {
    stdout = await jig(root, [...args, '--json'], platform, timeout);
  } catch (error) {
    if (timedOut(error)) throw new JigRefusal('timeout');
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
    const { code, message } = envelope.error;
    if (code === 'upgrade-blocked' && typeof message === 'string') {
      // `upgrade: nothing was changed:` and then a reason a line, as `  - <reason>`.
      const reasons = message.split('\n').flatMap((line) => (line.startsWith('  - ') ? [withoutPaths(line.slice(4))] : []));
      throw new JigRefusal(code, reasons);
    }
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
const Attention = z
  .object({
    kind: text,
    subject: z.object({ type: text, id: maybe }),
    tasks: z.array(text),
    title: text,
    detail: maybe,
    todo: text,
    url: maybe,
    // The project's Jig and the machine's. The one field left out: only `upgrade-available` carries it
    // (Jig 0.34.0), and that item never without it.
    versions: z
      .object({ from: text, to: text })
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((a) => a.kind !== 'upgrade-available' || a.versions !== null);
export type Attention = z.output<typeof Attention>;

/**
 * The release Jig's `release-available` item names, as `0.38.0`; none for another item. Jig gives it only in the title
 * (`jig v0.38.0 is out`), and knows of it per project — from that project's last `jig housekeeping` — so one project
 * may name a release another has not heard of yet.
 */
export function releaseNamed(item: Attention): string | undefined {
  if (item.kind !== 'release-available') return undefined;
  return /\bv(\d+\.\d+\.\d+)\b/.exec(item.title)?.[1];
}

const Status = z.object({
  attention: z.array(Attention),
  housekeeping: z.object({ stale: z.boolean() }).nullable(),
});

/** What needs the person in a project, most urgent first, and whether the pull request facts behind it may be missing. */
export async function readStatus(
  root: string,
  platform: NodeJS.Platform = process.platform,
  timeout = TIMEOUT_MS,
): Promise<{
  revision: number;
  attention: Attention[];
  housekeepingStale: boolean;
}> {
  const { revision, data } = await readJson(root, ['status'], platform, timeout);
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
    status: z.enum(['active', 'ready', 'consolidated', 'abandoned', 'archived']),
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
export async function readSpecs(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  specs: Spec[];
}> {
  const { revision, data } = await readJson(root, ['spec', 'list'], platform);
  return { revision, specs: parsed(SpecList, data).specs };
}

/** A task or an epic in Jig's queue: its level (`null` the top, `epic:<spec>` an open epic's), its place there, its priority, what it waits for. */
const QueueItem = z
  .object({
    kind: text,
    id: text,
    level: maybe,
    /** Sparse; compared only within one level. */
    position: z.int(),
    /** 0, the most urgent, to 5; `null` unset. A label: the order is `position`'s. */
    priority: z.int().min(0).max(5).nullable(),
    /** Another item (`task:<id>`, `epic:<spec>`) and the reason given (`jig queue depend`). */
    depends_on: z.array(z.object({ on: text, reason: text })),
  })
  .transform(({ depends_on, ...item }) => ({ ...item, dependsOn: depends_on }));
export type QueueItem = Omit<z.output<typeof QueueItem>, 'kind'>;

const Queue = z.object({ items: z.array(QueueItem) });

/** The tasks and the epics in the project's queue (`jig queue list --json`), in Jig's order; one not queued is not there. */
export async function readQueue(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  items: QueueItem[];
  epics: QueueItem[];
}> {
  const { revision, data } = await readJson(root, ['queue', 'list'], platform);
  const all = parsed(Queue, data).items;
  const of = (kind: string) =>
    all
      .filter((i) => i.kind === kind)
      .map(({ id, level, position, priority, dependsOn }) => ({ id, level, position, priority, dependsOn }));
  return { revision, items: of('task'), epics: of('epic') };
}

/** A task or an epic as Jig's queue names it, never a bare id, which could read as a flag. */
export type Ref = `task:${string}` | `epic:${string}`;

/** Where a moved item goes: after or before another of its kind already in its level of the queue, or to the top or bottom of that level. */
export type Place =
  | {
      after: string;
    }
  | {
      before: string;
    }
  | 'top'
  | 'bottom';

/**
 * Moves a task or an epic in the queue (`jig queue move`), adding it when it is not there; refused as
 * `stale-revision` when anything was written in the clone since `revision`.
 */
export async function moveInQueue(
  root: string,
  item: Ref,
  place: Place,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const kind = item.slice(0, item.indexOf(':') + 1);
  const where =
    place === 'top'
      ? ['--top']
      : place === 'bottom'
        ? ['--bottom']
        : 'after' in place
          ? ['--after', kind + place.after]
          : ['--before', kind + place.before];
  await readJson(root, ['queue', 'move', item, ...where, '--revision', String(revision)], platform);
}

/** Sets a task's or an epic's priority in the queue (`jig queue set`), `null` for none; refused as `moveInQueue` is. */
export async function setPriority(
  root: string,
  item: Ref,
  priority: number | null,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const value = priority === null ? 'none' : String(priority);
  await readJson(root, ['queue', 'set', item, '--priority', value, '--revision', String(revision)], platform);
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
 * Resumes a paused task (`jig task resume <id>`), in the main checkout. Refused as `not-paused`; `wrong-checkout` when
 * the pause kept a stash and the checkout is not on the task's branch; `stash-conflict` when that stash does not apply,
 * the task still paused; and as `moveInQueue` is. Applied, a stash is back in the checkout, as the terminal's resume.
 */
export async function resumeTask(
  root: string,
  task: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  await readJson(root, ['task', 'resume', task, '--revision', String(revision)], platform);
}

/**
 * Files a task with only its goal (`jig task new <id> --goal <text>`); refused as `already-exists` when the id is
 * taken — by a finished task too — and `usage` for an id or goal Jig does not take. No revision: it writes nothing
 * that exists (adr-20261022-filing-a-task-carries-no-revision).
 */
export async function fileTask(root: string, id: string, goal: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  await readJson(root, ['task', 'new', id, '--goal', goal], platform);
}

/** Closing asks the forge whether the task's pull request merged: a network round trip. */
const CLOSE_TIMEOUT_MS = 60_000;

/**
 * Closes a task as done (`jig task set <id> status consolidated`, the command of Jig's `close` action). Jig lets it
 * through only when the knowledge decision is recorded and the pull request, asked of the forge now, has merged — a
 * forge cache that has not heard of the merge yet withholds the action, never the command. The command takes no
 * `--revision` and prints no JSON (Jig 0.38.1): the clone's revision is read first, and a write since `revision` is
 * refused as `stale-revision` with nothing run — a read, not a claim: a write between it and the close is not seen; Jig's own refusal throws JigRefusal `failed` with its error lines,
 * without a path.
 */
export async function closeTask(root: string, task: string, revision: number, platform: NodeJS.Platform = process.platform): Promise<void> {
  if ((await readJson(root, ['queue', 'list'], platform)).revision !== revision) throw new JigRefusal('stale-revision');
  try {
    await jig(root, ['task', 'set', task, 'status', 'consolidated'], platform, CLOSE_TIMEOUT_MS);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const reasons = stderr.split('\n').flatMap((line) => {
      const m = /^jig: error: (?:task set: )?(.+)$/.exec(line.trim());
      return m?.[1] ? [withoutPaths(m[1])] : [];
    });
    throw new JigRefusal('failed', reasons);
  }
}

/** What `jig upgrade --json` did, or for `--dry-run` would do (Jig 0.34.0): Jig's texts without a path. */
const Upgrade = z
  .object({
    mode: text,
    from: maybe,
    to: maybe,
    outcome: text,
    git: z
      .object({
        level: text,
        branch: maybe,
        commit: maybe,
        pushed: z.boolean(),
        pull_request: maybe,
        merged: z.boolean(),
      })
      .nullable(),
    manual_steps: z.array(text),
    would_stop: z.array(text),
  })
  .transform(({ git, manual_steps, would_stop, ...rest }) => ({
    ...rest,
    git: git && {
      level: git.level,
      branch: git.branch,
      commit: git.commit,
      pushed: git.pushed,
      pullRequest: git.pull_request,
      merged: git.merged,
    },
    manualSteps: manual_steps.map(withoutPaths),
    wouldStop: would_stop.map(withoutPaths),
  }));
export type Upgrade = z.output<typeof Upgrade>;

/**
 * What upgrading the project's Jig would do (`jig upgrade --dry-run`), changing nothing: the versions, the steps the
 * release asks for by hand and every reason a real run would not start.
 */
export async function planUpgrade(root: string, platform: NodeJS.Platform = process.platform): Promise<Upgrade> {
  return parsed(Upgrade, (await readJson(root, ['upgrade', '--dry-run'], platform, PLAN_TIMEOUT_MS)).data);
}

/**
 * Upgrades the project's Jig (`jig upgrade`) in its main checkout, on a branch, as far as its `agent.git` lets Jig take
 * it — at `merge` Jig waits for CI first. Refused as `upgrade-blocked`, with its reasons, before anything is touched;
 * any other refusal, a failed push or pull request after the commit included, is `failed`.
 */
export async function runUpgrade(root: string, platform: NodeJS.Platform = process.platform): Promise<Upgrade> {
  return parsed(Upgrade, (await readJson(root, ['upgrade'], platform, UPGRADE_TIMEOUT_MS)).data);
}

/** `jig self-update` pulls the framework source's git remote: a network round trip, never a prompt (Jig sets it so). */
const SELF_UPDATE_TIMEOUT_MS = 2 * 60_000;

/**
 * Moves this machine's Jig — the framework checkout every project upgrades from — to its newest release (`jig self-update`),
 * run through a project's Jig, which hands it to the machine's. It touches no project. It prints no JSON:
 * what it did is its last line, as `self-update: updated 0.37.0 -> 0.38.0 (abc1234)`. A failure throws JigRefusal
 * `failed` with Jig's error lines, as `jig: error: self-update: <why>`, without a path.
 */
export async function selfUpdate(root: string, platform: NodeJS.Platform = process.platform): Promise<string> {
  let stdout: string;
  try {
    stdout = await jig(root, ['self-update'], platform, SELF_UPDATE_TIMEOUT_MS);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const reasons = stderr.split('\n').flatMap((line) => {
      const m = /^jig: error: (?:self-update: )?(.+)$/.exec(line.trim());
      return m?.[1] ? [withoutPaths(m[1])] : [];
    });
    throw new JigRefusal('failed', reasons);
  }
  const lines = stdout.trim().split('\n');
  return withoutPaths(lines.at(-1)?.trim() ?? '');
}
