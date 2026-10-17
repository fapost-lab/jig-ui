import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** The oldest Jig whose reads Jig UI understands: 0.29.0 is the first that prints JSON. */
export const MIN_JIG_VERSION = '0.29.0';

const SCRIPT = join('.ai', 'scripts', 'jig');
const TIMEOUT_MS = 10_000;

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

/** A task, as far as the workspace counts it; the statuses are Jig's (schemas/state.md). */
export interface TaskSummary {
  id: string;
  status: 'active' | 'ready' | 'consolidated' | 'abandoned';
  paused: boolean;
}

const STATUSES = new Set(['active', 'ready', 'consolidated', 'abandoned']);
const isTaskSummary = (v: unknown): v is TaskSummary =>
  isObject(v) && isString(v.id) && isString(v.status) && STATUSES.has(v.status) && typeof v.paused === 'boolean';

/** The project's live tasks (`jig task list --json`, finished ones left out). */
export async function readTasks(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<{ revision: number; tasks: TaskSummary[] }> {
  const { revision, data } = await readJson(root, ['task', 'list'], platform);
  if (!Array.isArray(data.tasks) || !data.tasks.every(isTaskSummary)) throw new JigShapeError();
  return { revision, tasks: data.tasks.map(({ id, status, paused }) => ({ id, status, paused })) };
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
