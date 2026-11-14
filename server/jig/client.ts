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

/**
 * The first Jig seen to take `task pause --revision --json` and to withhold `request-pause` from a task nobody started,
 * offering `pause` instead (task `pause-not-started-directly` in fapost-lab/jig).
 */
export const PAUSE_JIG_VERSION = '0.45.0';

/**
 * The first Jig that remembers an upgrade's pull request (`upgrade-pull-request-*` in `jig status`) and lands it once
 * merged (`jig upgrade --land`, fapost-lab/jig#352). The project's own Jig runs both, so they reach upgrades from it on.
 */
export const LAND_JIG_VERSION = '0.39.0';

/** The first Jig that lists a task's documents and reads one as JSON (fapost-lab/jig#347). */
export const ARTIFACTS_JIG_VERSION = '0.39.0';

/** The first Jig whose close (`task set <id> status consolidated`) takes `--revision` and `--json` (fapost-lab/jig#365). */
export const CLOSE_JIG_VERSION = '0.40.0';
/** The first Jig that lists its settings as JSON and sets them with `--revision` and `--json` (fapost-lab/jig#363). */
export const SETTINGS_JIG_VERSION = '0.40.0';
/** The first Jig that names a roadmap's items, shows the edits waiting, and adds, moves and files them (fapost-lab/jig#362). */
export const ROADMAP_JIG_VERSION = '0.40.0';
/** The first Jig that lists knowledge waiting for a decision as JSON and commits a decision on a branch of its own. */
export const KNOWLEDGE_JIG_VERSION = '0.40.0';
/**
 * The first Jig that reads a knowledge document's text (`jig knowledge read`, fapost-lab/jig#391), drops the link of an
 * approved stub whose file changed or is gone (`reject`, fapost-lab/jig#392), and says of each record whether a decision
 * on it would be judged on what the read shows.
 */
export const KNOWLEDGE_TEXT_JIG_VERSION = '0.41.0';

/** The first Jig that decides several knowledge documents, of any kinds, in one write: `jig knowledge decide`. */
export const DECIDE_JIG_VERSION = '0.44.0';
/** The first Jig that files an item's new task and names it on the item in one write (`spec item file --new`, fapost-lab/jig#390). */
export const FILE_NEW_JIG_VERSION = '0.41.0';

/**
 * The first Jig that refuses filing an item that names a task already with a code of its own, `already-filed`
 * (fapost-lab/jig#442), so its `already-exists` on `--new` says only that the id is a task's.
 */
export const FILED_JIG_VERSION = '0.42.0';
/** The first Jig that brings the clone up to origin (`jig refresh`) and says how it stands against origin (`jig status`'s `origin`). */
export const REFRESH_JIG_VERSION = '0.45.0';

const SCRIPT = '.ai/scripts/jig';
/** A read's limit: 10 s ran out with several projects read at once, each four Jig runs (task `read-timeout`). */
const TIMEOUT_MS = 30_000;
/** A dry run compares every framework file; a real upgrade at `agent.git: merge` also waits for CI. */
const PLAN_TIMEOUT_MS = 60_000;
/** A roadmap write fetches before it commits, and may push and ask the forge for the pull request. */
const ROADMAP_TIMEOUT_MS = 60_000;
/** A knowledge decision fetches, may push and ask the forge, as a roadmap edit does. */
const KNOWLEDGE_TIMEOUT_MS = 60_000;
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

/** The variables through which a token, not the clone's account, would choose who Jig asks GitHub as. */
const TOKENS = new Set(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']);

/**
 * Jig UI's environment for a Jig run, without the GitHub token variables of the shell it was started from. Jig puts such
 * a token before `github.account` and the accounts `gh` holds, so a token a direnv `.envrc` set in the folder Jig UI
 * was started in chose the account for every connected project (the maintainer, 2026-11-12: `must be a collaborator` on
 * a knowledge decision). Windows names a variable in any case.
 */
const withoutTokens = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !TOKENS.has(name.toUpperCase())));

/** A Jig run's standard output, as `ran` makes the run. */
async function jig(root: string, args: string[], platform: NodeJS.Platform, timeout = TIMEOUT_MS): Promise<string> {
  return (await ran(root, args, platform, timeout)).stdout;
}

/** What a Jig run printed, on each of its two streams. */
interface Ran {
  stdout: string;
  stderr: string;
}

/**
 * Runs the project's own Jig in its main checkout, without a shell, and answers what it printed on both streams: `jig`
 * keeps stdout, a command whose warnings matter on success reads both. Git bash on Windows parses its own command line:
 * it globs an argument Node left unquoted (a one-word goal `out*` became `out.json`), and with `MSYS=noglob` it reads
 * `\"` as a backslash and a quote instead (CI, task `file-backlog-task`). There the arguments go in the environment,
 * and a fixed script hands them to Jig, so nothing parses a person's text. The script sources Jig (which finds itself
 * by `BASH_SOURCE`) rather than `exec` it: Git bash's `exec` starts a second bash and waits for it, and every run took
 * half as long again (CI, task `conflict-display`).
 */
async function ran(root: string, args: string[], platform: NodeJS.Platform, timeout: number): Promise<Ran> {
  if (stopping) throw new Error('Jig UI is stopping');
  const argv = [SCRIPT, ...args];
  const env = withoutTokens(process.env);
  // Elsewhere each run leads a process group of its own, so that stopping Jig UI can stop all of it (`stopJig`).
  const running =
    platform === 'win32'
      ? run(await bash(platform), ['-c', `. ${argv.map((_, i) => `"$JIG_UI_ARG_${i}"`).join(' ')}`], {
          cwd: root,
          timeout,
          env: { ...env, ...Object.fromEntries(argv.map((arg, i) => [`JIG_UI_ARG_${i}`, arg])) },
        })
      : leading(await bash(platform), argv, root, env, timeout);
  runs.set(running.child, running);
  try {
    return await running;
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
function leading(
  file: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
): Promise<Ran> & { child: ChildProcess } {
  const child = spawn(file, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let [stdout, stderr, killed] = ['', '', false];
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const answer = new Promise<Ran>((resolve, reject) => {
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
      if (code === 0) resolve({ stdout, stderr });
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
    /** The document a refused knowledge decision stopped at, when Jig's line names one. */
    readonly doc?: string,
  ) {
    super(`jig refused: ${code}`);
  }
}

/**
 * Jig's text for a person with every absolute path in it cut out: no path reaches the page. Jig 0.35.0 names only
 * paths under the project, relative to it, since it runs in the project's root; this keeps a later one from leaking.
 * A slash starts a path wherever it does not continue a word or a relative path — a letter, a digit, `.`, `~`, `*`, `-`
 * or a slash before it — so `[/x`, `>/x`, `=/x` and `PATH=/x:/y` are cut too; a web address's `//` is kept. An option
 * starts a path by the same rule, whatever follows it: `-I/x`, `-isystem/x`, `-xzf/x`, `${X:-/x}`, so `-Isrc/x` loses
 * its `/x` too. A path glued to a word (`abc/Users/x`) reads as a relative one: a pattern cannot tell them apart.
 * Not a path: a backslash after anything but a blank, a quote, `(`, `=` or `:` (`[A-Z]+\.`; `C:\x` still is one), a
 * slash after a word's `)` or a `<placeholder>` (`$(pwd)/.env`, `<spec-id>/<n>`), an option pair (`-f/--force`).
 * The lookahead first keeps it linear: the look back over an option runs only where a slash follows.
 */
export const withoutPaths = (text: string): string =>
  text.replace(
    /(?=(?:[A-Za-z]:)?[\\/])(?:(?=\\)(?<=^|[\s(`'"=:])|(?!\\))(?:(?<![\w.~*/\\-]|\w\)|<[\w-]+>|:(?=\/\/[^/]))|(?<=(?<![\w.~*/\\-])-(?:[A-Za-z][\w-]*)?)(?!\/-))(?:[A-Za-z]:)?[\\/][^\s)`'"]*/g,
    '…',
  );

const CODES = new Set([
  'usage',
  'not-a-repository',
  'not-initialised',
  'stale-revision',
  'not-found',
  'already-exists',
  'not-paused',
  'already-paused',
  'wrong-checkout',
  'stash-conflict',
  'upgrade-blocked',
  'not-merged',
  'not-closable',
  'unknown-key',
  'not-local',
  'invalid-value',
  'secret-key',
  'git-not-allowed',
  'not-linkable',
  'epic-missing',
  'write-busy',
  'branch-checked-out',
  'branch-diverged',
  'branch-has-other-commits',
  'base-not-on-origin',
  'tree-in-the-way',
  'commit-refused',
  'not-proposed',
  'source-missing',
  'not-on-base',
  'not-on-branch',
  'write-still-waits',
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
 * Why Jig refused, as it said it: each line of its message with `jig: error:` and the command's own `<command>:` cut off,
 * and every absolute path cut out — `upgrade: cannot determine the framework source root; pass --from <dir>` becomes
 * `cannot determine the framework source root; pass --from <dir>`. A command of two or three words says them all
 * (`task set: `, `spec item add: `). None without a message.
 */
function said(message: unknown, args: string[]): string[] {
  if (typeof message !== 'string') return [];
  return message.split('\n').flatMap((line) => {
    let text = line.trim().replace(/^jig: error: /, '');
    const command = [args.slice(0, 3).join(' '), args.slice(0, 2).join(' '), args[0]].find((c) => c && text.startsWith(`${c}: `));
    if (command) text = text.slice(command.length + 2);
    return text ? [withoutPaths(text)] : [];
  });
}

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
    throw new JigRefusal(typeof code === 'string' && CODES.has(code) ? code : 'failed', said(message, args));
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
    // `upgrade-available` (Jig 0.34.0) carries the project's Jig and the machine's, and never goes without them; an
    // upgrade's pull request (`upgrade-pull-request-*`, Jig 0.39.0) only the version its branch is named for.
    versions: z
      .object({ from: text.optional(), to: maybe })
      .nullish()
      .transform((v) => v ?? null),
    // Only on the `upgrade-pull-request-*` kinds: the upgrade's branch, the base it goes into, `open` or `merged`.
    pull_request: z.object({ branch: text, base: text, state: text, fetched_at: maybe }).nullish(),
  })
  .refine((a) => a.kind !== 'upgrade-available' || (typeof a.versions?.from === 'string' && typeof a.versions.to === 'string'))
  .refine((a) => !['upgrade-pull-request-waiting', 'upgrade-pull-request-merged'].includes(a.kind) || a.pull_request != null)
  .transform(({ versions, pull_request, ...item }) => ({
    ...item,
    versions: item.kind === 'upgrade-available' && versions ? { from: versions.from as string, to: versions.to as string } : null,
    // The upgrade's pull request, as the forge cache of the last `jig housekeeping` had it; only on its two kinds.
    ...(pull_request
      ? { pullRequest: { branch: pull_request.branch, base: pull_request.base, state: pull_request.state, to: versions?.to ?? null } }
      : {}),
  }));
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
  /** Jig 0.45.0: the clone against origin as of its last fetch — when it fetched, and how far the base is behind. */
  origin: z.object({ fetched_at: maybe, behind: z.number().int().nonnegative().nullable() }).optional(),
});

/** How the clone stands against origin as of its last fetch, read offline; `null` from a Jig before 0.45.0. */
export type Origin = {
  fetchedAt: string | null;
  behind: number | null;
} | null;

/** What needs the person in a project, most urgent first, and whether the pull request facts behind it may be missing. */
export async function readStatus(
  root: string,
  platform: NodeJS.Platform = process.platform,
  timeout = TIMEOUT_MS,
): Promise<{
  revision: number;
  attention: Attention[];
  housekeepingStale: boolean;
  origin: Origin;
}> {
  const { revision, data } = await readJson(root, ['status'], platform, timeout);
  const { attention, housekeeping, origin } = parsed(Status, data);
  return {
    revision,
    attention,
    housekeepingStale: housekeeping?.stale === true,
    origin: origin ? { fetchedAt: origin.fetched_at, behind: origin.behind } : null,
  };
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
    /**
     * Only on Jig's staging flow (0.45.0), absent on any other: whether the task's own work is on origin's staging
     * branch (`on`), has commits after it (`behind`), or is not there.
     */
    staging: z.enum(['on', 'behind']).nullable().optional(),
    /** Beside `staging`: why the task waits at the staging branch — a pull request into it (`review`), or "prepare for prod". */
    parked: z
      .object({ reason: z.enum(['review', 'signal']), hint: z.enum(['landing']).nullable() })
      .nullable()
      .optional(),
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
    staging: t.staging,
    parked: t.parked,
  }));
export type TaskSummary = z.output<typeof TaskRow>;

/** `hidden` is what the selection left out; from Jig 0.37.0, which has `archived`, the archived ones among them. */
const TaskList = z
  .object({ tasks: z.array(TaskRow), hidden: count, archived: count.optional() })
  .transform(({ tasks, hidden, archived = 0 }) => ({
    tasks,
    finished: hidden - archived,
  }));

/** The project's live tasks and how many finished ones Jig left out of them, without reading those (`jig task list --json`). */
export async function readTasks(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  tasks: TaskSummary[];
  finished: number;
}> {
  const { revision, data } = await readJson(root, ['task', 'list'], platform);
  return { revision, ...parsed(TaskList, data) };
}

/**
 * The closed and the abandoned tasks while Jig keeps their workspace, by id as Jig sorts a list. `--status` takes one
 * status at a time, so this is two runs; an archived task is in neither.
 */
export async function readFinishedTasks(root: string, platform: NodeJS.Platform = process.platform): Promise<TaskSummary[]> {
  // Both are waited for, a failure too: an upgrade starts once this read has ended, and must find no Jig still running.
  const reads = await Promise.allSettled(
    ['consolidated', 'abandoned'].map((status) => readJson(root, ['task', 'list', '--status', status], platform)),
  );
  return reads
    .flatMap((read) => {
      if (read.status === 'rejected') throw read.reason;
      return parsed(TaskList, read.value.data).tasks;
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** How far a roadmap or one of its phases is: items checked, all items, items with a task filed, fog items. */
const SpecProgress = z.object({ done: count, total: count, filed: count, fog: count });
export type SpecProgress = z.output<typeof SpecProgress>;

/** A roadmap item: its handle (Jig 0.40.0, `null` from an older Jig), its words as the roadmap has them, and the task it names, if any. */
const SpecItem = z.object({
  id: text.nullish().transform((id) => id ?? null),
  text,
  checked: z.boolean(),
  task: maybe,
  fog: z.boolean(),
});
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
    // Jig 0.40.0: edits committed on the roadmap's write branch that have not landed, and the roadmap as it is there.
    waiting: z
      .object({
        branch: text,
        base: text,
        commits: count,
        pushed: z.boolean(),
        pr: maybe,
        progress: SpecProgress.nullable(),
        phases: z.array(SpecPhase),
      })
      .nullish()
      .transform((w) => w ?? null),
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
    waiting: s.waiting,
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

/** The documents Jig keeps for a task, in its order: the kinds `jig task artifact` writes. */
export const ARTIFACT_KINDS = [
  'task',
  'discovery',
  'spec',
  'alternatives',
  'design',
  'plan',
  'review',
  'verification',
  'handoff',
  'knowledge-map',
  'commit-message',
  'pr-body',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
const isKind = (kind: string): kind is ArtifactKind => (ARTIFACT_KINDS as readonly string[]).includes(kind);

const ArtifactRow = z
  .object({
    kind: text,
    /** `unavailable`: there, but not a file Jig reads (a link out of the workspace, unreadable); `reason` says which. */
    state: z.enum(['present', 'empty', 'missing', 'unavailable']),
    reason: maybe,
    updated_at: maybe,
    bytes: count.nullable(),
  })
  .transform(({ updated_at, ...row }) => ({ ...row, updatedAt: updated_at }));

/** A document of a task that is there: written, empty, or not readable, with Jig's word for why. */
export type Artifact = Omit<z.output<typeof ArtifactRow>, 'kind' | 'state'> & {
  kind: ArtifactKind;
  state: 'present' | 'empty' | 'unavailable';
};

const ArtifactList = z.object({ artifacts: z.array(ArtifactRow) });

/**
 * A task's documents (`jig task artifacts <id> --json`, Jig 0.39.0) that are there, in Jig's order, wherever its
 * workspace is — Jig finds a worktree's; a kind this Jig UI does not know is left out. Refused as `not-found` for a task
 * Jig does not know.
 */
export async function readArtifacts(root: string, task: string, platform: NodeJS.Platform = process.platform): Promise<Artifact[]> {
  const { data } = await readJson(root, ['task', 'artifacts', task], platform);
  return parsed(ArtifactList, data).artifacts.flatMap(({ kind, state, reason, ...row }) =>
    state !== 'missing' && isKind(kind) ? [{ kind, state, reason: reason && withoutPaths(reason), ...row }] : [],
  );
}

const ArtifactText = z
  .object({ kind: text, updated_at: maybe, bytes: count.nullable(), content: z.string() })
  .transform(({ updated_at, ...artifact }) => ({ ...artifact, updatedAt: updated_at }));

/**
 * One of a task's documents as it is written (`jig task artifact read <id> <kind> --json`, Jig 0.39.0). Refused as
 * `not-found` when the task or the document is not there, and `failed` when it is there but not readable.
 */
export async function readArtifact(
  root: string,
  task: string,
  kind: ArtifactKind,
  platform: NodeJS.Platform = process.platform,
): Promise<z.output<typeof ArtifactText>> {
  const { data } = await readJson(root, ['task', 'artifact', 'read', task, kind], platform);
  return parsed(ArtifactText, data);
}

/** The kinds of value Jig names for a setting; one it adds later is read as text. */
const SETTING_KINDS = ['boolean', 'choice', 'duration', 'number', 'text', 'list'] as const;

/**
 * Every setting Jig reads, as `jig config keys --json` lists them (Jig 0.40.0), in Jig's order. `scope` says where it may
 * be answered: `project` only in `.ai/config.yaml`, `local` in the person's `.ai/config.local.yaml` first, `local only`
 * only there. A secret's value is never printed, and one printed anyway is dropped: `set` says whether it is there.
 * Values and texts come without a path.
 */
const SettingList = z.object({
  keys: z.array(
    z
      .object({
        key: text,
        value: maybe,
        set: z.boolean(),
        source: z.enum(['local', 'project', 'default']),
        scope: z.enum(['project', 'local', 'local only']),
        kind: text,
        allowed: z.array(text).nullable(),
        default: maybe,
        description: text,
        secret: z.boolean(),
      })
      .transform(({ value, default: fallback, description, kind, secret, ...setting }) => ({
        ...setting,
        secret,
        kind: (SETTING_KINDS as readonly string[]).includes(kind) ? (kind as (typeof SETTING_KINDS)[number]) : 'text',
        value: secret ? null : value && withoutPaths(value),
        default: secret ? null : fallback && withoutPaths(fallback),
        description: withoutPaths(description),
      })),
  ),
});
export type Setting = z.output<typeof SettingList>['keys'][number];

/** The project's settings and the person's own in this clone (`jig config keys --json`, Jig 0.40.0), with the revision they were read at. */
export async function readSettings(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{
  revision: number;
  keys: Setting[];
}> {
  const { revision, data } = await readJson(root, ['config', 'keys'], platform);
  return { revision, keys: parsed(SettingList, data).keys };
}

/**
 * Sets one of the person's own settings in this clone (`jig config set <key> <value> --local`, Jig 0.40.0), never the
 * project's file; Jig checks the value. Refused as `unknown-key`, `not-local` (a key only the project's file answers),
 * `invalid-value`, `secret-key` (the Telegram token: Jig takes it only in a terminal), `usage` and `stale-revision`,
 * Jig's reason as `reasons`. Its answer, the key as it now reads, is not read: the caller reads again.
 */
export async function setSetting(
  root: string,
  key: string,
  value: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  await readJson(root, ['config', 'set', key, value, '--local', '--revision', String(revision)], platform);
}

/** Takes one of the person's own settings out of this clone's file (`jig config unset <key> --local`), so the project's or Jig's default answers; refused as `setSetting` is. */
export async function unsetSetting(
  root: string,
  key: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  await readJson(root, ['config', 'unset', key, '--local', '--revision', String(revision)], platform);
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
 * Pauses a task at once (`jig task pause <id>`), as Jig's `pause` action does: for a task nobody started, which no stage
 * would take a pause request at. Refused as `already-paused`, and as `moveInQueue` is; the task it answers is not read.
 */
export async function pauseTask(root: string, task: string, revision: number, platform: NodeJS.Platform = process.platform): Promise<void> {
  await readJson(root, ['task', 'pause', task, '--revision', String(revision)], platform);
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

/** Where a moved roadmap item goes: after another item, to the top of its own phase, or to the bottom of another phase. */
export type ItemPlace =
  | {
      after: string;
    }
  | {
      phase: number;
    }
  | 'top';

/**
 * What a write Jig commits in a tree of its own — a roadmap edit, a knowledge decision — answers that Jig UI reads: Jig's note
 * for a person, whose step is next or what failed after the commit.
 */
const WriteNote = z.object({ write: z.object({ note: maybe }) });

/**
 * Runs `jig spec item <args> --revision <n> --json`: Jig commits the edit on the spec's branch in a tree of its own and
 * goes as far as `agent.git` allows. Answers Jig's note without a path, `null` without one; the item it answers is not
 * read, the caller reads again. Refused as `stale-revision`, `not-found`, `already-exists`, `not-linkable`,
 * `git-not-allowed` (`agent.git: none`), `branch-checked-out` and the other refusals of Jig's writes in its own tree —
 * from Jig 0.41.0 `write-still-waits` too.
 */
async function roadmapWrite(root: string, args: string[], revision: number, platform: NodeJS.Platform): Promise<string | null> {
  const { data } = await readJson(root, ['spec', 'item', ...args, '--revision', String(revision)], platform, ROADMAP_TIMEOUT_MS);
  const { note } = parsed(WriteNote, data).write;
  return note && withoutPaths(note);
}

/** Adds an item with `text` at the bottom of phase `phase` of a spec's roadmap (`jig spec item add`); as `roadmapWrite`. */
export function addItem(
  root: string,
  spec: string,
  phase: number,
  text: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  return roadmapWrite(root, ['add', spec, '--phase', String(phase), '--text', text], revision, platform);
}

/** Moves a roadmap item, named by its handle (`jig spec item move`); as `roadmapWrite`. */
export function moveItem(
  root: string,
  spec: string,
  item: string,
  place: ItemPlace,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const where = place === 'top' ? ['--top'] : 'after' in place ? ['--after', place.after] : ['--phase', String(place.phase)];
  return roadmapWrite(root, ['move', spec, item, ...where], revision, platform);
}

/** Names a task filed earlier on a roadmap item and links it to the spec (`jig spec item file`); as `roadmapWrite`. */
export function fileItem(
  root: string,
  spec: string,
  item: string,
  task: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  return roadmapWrite(root, ['file', spec, item, '--task', task], revision, platform);
}

/**
 * Files a new task with its goal and names it on a roadmap item in one write (`jig spec item file --new`, from
 * `FILE_NEW_JIG_VERSION`), so the revision carried is the caller's read; as `roadmapWrite`. A refusal files nothing.
 */
export function fileNewItem(
  root: string,
  spec: string,
  item: string,
  task: string,
  goal: string,
  revision: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  return roadmapWrite(root, ['file', spec, item, '--new', task, '--goal', goal], revision, platform);
}

/** A decision on a document waiting on Jig's `knowledge/decisions` branch, its pull request's address once there is one. */
const KnowledgeWaiting = z.object({ decision: z.enum(['accepted', 'rejected', 'reviewed']), pr: maybe }).nullable();

/**
 * Jig 0.41.0, on each record: whether a decision sent now would be judged on what the read shows, and the code it would be
 * refused with when not (`not-on-base`, `not-on-branch`); `lossy` when one of the record's strings lost bytes that are not
 * UTF-8, so its file's name may be another file's. `null` from an older Jig.
 */
const Judged = {
  decidable: z
    .boolean()
    .nullish()
    .transform((d) => d ?? null),
  reason: maybe.optional().transform((r) => r ?? null),
  lossy: z
    .boolean()
    .nullish()
    .transform((l) => l ?? null),
};

const KnowledgeProposed = z.object({
  proposals: z.array(
    z.object({
      id: text,
      type: text,
      domains: z.array(text),
      /** The document's file and the files whose tasks it would bind, relative to the project. */
      path: text,
      paths: z.array(text),
      summary: maybe,
      /** The file a stub links, relative to the project. */
      source: maybe,
      waiting: KnowledgeWaiting,
      ...Judged,
    }),
  ),
  waiting: z.object({ branch: text, base: text, pushed: z.boolean(), pr: maybe }).nullable(),
});

const KnowledgeSource = z.object({ id: text, state: text, source: text, bytes: count.nullable(), waiting: KnowledgeWaiting, ...Judged });
const KnowledgeSources = z.object({ sources: z.array(KnowledgeSource) });

/** The states of an approved stub's linked file that wait for a person: changed since approved, no approved text kept, gone. */
const LOOK = ['changed', 'unrecorded', 'missing'] as const;
type Look = (typeof LOOK)[number];
const needsLook = (state: string): state is Look => (LOOK as readonly string[]).includes(state);

/** What waits for a person's decision in the project's knowledge, with the revision a decision on it carries. */
export interface Knowledge {
  revision: number;
  /** Each proposed document in Jig's order; `bytes` the size of a stub's linked file, `null` when it is gone or there is none. */
  proposals: (z.output<typeof KnowledgeProposed>['proposals'][number] & { bytes: number | null })[];
  /** Each approved stub whose linked file waits for a look, in Jig's order. */
  sources: (Omit<z.output<typeof KnowledgeSource>, 'state'> & { state: Look })[];
  /** Where the decisions taken wait, `null` when none does. */
  waiting: z.output<typeof KnowledgeProposed>['waiting'];
}

/**
 * The knowledge waiting for a person (`jig knowledge proposed --json` and `jig knowledge sources --json`, Jig 0.40.0), at
 * the lower of the two reads' revisions. Paths are the project's own, relative to it, as Jig gives them.
 */
export async function readKnowledge(root: string, platform: NodeJS.Platform = process.platform): Promise<Knowledge> {
  const [proposed, linked] = await Promise.all([
    readJson(root, ['knowledge', 'proposed'], platform),
    readJson(root, ['knowledge', 'sources'], platform),
  ]);
  const { proposals, waiting } = parsed(KnowledgeProposed, proposed.data);
  const { sources } = parsed(KnowledgeSources, linked.data);
  return {
    revision: Math.min(proposed.revision, linked.revision),
    proposals: proposals.map((p) => ({ ...p, bytes: p.source === null ? null : (sources.find((s) => s.id === p.id)?.bytes ?? null) })),
    sources: sources.flatMap(({ state, ...s }) => (needsLook(state) ? [{ ...s, state }] : [])),
    waiting,
  };
}

const SourceDiff = z.object({ diff: maybe, lossy: z.boolean() });

/**
 * How a stub's linked file changed since it was approved (`jig knowledge sources --diff <id> --json`): the unified diff as
 * Jig prints it, `null` when there is no approved text to compare with; `lossy` when bytes that are not UTF-8 were dropped.
 */
export async function readSourceDiff(
  root: string,
  id: string,
  platform: NodeJS.Platform = process.platform,
): Promise<z.output<typeof SourceDiff>> {
  const { data } = await readJson(root, ['knowledge', 'sources', '--diff', id], platform);
  return parsed(SourceDiff, data);
}

const KnowledgeText = z.object({
  content: text,
  lossy: z.boolean(),
  /** The file a stub links, as it is now; `null` for any other document, and for a stub whose file is gone. */
  source: z.object({ content: text, lossy: z.boolean() }).nullable(),
});

/**
 * A knowledge document's text (`jig knowledge read <id> --json`, Jig 0.41.0): its whole file, frontmatter included,
 * whatever its status, and for a stub the file it links; `lossy` beside each where bytes that are not UTF-8 were dropped.
 * Refused as `not-found` for an id no document has.
 */
export async function readKnowledgeText(
  root: string,
  id: string,
  platform: NodeJS.Platform = process.platform,
): Promise<z.output<typeof KnowledgeText>> {
  const { data } = await readJson(root, ['knowledge', 'read', id], platform);
  return parsed(KnowledgeText, data);
}

/** A person's decision on a knowledge document, as Jig's command is named. */
export type KnowledgeDecision = 'accept' | 'reject' | 'reviewed';

/** One document and how a person decided it. */
export interface DocumentDecision {
  doc: string;
  decision: KnowledgeDecision;
}

/**
 * Decides documents against the revision of the knowledge read they were based on, as one write: from
 * `DECIDE_JIG_VERSION` `jig knowledge decide --accept|--reject|--reviewed <id>… --revision <n> --json`, each id with the
 * flag of its decision, in the order given; below it `jig knowledge accept|reject|reviewed <id> --revision <n> --json`,
 * one decision only — more is refused `usage` without Jig. Jig commits them on `knowledge/decisions` in a tree of its
 * own and goes as far as `agent.git` allows; any refusal refuses them all, before anything is written. The revision is
 * never left out — without it Jig decides unchecked. Answers Jig's note without a path; refused as a roadmap edit is,
 * and `not-proposed` (decided already, or not a proposal) and `source-missing`; from Jig 0.41.0 also `not-on-base`,
 * `not-on-branch` (the document is not on the branch the decision is judged on yet) and `write-still-waits`. Jig's
 * line names the document it stopped at, and only there: the refusal carries it as `doc`, the one of these the line
 * names as a word of its own, not as part of a longer id.
 */
export async function decideKnowledge(
  root: string,
  decisions: DocumentDecision[],
  revision: number,
  jigVersion: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const many = supports(jigVersion, DECIDE_JIG_VERSION);
  if (decisions.length === 0 || (!many && decisions.length > 1)) throw new JigRefusal('usage');
  const named = many
    ? ['decide', ...decisions.flatMap(({ doc, decision }) => [`--${decision}`, doc])]
    : [decisions[0]!.decision, decisions[0]!.doc];
  try {
    const { data } = await readJson(root, ['knowledge', ...named, '--revision', String(revision)], platform, KNOWLEDGE_TIMEOUT_MS);
    const { note } = parsed(WriteNote, data).write;
    return note && withoutPaths(note);
  } catch (error) {
    if (!(error instanceof JigRefusal)) throw error;
    const names = (line: string, doc: string) => line.split(/[^\w-]+/).includes(doc);
    const stopped = decisions.find(({ doc }) => error.reasons.some((line) => names(line, doc)))?.doc;
    throw new JigRefusal(error.code, error.reasons, stopped);
  }
}

/** Closing asks the forge whether the task's pull request merged: a network round trip. */
const CLOSE_TIMEOUT_MS = 60_000;

/**
 * Closes a task as done (`jig task set <id> status consolidated`, the command of Jig's `close` action). Jig lets it
 * through only when the knowledge decision is recorded and the pull request, asked of the forge now, has merged — a
 * forge cache that has not heard of the merge yet withholds the action, never the command. From `CLOSE_JIG_VERSION` on,
 * Jig claims the write against `revision` itself: refused as `stale-revision`, `not-found`, or `not-closable` with Jig's
 * reason as `reasons`; the closed task it answers is not read, the caller reads again. An older Jig takes no `--revision`
 * and prints no JSON: the clone's revision is read first, and a write since `revision` is refused as `stale-revision`
 * with nothing run — a read, not a claim: a write between it and the close is not seen; Jig's own refusal throws
 * JigRefusal `failed` with its error lines, without a path.
 */
export async function closeTask(
  root: string,
  task: string,
  revision: number,
  jigVersion: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (supports(jigVersion, CLOSE_JIG_VERSION)) {
    await readJson(root, ['task', 'set', task, 'status', 'consolidated', '--revision', String(revision)], platform, CLOSE_TIMEOUT_MS);
    return;
  }
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
    // Only `--land` (Jig 0.39.0): the base checked out, and whether the upgrade's branch went here and on origin.
    land: z.object({ base: text, branch_deleted: z.boolean(), origin_branch_deleted: z.boolean() }).nullish(),
  })
  .transform(({ git, manual_steps, would_stop, land, ...rest }) => ({
    ...rest,
    // Present only on what `--land` answered.
    ...(land ? { land: { base: land.base, branchDeleted: land.branch_deleted, originBranchDeleted: land.origin_branch_deleted } } : {}),
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

/** `jig upgrade --land` asks the forge, fetches and fast-forwards: network round trips, never a prompt. */
const LAND_TIMEOUT_MS = 2 * 60_000;

/**
 * Brings an upgrade that ended in a pull request into the project's main checkout once the forge merged it
 * (`jig upgrade --land`, Jig 0.39.0): checks the base branch out, fast-forwards it to origin's, lets the upgrade's
 * branch go. Answers outcome `landed` or `nothing-to-do`; refused `not-merged` while the pull request is open, and
 * `upgrade-blocked` with its reasons for a dirty tree, another branch checked out or a base that cannot fast-forward —
 * nothing touched either way. It never stashes and never forces.
 */
export async function landUpgrade(root: string, platform: NodeJS.Platform = process.platform): Promise<Upgrade> {
  return parsed(Upgrade, (await readJson(root, ['upgrade', '--land'], platform, LAND_TIMEOUT_MS)).data);
}

/**
 * Upgrades the project's Jig (`jig upgrade`) in its main checkout, on a branch, as far as its `agent.git` lets Jig take
 * it — at `merge` Jig waits for CI first. Refused as `upgrade-blocked`, with its reasons, before anything is touched;
 * any other refusal, a failed push or pull request after the commit included, is `failed`.
 */
export async function runUpgrade(root: string, platform: NodeJS.Platform = process.platform): Promise<Upgrade> {
  return parsed(Upgrade, (await readJson(root, ['upgrade'], platform, UPGRADE_TIMEOUT_MS)).data);
}

/** Housekeeping fetches, asks the forge and may delete branches on origin: network round trips, never a terminal prompt. */
const HOUSEKEEPING_TIMEOUT_MS = 2 * 60_000;

/**
 * A path in the project's own `.ai/`, as housekeeping's report names its trash (`moved to .ai/runtime/trash/<date>/`),
 * and a trash day the way it names one it deletes, from `.ai/runtime/` (`delete trash/<date> (N days old)`).
 */
const PROJECT_PATH = /(?<![\w./~-])(?:\.ai\/|trash\/\d{4}-\d{2}-\d{2})[^\s,)`'"]*/g;

/**
 * Tidies the project as Jig's session hook does once a day (`jig housekeeping`): merged tasks' workspaces to the trash,
 * finished tasks out of the queue, the forge cache written, merged branches deleted as far as the project's settings
 * let Jig. It prints no JSON: its report is answered as Jig printed it, a line each, grouping kept, with every path cut —
 * the absolute ones, the project's own `.ai/…` and a trash day it deletes. Exit 3 is a run that finished with something
 * left for a person — a task to consolidate, a wrong base, an archive refused —, its report answered as any other. Jig's
 * warnings on stderr (a task not archived, the queue not pruned) come first: the report points up at them ("the reason
 * is above"). Another run holding the clone is a report too, Jig's `skipping` line. A failure throws JigRefusal
 * `failed` with Jig's error lines, without a path; past the limit, `timeout`.
 */
export async function housekeeping(
  root: string,
  platform: NodeJS.Platform = process.platform,
  timeout = HOUSEKEEPING_TIMEOUT_MS,
): Promise<string[]> {
  let out: Ran;
  try {
    out = await ran(root, ['housekeeping'], platform, timeout);
  } catch (error) {
    if (timedOut(error)) throw new JigRefusal('timeout');
    const ended = error as {
      code?: unknown;
      stdout?: string;
      stderr?: string;
    };
    if (ended.code !== 3) {
      const reasons = (ended.stderr ?? '').split('\n').flatMap((line) => {
        const m = /^jig: error: (?:housekeeping: )?(.+)$/.exec(line.trim());
        return m?.[1] ? [withoutPaths(m[1]).replace(PROJECT_PATH, '…')] : [];
      });
      throw new JigRefusal('failed', reasons);
    }
    out = { stdout: ended.stdout ?? '', stderr: ended.stderr ?? '' };
  }
  const lines = (text: string) =>
    text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => withoutPaths(line).replace(PROJECT_PATH, '…'));
  return [...lines(out.stderr), ...lines(out.stdout)];
}

/** `jig refresh` fetches origin as the clone's own account: a network round trip Jig bounds, never a prompt. */
const REFRESH_TIMEOUT_MS = 2 * 60_000;

/**
 * What `jig refresh` did, without git's messages or a path: `base.message` is git's own text, naming files, and
 * `checked_out_in` a worktree's path; the page says each outcome in its own words.
 */
const Refreshed = z
  .object({
    fetch: z.object({ outcome: z.enum(['done', 'failed', 'skipped']), fetched_at: maybe }),
    base: z.object({
      name: text,
      outcome: z.enum(['fast-forwarded', 'up-to-date', 'blocked-by-changes', 'checked-out-elsewhere', 'diverged', 'missing']),
      from: maybe,
      to: maybe,
    }),
    writes: z.array(z.object({ target: text, branch: text, reason: z.enum(['merged', 'landed', 'closed', 'dropped']) })),
  })
  .transform(({ fetch, base, writes }) => ({
    fetch: fetch.outcome,
    fetchedAt: fetch.fetched_at,
    base: { name: base.name, outcome: base.outcome, from: base.from, to: base.to },
    writes,
  }));
export type Refreshed = z.output<typeof Refreshed>;

/**
 * Brings the clone up to origin (`jig refresh`, Jig 0.45.0): fetches, then fast-forwards the base without moving the
 * person's checkout, and closes Jig's own writes that are over. A base that cannot move is an answer, not a refusal.
 */
export async function refresh(root: string, platform: NodeJS.Platform = process.platform): Promise<Refreshed> {
  return parsed(Refreshed, (await readJson(root, ['refresh'], platform, REFRESH_TIMEOUT_MS)).data);
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
