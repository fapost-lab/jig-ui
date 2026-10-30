import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { addProject } from '../registry/projects.js';
import { localSource } from './local.js';
import { tilde } from './scan.js';
import type { Change } from './project-source.js';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'jig-ui-source-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const envelope = (data: unknown) => JSON.stringify({ schema: 1, revision: 7, generated_at: '2026-10-17T00:00:00Z', data });
/** A task-list row in Jig's shape: started, nothing waiting, no pull request, unless `more` says otherwise. */
const task = (id: string, status: string, paused = false, more: Record<string, unknown> = {}) => ({
  id,
  class: 'T2',
  status,
  issue: null,
  goal: `Goal of ${id}`,
  knowledge_consolidated: false,
  paused,
  pause_request: null,
  created_at: '2026-10-17',
  updated_at: '2026-10-17',
  branch: `task/${id}`,
  base_branch: 'main',
  worktree: null,
  gate: null,
  autopilot: null,
  pull_request: null,
  housekeeping_flags: [],
  actions: [],
  ...more,
});
const attention = {
  kind: 'gate-waiting',
  subject: { type: 'task', id: 'b' },
  tasks: ['b'],
  title: 'Design waits at its gate',
  detail: null,
  todo: 'Approve it.',
  url: null,
};

/**
 * A git clone whose Jig answers `--version`, `status --json`, `task list --all --json` and `spec list --json` from files, and
 * logs every call to `calls.log`. `status` given as a string is printed as is, with exit 1.
 */
function project(
  name: string,
  version: string,
  answers: {
    status?: unknown;
    tasks?: unknown;
    specs?: unknown;
    queue?: unknown;
    /** What `queue move`, `set`, `request`, `cancel`, `task new` and `task resume` print, once no file `hold` is in the project: an envelope's `data`, or a refusal's code. */
    write?: unknown;
    /** What `upgrade --dry-run` prints, as `data`, or a whole envelope as a string. */
    plan?: unknown;
    /** What `upgrade` prints once a file `go` is in the project: an envelope's `data`, or a whole envelope as a string. */
    upgrade?: unknown;
    /** What `upgrade --land --json` prints once no file `hold-land` is in the project: an envelope's `data`, or a whole envelope as a string (a refusal, with exit 1). */
    land?: unknown;
    /** What `self-update` does once no file `hold-self` is in the project; given `statusAfter`, it also replaces status.json with it, as a new Jig would. */
    selfUpdate?: {
      out?: string;
      err?: string;
      code?: number;
      statusAfter?: unknown;
    };
    /** What `task artifacts` (once no file `hold-artifacts` is in the project) and `task artifact read` print: an envelope's `data`, or a refusal's code. */
    artifacts?: unknown;
    artifact?: unknown;
    /** What `task set` prints on stderr, and its exit code. */
    set?: {
      err?: string;
      code?: number;
    };
  } = {},
): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const refused = typeof answers.status === 'string';
  writeFileSync(
    join(dir, 'status.json'),
    refused ? (answers.status as string) : envelope(answers.status ?? { attention: [], housekeeping: null }),
  );
  writeFileSync(join(dir, 'tasks.json'), envelope(answers.tasks ?? { tasks: [], hidden: 0, housekeeping: null }));
  writeFileSync(join(dir, 'specs.json'), typeof answers.specs === 'string' ? answers.specs : envelope(answers.specs ?? { specs: [] }));
  writeFileSync(join(dir, 'queue.json'), envelope(answers.queue ?? { items: [] }));
  const write = answers.write ?? { ref: 'task:x', item: null };
  writeFileSync(
    join(dir, 'write.json'),
    typeof write === 'string'
      ? JSON.stringify({ schema: 1, revision: 9, generated_at: 'x', error: { code: write, message: 'refused' } })
      : envelope(write),
  );
  const answer = (data: unknown) =>
    typeof data === 'string'
      ? JSON.stringify({ schema: 1, revision: 9, generated_at: 'x', error: { code: data, message: 'refused' } })
      : envelope(data);
  writeFileSync(join(dir, 'artifacts.json'), answer(answers.artifacts ?? { task: 'x', artifacts: [] }));
  writeFileSync(join(dir, 'artifact.json'), answer(answers.artifact ?? 'not-found'));
  writeFileSync(join(dir, 'plan.json'), typeof answers.plan === 'string' ? answers.plan : envelope(answers.plan ?? {}));
  writeFileSync(join(dir, 'upgrade.json'), typeof answers.upgrade === 'string' ? answers.upgrade : envelope(answers.upgrade ?? {}));
  writeFileSync(join(dir, 'land.json'), typeof answers.land === 'string' ? answers.land : envelope(answers.land ?? {}));
  const self = answers.selfUpdate ?? {};
  writeFileSync(join(dir, 'self.out'), self.out ?? 'self-update: already current');
  writeFileSync(join(dir, 'self.err'), self.err ?? '');
  writeFileSync(join(dir, 'set.err'), answers.set?.err ?? '');
  if (self.statusAfter !== undefined) writeFileSync(join(dir, 'status-after.json'), envelope(self.statusAfter));
  writeFileSync(
    join(dir, '.ai', 'scripts', 'jig'),
    `#!/usr/bin/env bash
echo "$*" >> calls.log
case "$*" in
  --version) echo "jig ${version}" ;;
  "status --json") cat status.json; exit ${refused ? 1 : 0} ;;
  "task list --all --json") cat tasks.json ;;
  "spec list --json") cat specs.json ;;
  "queue list --json") cat queue.json ;;
  "queue move "*|"queue set "*|"queue request "*|"queue cancel "*|"task new "*|"task resume "*) while [ -f hold ]; do sleep 0.05; done; cat write.json; if grep -q '"error"' write.json; then exit 1; fi ;;
  "task artifacts "*) while [ -f hold-artifacts ]; do sleep 0.05; done; cat artifacts.json; if grep -q '"error"' artifacts.json; then exit 1; fi ;;
  "task artifact read "*) cat artifact.json; if grep -q '"error"' artifact.json; then exit 1; fi ;;
  "task set "*) cat set.err >&2; exit ${answers.set?.code ?? 0} ;;
  "upgrade --dry-run --json") cat plan.json ;;
  "self-update") while [ -f hold-self ]; do sleep 0.05; done; cat self.out; echo; cat self.err >&2; if [ -f status-after.json ] && [ ${self.code ?? 0} -eq 0 ]; then cp status-after.json status.json; fi; exit ${self.code ?? 0} ;;
  "upgrade --land --json") while [ -f hold-land ]; do sleep 0.05; done; cat land.json; if grep -q '"error"' land.json; then exit 1; fi ;;
  "upgrade --json") while [ ! -f go ]; do sleep 0.05; done; cat upgrade.json; if grep -q '"error"' upgrade.json; then exit 1; fi ;;
esac
`,
  );
  return dir;
}

const calls = (dir: string) => readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');

describe('localSource, finding projects', () => {
  const source = localSource(join(root, 'scan-config'));

  it('finds the Jig projects under a folder by path, counts the connected ones, and runs no Jig there', async () => {
    const one = project('scan/one', '0.31.0');
    const two = project('scan/nested/two', '0.31.0');
    await source.connect(two);
    const ran = calls(two).length;
    const shown = (path: string) => tilde(path, realpathSync.native(homedir())); // the temporary folder is in the home folder on Windows
    expect(await source.scan(join(root, 'scan'))).toEqual({
      folder: shown(join(root, 'scan')),
      found: [{ path: shown(one) }],
      connected: 1,
      skipped: [],
      stopped: false,
    });
    expect(() => calls(one)).toThrow(); // no calls.log: its Jig never ran
    expect(calls(two)).toHaveLength(ran);
  });

  it('refuses a path that is not a folder', async () => {
    const refused = { code: 'not-a-folder', message: 'There is no folder at this path.' };
    expect(await source.scan(join(root, 'nowhere'))).toEqual(refused);
    expect(await source.scan(join(root, 'scan', 'one', 'status.json'))).toEqual(refused);
  });
});

describe("localSource, a task's documents", () => {
  const source = localSource(join(root, 'documents-config'));
  const row = (kind: string, state: string, reason: string | null = null) => ({
    kind,
    state,
    reason,
    updated_at: state === 'unavailable' ? null : '2026-10-30T07:00:00Z',
    bytes: state === 'unavailable' ? null : 7,
  });

  const live = { tasks: [task('b', 'active')], hidden: 0, housekeeping: null };

  it("lists a task's documents that are there and reads one, through the project's Jig", async () => {
    const dir = project('documents', '0.39.0', {
      tasks: live,
      artifacts: {
        task: 'b',
        artifacts: [row('task', 'present'), row('spec', 'missing'), row('handoff', 'unavailable', 'outside workspace')],
      },
      artifact: { task: 'b', kind: 'plan', updated_at: '2026-10-30T07:00:00Z', bytes: 7, content: '# Plan\n' },
    });
    await source.connect(dir);
    expect(await source.artifacts('documents', 'b')).toEqual({
      state: 'ready',
      artifacts: [
        { kind: 'task', state: 'present', reason: null, updatedAt: '2026-10-30T07:00:00Z', bytes: 7 },
        { kind: 'handoff', state: 'unavailable', reason: 'outside workspace', updatedAt: null, bytes: null },
      ],
    });
    expect(await source.artifact('documents', 'b', 'plan')).toEqual({
      state: 'ready',
      artifact: { kind: 'plan', updatedAt: '2026-10-30T07:00:00Z', bytes: 7, content: '# Plan\n' },
    });
    expect(calls(dir)).toEqual(expect.arrayContaining(['task artifacts b --json', 'task artifact read b plan --json']));
  });

  it('answers null for a task or a document Jig does not have, and the code of another refusal', async () => {
    await source.connect(project('documents-none', '0.39.0', { tasks: live, artifacts: 'not-found' }));
    expect(await source.artifacts('documents-none', 'b')).toEqual({ state: 'ready', artifacts: null });
    expect(await source.artifact('documents-none', 'b', 'plan')).toEqual({ state: 'ready', artifact: null });
    await source.connect(project('documents-failed', '0.39.0', { tasks: live, artifact: 'failed' }));
    expect(await source.artifact('documents-failed', 'b', 'plan')).toEqual({ id: 'documents-failed', state: 'unreadable', code: 'failed' });
  });

  it('asks no older Jig, and knows no project it does not have', async () => {
    const dir = project('documents-old', '0.38.1');
    await source.connect(dir);
    const unsupported = { id: 'documents-old', state: 'unsupported', jigVersion: '0.38.1', minimum: '0.39.0' };
    expect(await source.artifacts('documents-old', 'b')).toEqual(unsupported);
    expect(await source.artifact('documents-old', 'b', 'plan')).toEqual(unsupported);
    expect(calls(dir).filter((c) => c.startsWith('task artifact'))).toEqual([]);
    expect(await source.artifacts('nobody', 'b')).toBeUndefined();
  });

  it('hands Jig only the id of a task the board shows', async () => {
    const finished = { tasks: [task('b', 'active'), task('done', 'consolidated')], hidden: 0, housekeeping: null };
    const dir = project('documents-ids', '0.39.0', { tasks: finished, artifacts: { task: 'b', artifacts: [row('task', 'present')] } });
    await source.connect(dir);
    for (const id of ['--help', 'done', 'nope']) {
      expect(await source.artifacts('documents-ids', id)).toEqual({ state: 'ready', artifacts: null });
      expect(await source.artifact('documents-ids', id, 'plan')).toEqual({ state: 'ready', artifact: null });
    }
    expect(calls(dir).filter((c) => c.startsWith('task artifact'))).toEqual([]);
  });
});

describe('localSource', () => {
  const source = localSource(join(root, 'config'));

  const busy = project('busy', '0.31.0', {
    status: { attention: [attention], housekeeping: { ran_at: 'x', forge: 'github', stale: true } },
    queue: {
      items: [
        { ref: 'epic:e', kind: 'epic', id: 'e', level: null, position: 100, priority: 0, depends_on: [] },
        {
          ref: 'task:b',
          kind: 'task',
          id: 'b',
          level: null,
          position: 200,
          priority: 2,
          depends_on: [{ on: 'task:a', reason: 'Needs its form' }],
        },
      ],
    },
    tasks: {
      tasks: [
        task('a', 'active', false, {
          actions: [{ id: 'request-pause', command: 'jig queue request task:a pause', offered: true, reason: null }],
        }),
        task('b', 'active', false, {
          pause_request: { requested_at: '2026-10-22T09:01:58Z', reason: 'lunch' },
          worktree: { path: '/secret/tree-of-b', uncommitted: 3 },
          actions: [
            { id: 'pause', command: 'jig task pause b', offered: true, reason: null },
            { id: 'start', command: 'jig task start b', offered: false, reason: 'checked out in /secret/tree-of-b' },
          ],
        }),
        task('c', 'active', true),
        task('d', 'ready'),
        task('closed', 'consolidated', false, {
          updated_at: '2026-10-24',
          pull_request: { url: 'https://github.com/o/r/pull/9', state: 'merged', ci: 'green', fetched_at: 'x' },
        }),
        task('dropped', 'abandoned', true, { goal: null, branch: null }),
        task('put-away', 'archived', false, { goal: null, branch: null }),
      ],
      hidden: 0,
      housekeeping: null,
    },
  });
  const old = project('old', '0.26.0');
  const broken = project('broken', '0.31.0', {
    status: '{"schema":1,"revision":7,"generated_at":"x","error":{"code":"not-initialised","message":"no Jig in /secret/path"}}',
  });

  it('shows every connected project, in order, read only when its Jig is supported', async () => {
    for (const dir of [busy, old, broken]) await source.connect(dir);
    expect(await source.workspace()).toEqual([
      {
        id: 'busy',
        state: 'ready',
        jigVersion: '0.31.0',
        counts: { active: 2, paused: 1, ready: 1 },
        attention: [{ ...attention, versions: null }],
        housekeepingStale: true,
        upgrade: null,
      },
      { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0', upgrade: null },
      { id: 'broken', state: 'unreadable', code: 'not-initialised', upgrade: null },
    ]);
    expect(calls(old)).not.toContain('status --json');
    expect(calls(old)).not.toContain('task list --all --json');
    expect(calls(old)).not.toContain('spec list --json');
  });

  it('names the connected projects without running Jig, and reads one on its own', async () => {
    const before = calls(busy).length;
    expect(await source.connected()).toEqual(['busy', 'old', 'broken']);
    expect(calls(busy)).toHaveLength(before);
    expect(await source.project('old')).toEqual({
      id: 'old',
      state: 'unsupported',
      jigVersion: '0.26.0',
      minimum: '0.31.0',
      upgrade: null,
    });
    expect(await source.project('nobody')).toBeUndefined();
  });

  it("serves a project's specs, read with its board, and the project's state when it cannot be read", async () => {
    const spec = {
      id: 'billing',
      title: 'Billing',
      missing_files: [],
      release: 'minor',
      epic: { branch: 'epic/billing', state: 'open', checked_out: true, missing: false, ref: 'refs/heads/epic/billing' },
      progress: { done: 1, total: 2, filed: 1, fog: 0 },
      phases: [
        {
          phase: 1,
          title: 'Invoices',
          done: 1,
          total: 2,
          filed: 1,
          fog: 0,
          items: [
            { text: '`invoices` — invoices', checked: true, task: 'invoices', fog: false },
            { text: 'refunds', checked: false, task: null, fog: false },
          ],
        },
      ],
    };
    const planned = project('planned', '0.31.0', { specs: { specs: [spec] } });
    await source.connect(planned);
    expect(calls(planned)).toContain('spec list --json');
    expect(await source.specs('planned')).toEqual({
      state: 'ready',
      specs: [
        {
          id: 'billing',
          title: 'Billing',
          missingFiles: [],
          release: 'minor',
          epic: { branch: 'epic/billing', state: 'open', checkedOut: true, missing: false, fetched: false },
          progress: { done: 1, total: 2, filed: 1, fog: 0 },
          phases: [spec.phases[0]],
          queue: null,
        },
      ],
      revision: 7,
    });
    expect(await source.specs('old')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' });
    expect(await source.specs('nobody')).toBeUndefined();
    await source.disconnect('planned');
  });

  it('places a queued task among the live tasks and open epics of its level, and lists what its epic waits for', async () => {
    const spec = (id: string, state: string) => ({
      id,
      title: null,
      missing_files: [],
      release: null,
      epic: { branch: `epic/${id}`, state, checked_out: false, missing: false, ref: null },
      progress: null,
      phases: [],
    });
    const item = (kind: string, id: string, level: string | null, position: number, depends_on: unknown[] = []) => ({
      ref: `${kind}:${id}`,
      kind,
      id,
      level,
      position,
      priority: null,
      depends_on,
    });
    const dir = project('places', '0.31.0', {
      specs: { specs: [spec('booking', 'open'), spec('landed', 'finished')] },
      queue: {
        items: [
          item('task', 'merged', null, 50),
          item('epic', 'landed', null, 60),
          item('task', 'top', null, 100),
          item('epic', 'booking', null, 200, [{ on: 'epic:payments', reason: 'Shares the API' }]),
          item('task', 'inner', 'epic:booking', 100, [{ on: 'task:top', reason: 'Needs its form' }]),
        ],
      },
      tasks: { tasks: [task('merged', 'consolidated'), task('top', 'active'), task('inner', 'active')], hidden: 0, housekeeping: null },
    });
    await source.connect(dir);
    expect(await source.task('places', 'top')).toMatchObject({ task: { place: { rank: 1, of: 2 }, dependsOn: [] } });
    expect(await source.task('places', 'inner')).toMatchObject({
      task: {
        place: { rank: 1, of: 1 },
        dependsOn: [
          { on: 'task:top', reason: 'Needs its form', through: null },
          { on: 'epic:payments', reason: 'Shares the API', through: 'epic:booking' },
        ],
      },
    });
    await source.disconnect('places');
  });

  it("orders the specs by their epics' places in the queue: queued, then open, then the rest, each in Jig's order", async () => {
    const row = (id: string, epic: string | null) => ({
      id,
      title: null,
      missing_files: [],
      release: null,
      epic: epic && { branch: `epic/${id}`, state: epic, checked_out: false, missing: false, ref: null },
      progress: null,
      phases: [],
    });
    const epic = (id: string, position: number, priority: number | null) => ({
      ref: `epic:${id}`,
      kind: 'epic',
      id,
      level: null,
      position,
      priority,
      depends_on: [],
    });
    const dir = project('epics', '0.31.0', {
      specs: { specs: [row('plain', null), row('late', 'open'), row('loose', 'open'), row('early', 'open'), row('landed', 'finished')] },
      queue: { items: [epic('late', 300, 1), epic('landed', 50, null), epic('early', 100, null)] },
    });
    await source.connect(dir);
    const read = await source.specs('epics');
    expect(read?.state === 'ready' && read.specs.map((s) => [s.id, s.queue])).toEqual([
      ['early', { position: 100, priority: null }],
      ['late', { position: 300, priority: 1 }],
      ['loose', null],
      ['plain', null],
      ['landed', null],
    ]);
    await source.disconnect('epics');
  });

  it("carries the spec list's revision when it is older than the board's reads", async () => {
    const specs = JSON.stringify({ schema: 1, revision: 3, generated_at: 'x', data: { specs: [] } });
    const dir = project('older-specs', '0.31.0', { specs });
    await source.connect(dir);
    expect(await source.specs('older-specs')).toEqual({ state: 'ready', specs: [], revision: 3 });
    expect(await source.tasks('older-specs')).toMatchObject({ revision: 7 });
    await source.disconnect('older-specs');
  });

  it('carries no part of a refusal but its code', async () => {
    expect(JSON.stringify(await source.workspace())).not.toContain('/secret/path');
  });

  it('shows a project whose directory is gone, without reading it', async () => {
    const gone = project('gone', '0.31.0');
    await source.connect(gone);
    rmSync(gone, { recursive: true, force: true });
    expect((await source.workspace()).at(-1)).toEqual({ id: 'gone', state: 'unavailable', reason: 'missing', upgrade: null });
  });

  it('shows a project whose Jig answers in a newer shape as incompatible', async () => {
    const newer = project('newer', '0.32.0', { tasks: { tasks: [task('a', 'parked')], hidden: 0, housekeeping: null } });
    await source.connect(newer);
    expect((await source.workspace()).at(-1)).toEqual({ id: 'newer', state: 'incompatible', jigVersion: '0.32.0', upgrade: null });
    await source.disconnect('newer');
  });

  it("lists a project's live tasks as a board reads them, and the finished ones Jig keeps", async () => {
    await source.connect(
      project('waiting', '0.31.0', {
        tasks: {
          tasks: [
            task('f', 'active', false, { branch: null }),
            task('g', 'active', false, {
              gate: { state: 'waiting', by: null },
              autopilot: {
                state: 'stopped',
                mode: 'attended',
                repairs: 0,
                stage: 'implement',
                stage_at: 'x',
                stop_reason: 'which?',
                stop_at: 'x',
                phase: null,
              },
            }),
            task('h', 'ready', false, { pull_request: { url: 'https://x/pull/1', state: 'merged', ci: null, fetched_at: 'x' } }),
          ],
          hidden: 0,
          housekeeping: null,
        },
      }),
    );
    expect(await source.tasks('busy')).toEqual({
      state: 'ready',
      finished: [
        {
          id: 'closed',
          status: 'consolidated',
          goal: 'Goal of closed',
          updatedAt: '2026-10-24',
          pullRequest: { url: 'https://github.com/o/r/pull/9', state: 'merged' },
        },
        { id: 'dropped', status: 'abandoned', goal: null, updatedAt: '2026-10-17', pullRequest: null },
      ],
      revision: 7,
      tasks: [
        {
          id: 'a',
          class: 'T2',
          status: 'active',
          goal: 'Goal of a',
          paused: false,
          pauseRequest: null,
          pauseRequestable: true,
          resumable: false,
          closable: false,
          started: true,
          gate: null,
          autopilot: null,
          pullRequest: null,
          priority: null,
          queue: null,
        },
        expect.objectContaining({
          id: 'b',
          pauseRequest: { requestedAt: '2026-10-22T09:01:58Z' },
          pauseRequestable: false,
          priority: 2,
          queue: { level: null, position: 200 },
        }),
        expect.objectContaining({ id: 'c', paused: true }),
        expect.objectContaining({ id: 'd', status: 'ready' }),
      ],
    });
    expect(await source.tasks('waiting')).toEqual({
      state: 'ready',
      finished: [],
      revision: 7,
      tasks: [
        expect.objectContaining({ id: 'f', started: false, gate: null, autopilot: null }),
        expect.objectContaining({ id: 'g', started: true, gate: 'waiting', autopilot: 'stopped' }),
        expect.objectContaining({ id: 'h', pullRequest: { url: 'https://x/pull/1', state: 'merged', ci: null, fetchedAt: 'x' } }),
      ],
    });
    expect(await source.tasks('old')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' });
    expect(await source.tasks('nobody')).toBeUndefined();
  });

  it('reads one live task in full, with what needs the person about it and only what Jig offers', async () => {
    const read = await source.task('busy', 'b');
    expect(read).toEqual({
      state: 'ready',
      task: expect.objectContaining({
        id: 'b',
        baseBranch: 'main',
        worktree: { uncommitted: 3 },
        actions: [{ id: 'pause', command: 'jig task pause b' }],
        attention: [{ ...attention, versions: null }],
        // First at the top: no spec has an open epic e, so the page does not count it.
        place: { rank: 1, of: 1 },
        dependsOn: [{ on: 'task:a', reason: 'Needs its form', through: null }],
      }),
    });
    expect(JSON.stringify(read)).not.toContain('/secret/');
    expect(await source.task('busy', 'a')).toMatchObject({
      task: {
        id: 'a',
        attention: [],
        actions: [{ id: 'request-pause', command: 'jig queue request task:a pause' }],
        place: null,
        dependsOn: [],
      },
    });
    expect(await source.task('busy', 'gone-task')).toEqual({ state: 'ready', task: null });
    expect(await source.task('busy', 'closed')).toEqual({ state: 'ready', task: null });
    expect(await source.task('old', 'a')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' });
    expect(await source.task('nobody', 'a')).toBeUndefined();
  });

  it('offers a resume only where Jig offers it and takes `task resume --revision`', async () => {
    const resume = { id: 'resume', command: 'jig task resume p', offered: true, reason: null };
    const paused = { tasks: [task('p', 'active', true, { actions: [resume] }), task('q', 'active', true)], hidden: 0, housekeeping: null };
    await source.connect(project('resumes', '0.35.0', { tasks: paused }));
    await source.connect(project('pre-resume', '0.34.0', { tasks: paused }));
    expect(await source.tasks('resumes')).toMatchObject({
      tasks: [expect.objectContaining({ id: 'p', resumable: true }), expect.objectContaining({ id: 'q', resumable: false })],
    });
    expect(await source.tasks('pre-resume')).toMatchObject({
      tasks: [expect.objectContaining({ id: 'p', resumable: false }), expect.anything()],
    });
  });

  it('disconnects by id', async () => {
    expect(await source.disconnect('gone')).toBe(true);
    expect(await source.disconnect('gone')).toBe(false);
  });
});

describe('localSource, writing the queue', () => {
  const source = localSource(join(root, 'write-config'));
  const tasks = {
    tasks: [task('a', 'active'), task('b', 'active', false, { branch: null }), task('done', 'consolidated')],
    hidden: 0,
    housekeeping: null,
  };
  const writes = (dir: string) => calls(dir).filter((c) => /^(queue (move|set|request|cancel)|task (new|resume)) /.test(c));
  /** The calls since `from`: what Jig ran for one write. */
  const since = (dir: string, from: number) => calls(dir).slice(from);

  it('moves a live task against the revision of the read, then reads the project again', async () => {
    const dir = project('mover', '0.31.0', { tasks });
    await source.connect(dir);
    const from = calls(dir).length;
    expect(await source.move('mover', 'b', { after: 'a' }, 7)).toEqual({ state: 'written' });
    const ran = since(dir, from);
    const moved = ran.indexOf('queue move task:b --after task:a --revision 7 --json');
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(ran.slice(moved + 1)).toEqual(expect.arrayContaining(['task list --all --json', 'queue list --json']));
    expect(await source.move('mover', 'a', 'top', 7)).toEqual({ state: 'written' });
    expect(await source.move('mover', 'a', 'bottom', 7)).toEqual({ state: 'written' });
    expect(writes(dir).slice(1)).toEqual(['queue move task:a --top --revision 7 --json', 'queue move task:a --bottom --revision 7 --json']);
  });

  it('sets a priority, none as Jig spells it', async () => {
    const dir = project('ranker', '0.31.0', { tasks });
    await source.connect(dir);
    expect(await source.prioritise('ranker', 'a', 0, 7)).toEqual({ state: 'written' });
    expect(await source.prioritise('ranker', 'a', null, 7)).toEqual({ state: 'written' });
    expect(writes(dir)).toEqual([
      'queue set task:a --priority 0 --revision 7 --json',
      'queue set task:a --priority none --revision 7 --json',
    ]);
  });

  it("moves and prioritises a spec's open epic, and refuses one without", async () => {
    const row = (id: string, epic: string | null) => ({
      id,
      title: null,
      missing_files: [],
      release: null,
      epic: epic && { branch: `epic/${id}`, state: epic, checked_out: false, missing: false, ref: null },
      progress: null,
      phases: [],
    });
    const dir = project('planner', '0.31.0', { tasks, specs: { specs: [row('one', 'open'), row('two', 'open'), row('flat', null)] } });
    await source.connect(dir);
    const from = calls(dir).length;
    expect(await source.moveEpic('planner', 'two', { before: 'one' }, 7)).toEqual({ state: 'written' });
    expect(since(dir, from)).toEqual(expect.arrayContaining(['spec list --json', 'queue list --json']));
    expect(await source.moveEpic('planner', 'one', { after: 'two' }, 7)).toEqual({ state: 'written' });
    expect(await source.moveEpic('planner', 'one', 'top', 7)).toEqual({ state: 'written' });
    expect(await source.prioritiseEpic('planner', 'one', 2, 7)).toEqual({ state: 'written' });
    expect(await source.moveEpic('planner', 'flat', 'top', 7)).toEqual({ state: 'refused', code: 'not-found' });
    expect(await source.moveEpic('planner', 'one', { after: 'flat' }, 7)).toEqual({ state: 'refused', code: 'not-found' });
    expect(await source.prioritiseEpic('planner', 'a', 2, 7)).toEqual({ state: 'refused', code: 'not-found' });
    expect(await source.moveEpic('nobody', 'one', 'top', 7)).toBeUndefined();
    expect(writes(dir)).toEqual([
      'queue move epic:two --before epic:one --revision 7 --json',
      'queue move epic:one --after epic:two --revision 7 --json',
      'queue move epic:one --top --revision 7 --json',
      'queue set epic:one --priority 2 --revision 7 --json',
    ]);
  });

  it('files a task by an id no live task has, then reads the project again', async () => {
    const dir = project('filer', '0.31.0', { tasks });
    await source.connect(dir);
    const from = calls(dir).length;
    expect(await source.fileTask('filer', 'zeta', 'Do the thing')).toEqual({ state: 'written' });
    const ran = since(dir, from);
    const filed = ran.indexOf('task new zeta --goal Do the thing --json');
    expect(filed).toBeGreaterThanOrEqual(0);
    expect(ran.slice(filed + 1)).toEqual(expect.arrayContaining(['task list --all --json']));
    expect(await source.fileTask('nobody', 'zeta', 'x')).toBeUndefined();
  });

  it('asks a pause and takes it back', async () => {
    const dir = project('pauser', '0.31.0', { tasks });
    await source.connect(dir);
    expect(await source.requestPause('pauser', 'a', 7)).toEqual({ state: 'written' });
    expect(await source.cancelPause('pauser', 'a', 7)).toEqual({ state: 'written' });
    expect(await source.requestPause('pauser', 'gone', 7)).toEqual({ state: 'refused', code: 'not-found' });
    expect(writes(dir)).toEqual(['queue request task:a pause --revision 7 --json', 'queue cancel task:a pause --revision 7 --json']);
  });

  it('resumes a paused task, and carries the refusal of a stash it could not apply by its code', async () => {
    const dir = project('resumer', '0.35.0', { tasks });
    await source.connect(dir);
    expect(await source.resume('resumer', 'a', 7)).toEqual({ state: 'written' });
    expect(await source.resume('resumer', 'gone', 7)).toEqual({ state: 'refused', code: 'not-found' });
    expect(writes(dir)).toEqual(['task resume a --revision 7 --json']);
    const stashed = project('stashed', '0.35.0', { tasks, write: 'wrong-checkout' });
    await source.connect(stashed);
    expect(await source.resume('stashed', 'a', 7)).toEqual({ state: 'refused', code: 'wrong-checkout', reasons: ['refused'] });
  });

  describe('closing a ready task', () => {
    const close = { id: 'close', command: 'jig task set r status consolidated', offered: true, reason: null };
    const pr = (state: string | null) => ({ url: 'https://github.com/o/r/pull/1', state, ci: null, fetched_at: null });
    const ready = {
      tasks: [
        task('offered', 'ready', false, { knowledge_consolidated: true, actions: [close] }),
        task('unheard', 'ready', false, { knowledge_consolidated: true, pull_request: pr(null) }),
        task('cached-open', 'ready', false, { knowledge_consolidated: true, pull_request: pr('open') }),
        task('unmerged', 'ready', false, { knowledge_consolidated: true, pull_request: pr('closed') }),
        task('undecided', 'ready', false, { pull_request: pr(null) }),
        task('working', 'active', false, { knowledge_consolidated: true, actions: [close] }),
      ],
      hidden: 0,
      housekeeping: null,
    };
    const sets = (dir: string) => calls(dir).filter((c) => c.startsWith('task set '));

    it("is offered where Jig offers it, or where only Jig's forge cache is behind", async () => {
      await source.connect(project('closables', '0.37.0', { tasks: ready }));
      const shown = await source.tasks('closables');
      const closable = shown?.state === 'ready' ? Object.fromEntries(shown.tasks.map((t) => [t.id, t.closable])) : {};
      expect(closable).toEqual({
        offered: true,
        unheard: true,
        'cached-open': true,
        unmerged: false,
        undecided: false,
        working: false,
      });
    });

    it("runs the command of Jig's close action against the revision of the read, then reads the project again", async () => {
      const dir = project('closer', '0.37.0', { tasks: ready });
      await source.connect(dir);
      const from = calls(dir).length;
      expect(await source.close('closer', 'unheard', 7)).toEqual({ state: 'written' });
      const ran = since(dir, from);
      const set = ran.indexOf('task set unheard status consolidated');
      expect(ran.slice(0, set)).toContain('queue list --json');
      expect(ran.slice(set + 1)).toEqual(expect.arrayContaining(['task list --all --json']));
    });

    it('refuses a task it does not offer to close without running Jig', async () => {
      const dir = project('unclosable', '0.37.0', { tasks: ready });
      await source.connect(dir);
      for (const id of ['unmerged', 'undecided', 'working', 'gone']) {
        expect(await source.close('unclosable', id, 7)).toEqual({ state: 'refused', code: 'not-found' });
      }
      expect(sets(dir)).toEqual([]);
      expect(await source.close('nobody', 'offered', 7)).toBeUndefined();
    });

    it('refuses a revision the project has moved past, running nothing', async () => {
      const dir = project('stale-closer', '0.37.0', { tasks: ready });
      await source.connect(dir);
      expect(await source.close('stale-closer', 'offered', 6)).toEqual({ state: 'refused', code: 'stale-revision' });
      expect(sets(dir)).toEqual([]);
    });

    it("carries Jig's refusal with its reasons", async () => {
      const err =
        'jig: error: task set: status consolidated requires its pull request to be merged: https://github.com/o/r/pull/1 is open; merge it, then run this again\n';
      const dir = project('refused-closer', '0.37.0', { tasks: ready, set: { err, code: 1 } });
      await source.connect(dir);
      expect(await source.close('refused-closer', 'cached-open', 7)).toEqual({
        state: 'refused',
        code: 'failed',
        reasons: [
          'status consolidated requires its pull request to be merged: https://github.com/o/r/pull/1 is open; merge it, then run this again',
        ],
      });
    });
  });

  it.each([
    ['a task that is not live', 'unknown-task', 'gone', 'top' as const],
    ['an anchor that is not live', 'unknown-anchor', 'a', { after: '--top' }],
    ['a finished task, which Jig still lists', 'finished-task', 'done', 'top' as const],
    ['a finished anchor', 'finished-anchor', 'a', { after: 'done' }],
  ])('refuses %s without running Jig', async (_, name, taskId, place) => {
    const dir = project(name, '0.31.0', { tasks });
    await source.connect(dir);
    expect(await source.move(name, taskId, place, 7)).toEqual({ state: 'refused', code: 'not-found' });
    expect(writes(dir)).toEqual([]);
  });

  it("carries Jig's refusal by its code and reads the project again", async () => {
    const dir = project('stale', '0.31.0', { tasks, write: 'stale-revision' });
    await source.connect(dir);
    const from = calls(dir).length;
    expect(await source.move('stale', 'a', 'top', 3)).toEqual({ state: 'refused', code: 'stale-revision', reasons: ['refused'] });
    const ran = since(dir, from);
    expect(ran.slice(ran.indexOf('queue move task:a --top --revision 3 --json') + 1)).toContain('task list --all --json');
  });

  it('bases a write on the oldest of the reads the board is made of', async () => {
    const dir = project('mixed', '0.31.0', { tasks });
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({ schema: 1, revision: 5, generated_at: 'x', data: { attention: [], housekeeping: null } }),
    );
    await source.connect(dir);
    expect(await source.tasks('mixed')).toMatchObject({ state: 'ready', revision: 5 });
  });

  it('answers a project it cannot read with its state, and one it does not know with nothing', async () => {
    await addProject(join(root, 'write-config'), project('dated', '0.30.0'));
    expect(await source.move('dated', 'a', 'top', 1)).toEqual({
      id: 'dated',
      state: 'unsupported',
      jigVersion: '0.30.0',
      minimum: '0.31.0',
    });
    expect(await source.prioritise('nobody', 'a', 1, 1)).toBeUndefined();
  });
});

/**
 * A clone whose Jig answers from `status.json` and `tasks.json`, and no specs (an envelope with an `error` exits
 * 1), logs every call, and on every call writes under `.ai/runtime/working/` as Jig's reads do; a
 * `slow` file makes every call take 0.4 s.
 */
function liveProject(name: string): {
  dir: string;
  answer: (revision: number, tasks: unknown[], statusError?: boolean) => void;
} {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  mkdirSync(join(dir, '.ai', 'workspace'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, 'calls.log'), '');
  writeFileSync(
    join(dir, '.ai', 'scripts', 'jig'),
    `#!/usr/bin/env bash
echo "$*" >> calls.log
mkdir -p .ai/runtime/working && echo "$*" > .ai/runtime/working/session
[ -f slow ] && sleep 0.4
case "$*" in
  --version) echo "jig 0.31.0" ;;
  "status --json") cat status.json; if grep -q '"error"' status.json; then exit 1; fi ;;
  "task list --all --json") cat tasks.json ;;
  "spec list --json") echo '{"schema":1,"revision":1,"generated_at":"x","data":{"specs":[]}}' ;;
  "queue list --json") cat queue.json ;;
esac
`,
  );
  const answer = (revision: number, tasks: unknown[], statusError = false) => {
    const at = (data: unknown) => JSON.stringify({ schema: 1, revision, generated_at: 'x', data });
    writeFileSync(
      join(dir, 'status.json'),
      statusError
        ? JSON.stringify({ schema: 1, revision, generated_at: 'x', error: { code: 'failed', message: 'torn' } })
        : at({ attention: [], housekeeping: null }),
    );
    writeFileSync(join(dir, 'tasks.json'), at({ tasks, hidden: 0, housekeeping: null }));
    writeFileSync(join(dir, 'queue.json'), at({ items: [] }));
  };
  answer(1, [task('a', 'active')]);
  return { dir, answer };
}

/** Something under `.ai/` changed, as an agent's Jig write or a pull would change it. */
const touch = (dir: string, file = 'state') => writeFileSync(join(dir, '.ai', 'workspace', file), String(Math.random()));

/** Waits until the project's Jig has not been called for `quiet` ms: its reads have settled. */
async function settled(dir: string, quiet = 500): Promise<number> {
  let n = calls(dir).length;
  for (let still = 0; still < quiet; still += 50) {
    await delay(50);
    const now = calls(dir).length;
    if (now !== n) [n, still] = [now, 0];
  }
  return n;
}

async function until(done: () => boolean, ms = 4_000): Promise<void> {
  for (let waited = 0; !done() && waited < ms; waited += 25) await delay(25);
}

describe('localSource, following changes', () => {
  const source = localSource(join(root, 'live-config'), { quietMs: 30, maxWaitMs: 200 });
  const live = liveProject('live');
  const changes: Change[] = [];
  let unsubscribe = () => undefined as unknown;

  it('watches nothing until someone listens', async () => {
    await source.connect(live.dir);
    const before = await settled(live.dir);
    touch(live.dir);
    expect(await settled(live.dir)).toBe(before);
  });

  it('signals a Jig write in a project, and its own reads do not set off another', async () => {
    unsubscribe = source.subscribe((change) => changes.push(change));
    await settled(live.dir);
    changes.length = 0;
    live.answer(2, [task('a', 'active'), task('b', 'active')]);
    touch(live.dir);
    await until(() => changes.length > 0);
    expect(changes).toEqual([{ id: 'live', revision: 2 }]);
    const after = await settled(live.dir);
    await delay(500);
    expect(calls(live.dir).length).toBe(after);
  });

  it('serves the board from the watch, without running Jig', async () => {
    const before = calls(live.dir).length;
    expect(await source.tasks('live')).toMatchObject({ tasks: [{ id: 'a' }, { id: 'b' }] });
    expect(calls(live.dir).length).toBe(before);
  });

  it('signals a change that raised no revision, such as a pull, and nothing for one that changed nothing', async () => {
    changes.length = 0;
    touch(live.dir, 'context-cache');
    await settled(live.dir);
    expect(changes).toEqual([]);
    live.answer(2, [task('a', 'ready'), task('b', 'active')]);
    touch(live.dir);
    await until(() => changes.length > 0);
    expect(changes).toEqual([{ id: 'live', revision: 2 }]);
  });

  it('keeps the last good read over one torn read, and believes the second', async () => {
    await settled(live.dir);
    changes.length = 0;
    live.answer(3, [task('a', 'ready'), task('b', 'active')], true);
    touch(live.dir);
    await settled(live.dir);
    expect(changes).toEqual([]);
    expect((await source.workspace())[0]).toMatchObject({ id: 'live', state: 'ready' });
    touch(live.dir);
    await until(() => changes.length > 0);
    expect(changes).toEqual([{ id: 'live', revision: null }]);
    expect((await source.workspace())[0]).toEqual({ id: 'live', state: 'unreadable', code: 'failed', upgrade: null });
    live.answer(3, [task('a', 'ready'), task('b', 'active')]);
    touch(live.dir);
    await until(() => changes.length > 1);
  });

  it('reads a project again when asked, with no change under .ai/ to set it off', async () => {
    await settled(live.dir);
    changes.length = 0;
    live.answer(4, [task('a', 'ready')], true);
    touch(live.dir);
    await settled(live.dir);
    touch(live.dir);
    await until(() => changes.length > 0);
    live.answer(4, [task('a', 'ready')]);
    await settled(live.dir);
    expect((await source.workspace())[0]).toMatchObject({ id: 'live', state: 'unreadable' });
    expect(await source.readAgain('live')).toMatchObject({ id: 'live', state: 'ready' });
    expect((await source.workspace())[0]).toMatchObject({ id: 'live', state: 'ready' });
    expect(await source.readAgain('nobody')).toBeUndefined();
  });

  it('signals a project connected and one disconnected', async () => {
    const other = liveProject('other');
    changes.length = 0;
    await source.connect(other.dir);
    expect(changes).toEqual([{ id: 'other', revision: 1 }]);
    await source.disconnect('other');
    expect(changes).toEqual([
      { id: 'other', revision: 1 },
      { id: 'other', revision: null },
    ]);
  });

  it('stops watching when the last listener leaves', async () => {
    unsubscribe();
    const before = await settled(live.dir);
    touch(live.dir);
    expect(await settled(live.dir)).toBe(before);
  });

  it('reads afresh for the next listener, not what it read while followed before', async () => {
    live.answer(4, [task('fresh', 'active')]); // outside .ai/, while nobody listens: no event
    const stop = source.subscribe(() => undefined);
    expect(await source.tasks('live')).toMatchObject({ tasks: [{ id: 'fresh' }] });
    stop();
  });

  it('serves the next listener no read that finished after the last one left', async () => {
    const quick = localSource(join(root, 'late-config'), { quietMs: 50, maxWaitMs: 100 });
    const late = liveProject('late');
    await quick.connect(late.dir);
    let stop = quick.subscribe(() => undefined);
    await settled(late.dir);
    writeFileSync(join(late.dir, 'slow'), '');
    late.answer(2, [task('stale', 'active')]);
    const before = calls(late.dir).length;
    touch(late.dir);
    await until(() => calls(late.dir).length > before); // a read is under way
    stop();
    await settled(late.dir, 1_000);
    rmSync(join(late.dir, 'slow'));
    late.answer(3, [task('fresh', 'active')]); // outside .ai/, while nobody listens: no event
    stop = quick.subscribe(() => undefined);
    expect(await quick.tasks('late')).toMatchObject({ tasks: [{ id: 'fresh' }] });
    stop();
  });

  it('finds a change the system watcher never reported on its next rescan', async () => {
    // A rescan less often than a read takes: one sooner keeps a read under way for good.
    const rescanning = localSource(join(root, 'rescan-config'), { rescanMs: 1_500 });
    const quiet = liveProject('quiet');
    await rescanning.connect(quiet.dir);
    const seen: Change[] = [];
    const stop = rescanning.subscribe((change) => seen.push(change));
    // The page's read once its stream is open: it waits for the read that starts the following, which signals nothing.
    await rescanning.tasks('quiet');
    seen.length = 0;
    quiet.answer(5, [task('a', 'active'), task('z', 'active')]); // outside .ai/: no event
    await until(() => seen.length > 0, 8_000);
    stop();
    expect(seen).toEqual([{ id: 'quiet', revision: 5 }]);
  }, 15_000);

  it('signals nothing for the reads that start following: every page reads when its stream opens', async () => {
    const config = join(root, 'opening-config');
    const first = liveProject('first');
    const second = liveProject('second');
    await addProject(config, first.dir);
    await addProject(config, second.dir);
    const opening = localSource(config); // a Jig UI just started: it has read nothing
    const seen: Change[] = [];
    const stop = opening.subscribe((change) => seen.push(change));
    await opening.workspace();
    await settled(first.dir);
    await settled(second.dir);
    stop();
    expect(seen).toEqual([]);
  });

  it('signals nothing when following starts for a project connected while nobody listened', async () => {
    const earlier = localSource(join(root, 'earlier-config'));
    const project = liveProject('earlier');
    await earlier.connect(project.dir);
    const seen: Change[] = [];
    const stop = earlier.subscribe((change) => seen.push(change));
    await delay(100);
    await settled(project.dir);
    stop();
    expect(seen).toEqual([]);
  });

  it('signals nothing when following starts for a project that changed while nobody listened', async () => {
    const meanwhile = localSource(join(root, 'meanwhile-config'));
    const project = liveProject('meanwhile');
    await meanwhile.connect(project.dir);
    project.answer(3, [task('a', 'active'), task('m', 'active')]); // outside .ai/, while nobody listens
    const seen: Change[] = [];
    const stop = meanwhile.subscribe((change) => seen.push(change));
    await delay(100);
    await settled(project.dir);
    stop();
    expect(seen).toEqual([]);
    expect(await meanwhile.tasks('meanwhile')).toMatchObject({ tasks: [{ id: 'a' }, { id: 'm' }] });
  });

  it('believes a torn first read of a following over a read made while nobody listened, and signals the next', async () => {
    const held = localSource(join(root, 'held-config'), { quietMs: 30, maxWaitMs: 200 });
    const project = liveProject('held');
    await held.connect(project.dir);
    project.answer(2, [task('a', 'active')], true); // Jig mid-write
    writeFileSync(join(project.dir, 'slow'), '');
    const seen: Change[] = [];
    const stop = held.subscribe((change) => seen.push(change));
    await delay(50); // the first read of the following is under way
    expect(await held.tasks('held')).toMatchObject({ state: 'unreadable' }); // not the read from before it
    rmSync(join(project.dir, 'slow'));
    project.answer(3, [task('a', 'active'), task('b', 'active')]);
    touch(project.dir);
    await until(() => seen.length > 0);
    stop();
    expect(seen).toEqual([{ id: 'held', revision: 3 }]);
  });

  it('signals a project registered by another Jig UI on its next rescan', async () => {
    const config = join(root, 'shared-config');
    const rescanning = localSource(config, { rescanMs: 300 });
    const seen: Change[] = [];
    const stop = rescanning.subscribe((change) => seen.push(change));
    await delay(100);
    await addProject(config, liveProject('elsewhere').dir);
    await until(() => seen.length > 0);
    stop();
    expect(seen).toEqual([{ id: 'elsewhere', revision: 1 }]);
  });

  it('signals a project another Jig UI registered, when this one connects it before its next rescan', async () => {
    const config = join(root, 'both-config');
    const both = localSource(config);
    const seen: Change[] = [];
    const stop = both.subscribe((change) => seen.push(change));
    await delay(100);
    const twice = liveProject('twice');
    await addProject(config, twice.dir);
    expect(await both.connect(twice.dir)).toMatchObject({ created: false });
    stop();
    expect(seen).toEqual([{ id: 'twice', revision: 1 }]);
  });

  it('signals a project disconnected here and registered again by another Jig UI on its next rescan', async () => {
    const config = join(root, 'again-config');
    const rescanning = localSource(config, { rescanMs: 300 });
    const again = liveProject('again');
    await addProject(config, again.dir);
    const seen: Change[] = [];
    const stop = rescanning.subscribe((change) => seen.push(change));
    await delay(100);
    await rescanning.disconnect('again');
    await addProject(config, again.dir);
    await until(() => seen.length > 1);
    stop();
    expect(seen).toEqual([
      { id: 'again', revision: null },
      { id: 'again', revision: 1 },
    ]);
  });
});

describe('localSource, upgrading a project', () => {
  const source = localSource(join(root, 'upgrade-config'));
  const item = {
    kind: 'upgrade-available',
    subject: { type: 'project', id: null },
    tasks: [],
    title: 'Jig in this project is older than on this machine',
    detail: 'this project runs 0.34.0; this machine has 0.35.0',
    todo: 'jig upgrade',
    url: null,
    versions: { from: '0.34.0', to: '0.35.0' },
  };
  const planned = {
    mode: 'copy',
    dry_run: true,
    from: '0.34.0',
    to: '0.35.0',
    outcome: 'planned',
    files: { placed: 3, kept: 100, removed: 0, conflicts: 0 },
    git: null,
    manual_steps: [],
    would_stop: [],
  };
  const git = {
    level: 'pr',
    branch: 'jig/upgrade-0.35.0',
    commit: 'abc',
    pushed: true,
    pull_request: 'https://github.com/o/r/pull/3',
    merged: false,
  };
  const behind = project('behind', '0.34.0', {
    status: { attention: [item], housekeeping: null },
    plan: planned,
    upgrade: { ...planned, dry_run: false, outcome: 'upgraded', git },
  });
  const current = project('current', '0.35.0');
  const upgradeOf = async (id: string) => (await source.workspace()).find((p) => p.id === id)?.upgrade;
  const reads = (dir: string) => calls(dir).filter((c) => c === 'status --json').length;
  async function ended(id: string): Promise<void> {
    for (let waited = 0; (await upgradeOf(id))?.state === 'running' && waited < 4_000; waited += 25) await delay(25);
  }

  it('plans an upgrade only where Jig names one to make', async () => {
    await source.connect(behind);
    await source.connect(current);
    expect(await source.planUpgrade('behind')).toEqual({
      state: 'planned',
      plan: expect.objectContaining({ from: '0.34.0', to: '0.35.0', outcome: 'planned', wouldStop: [] }),
    });
    expect(await source.planUpgrade('current')).toEqual({ state: 'refused', code: 'not-found' });
    expect(calls(current)).not.toContain('upgrade --dry-run --json');
    expect(await source.planUpgrade('nobody')).toBeUndefined();
  });

  it('answers at once, does not read the project while the upgrade runs, and keeps what it came to', async () => {
    expect(await source.upgrade('behind')).toEqual({ state: 'started' });
    expect(await upgradeOf('behind')).toEqual({ state: 'running', since: expect.any(String), to: '0.35.0' });
    expect(await source.upgrade('behind')).toEqual({ state: 'refused', code: 'running' });
    expect(await source.planUpgrade('behind')).toEqual({ state: 'refused', code: 'running' });
    const before = reads(behind);
    await source.workspace();
    expect(reads(behind)).toBe(before);

    writeFileSync(join(behind, 'go'), '');
    await ended('behind');
    expect(await upgradeOf('behind')).toEqual({
      state: 'done',
      at: expect.any(String),
      upgrade: expect.objectContaining({
        outcome: 'upgraded',
        git: expect.objectContaining({ pullRequest: 'https://github.com/o/r/pull/3' }),
      }),
    });
    expect(reads(behind)).toBeGreaterThan(before);
    expect(await source.dismissUpgrade('behind')).toBe(true);
    expect(await upgradeOf('behind')).toBeNull();
    expect(await source.upgrade('current')).toEqual({ state: 'refused', code: 'not-found' });
  });

  it('keeps a refusal to start with its reasons', async () => {
    const blocked = project('blocked', '0.34.0', {
      status: { attention: [item], housekeeping: null },
      upgrade: JSON.stringify({
        schema: 1,
        revision: 7,
        generated_at: 'x',
        error: {
          code: 'upgrade-blocked',
          message: 'upgrade: nothing was changed:\n  - the working tree has uncommitted changes; commit them',
        },
      }),
    });
    writeFileSync(join(blocked, 'go'), '');
    await source.connect(blocked);
    await source.upgrade('blocked');
    await ended('blocked');
    expect(await upgradeOf('blocked')).toEqual({
      state: 'refused',
      at: expect.any(String),
      code: 'upgrade-blocked',
      reasons: ['the working tree has uncommitted changes; commit them'],
    });
  });

  it("keeps Jig's words with a refusal of the plan and of the run, the paths cut out", async () => {
    const refusal = JSON.stringify({
      schema: 1,
      revision: 7,
      generated_at: 'x',
      error: { code: 'failed', message: 'upgrade: cannot determine the framework source root (/Users/juve/x); pass --from <dir>' },
    });
    const lost = project('lost', '0.34.0', { status: { attention: [item], housekeeping: null }, plan: refusal, upgrade: refusal });
    writeFileSync(join(lost, 'go'), '');
    await source.connect(lost);
    const reasons = ['cannot determine the framework source root (…); pass --from <dir>'];
    expect(await source.planUpgrade('lost')).toEqual({ state: 'refused', code: 'failed', reasons });
    await source.upgrade('lost');
    await ended('lost');
    expect(await upgradeOf('lost')).toEqual({ state: 'refused', at: expect.any(String), code: 'failed', reasons });
  });

  it('tells a listener when an upgrade starts and when it ends', async () => {
    const changes: Change[] = [];
    const unsubscribe = source.subscribe((c) => changes.push(c));
    await settled(behind);
    rmSync(join(behind, 'go'));
    await source.upgrade('behind');
    expect(changes.filter((c) => c.id === 'behind')).toHaveLength(1);
    writeFileSync(join(behind, 'go'), '');
    // The end is told once the project is read again, after the result is kept.
    await until(() => changes.filter((c) => c.id === 'behind').length > 1);
    expect(changes.filter((c) => c.id === 'behind')).toHaveLength(2);
    unsubscribe();
  });

  it('runs no Jig of its own in the project while it upgrades, not even once a listener comes back', async () => {
    let unsubscribe = source.subscribe(() => {});
    await settled(behind);
    rmSync(join(behind, 'go'));
    await source.upgrade('behind');
    unsubscribe();
    unsubscribe = source.subscribe(() => {});
    const others = () => calls(behind).filter((c) => c !== 'upgrade --json').length;
    const before = others();
    await source.workspace();
    await settled(behind);
    expect(await source.fileTask('behind', 'zeta', 'Do the thing')).toEqual({ state: 'refused', code: 'upgrading' });
    expect(others()).toBe(before);
    writeFileSync(join(behind, 'go'), '');
    await ended('behind');
    unsubscribe();
  });

  it("reads no task's documents while the project upgrades, and starts an upgrade once a read under way has ended", async () => {
    const dir = project('behind-documents', '0.39.0', {
      status: { attention: [item], housekeeping: null },
      tasks: { tasks: [task('b', 'active')], hidden: 0, housekeeping: null },
      artifacts: { task: 'b', artifacts: [] },
      plan: planned,
      upgrade: { ...planned, dry_run: false, outcome: 'upgraded', git },
    });
    await source.connect(dir);
    const documents = () => calls(dir).filter((c) => c.startsWith('task artifact')).length;
    await source.upgrade('behind-documents');
    expect(await source.artifacts('behind-documents', 'b')).toEqual({ id: 'behind-documents', state: 'unreadable', code: 'upgrading' });
    expect(await source.artifact('behind-documents', 'b', 'plan')).toEqual({
      id: 'behind-documents',
      state: 'unreadable',
      code: 'upgrading',
    });
    expect(documents()).toBe(0);
    writeFileSync(join(dir, 'go'), '');
    await ended('behind-documents');

    // A read held in Jig: the upgrade waits for it to end before it runs.
    rmSync(join(dir, 'go'));
    writeFileSync(join(dir, 'hold-artifacts'), '');
    const upgrades = () => calls(dir).filter((c) => c === 'upgrade --json').length;
    const before = upgrades();
    const reading = source.artifacts('behind-documents', 'b');
    await until(() => documents() > 0);
    expect(await source.upgrade('behind-documents')).toEqual({ state: 'started' });
    await delay(300);
    expect(upgrades()).toBe(before);
    rmSync(join(dir, 'hold-artifacts'));
    expect(await reading).toEqual({ state: 'ready', artifacts: [] });
    await until(() => upgrades() > before);
    writeFileSync(join(dir, 'go'), '');
    await ended('behind-documents');
  });

  it('starts one run for two starts at once, once a write under way has ended, and keeps the project meanwhile', async () => {
    rmSync(join(behind, 'go'));
    writeFileSync(join(behind, 'hold'), '');
    const filings = () => calls(behind).filter((c) => c.startsWith('task new ')).length;
    const upgrades = () => calls(behind).filter((c) => c === 'upgrade --json').length;
    const [filed, before] = [filings(), upgrades()];
    const filing = source.fileTask('behind', 'zeta', 'Do the thing');
    await until(() => filings() > filed);
    const started = await Promise.all([source.upgrade('behind'), source.upgrade('behind')]);
    expect(started).toEqual(expect.arrayContaining([{ state: 'started' }, { state: 'refused', code: 'running' }]));
    expect(await source.disconnect('behind')).toBe('upgrading');
    await delay(200);
    expect(upgrades()).toBe(before);
    rmSync(join(behind, 'hold'));
    expect(await filing).toEqual({ state: 'written' });
    await until(() => upgrades() > before);
    writeFileSync(join(behind, 'go'), '');
    await ended('behind');
    expect(upgrades()).toBe(before + 1);
  });

  it('lets a disconnect sent with a start find the run, and keeps the project', async () => {
    rmSync(join(behind, 'go'), { force: true });
    const started = await Promise.all([source.upgrade('behind'), source.disconnect('behind')]);
    expect(started).toEqual([{ state: 'started' }, 'upgrading']);
    expect((await source.workspace()).map((p) => p.id)).toContain('behind');
    writeFileSync(join(behind, 'go'), '');
    await ended('behind');
  });
});

describe('localSource, self-update and Upgrade all', () => {
  const release = {
    kind: 'release-available',
    subject: { type: 'project', id: null },
    tasks: [],
    title: 'jig v0.36.0 is out',
    detail: null,
    todo: 'jig self-update',
    url: null,
    versions: { from: '0.35.0', to: '0.36.0' },
  };
  const upgradeItem = {
    kind: 'upgrade-available',
    subject: { type: 'project', id: null },
    tasks: [],
    title: 'Jig in this project is older than on this machine',
    detail: null,
    todo: 'jig upgrade',
    url: null,
    versions: { from: '0.34.0', to: '0.35.0' },
  };
  const outcome = {
    mode: 'copy',
    dry_run: false,
    from: '0.34.0',
    to: '0.35.0',
    outcome: 'upgraded',
    files: { placed: 1, kept: 1, removed: 0, conflicts: 0 },
    git: null,
    manual_steps: [],
    would_stop: [],
  };
  const behindStatus = { attention: [upgradeItem], housekeeping: null };
  let configs = 0;
  /** A fresh source and registry per test, so the machine's runs of one never reach another. */
  function fresh() {
    const config = join(root, `machine-config-${configs++}`);
    const source = localSource(config);
    return { source, config };
  }
  const behind = (name: string, more: Parameters<typeof project>[2] = {}) =>
    project(name, '0.34.0', { status: behindStatus, upgrade: outcome, ...more });
  const log = (dir: string, call: string) => calls(dir).filter((c) => c === call).length;
  const go = (dir: string) => writeFileSync(join(dir, 'go'), '');
  async function ended(source: ReturnType<typeof localSource>): Promise<void> {
    await until(() => source.machine().upgradeAll?.state === 'done');
  }

  it('shows nothing of the machine before it does anything', () => {
    expect(fresh().source.machine()).toEqual({ release: null, selfUpdate: null, upgradeAll: null, landingAll: false });
  });

  describe('self-update', () => {
    it('runs through the first connected project with a Jig, says what Jig said, and reads every project again', async () => {
      const { source } = fresh();
      const first = project('su-first', '0.35.0', {
        status: { attention: [release], housekeeping: null },
        selfUpdate: { out: 'noise\nself-update: updated 0.35.0 -> 0.36.0 (abc1234)', statusAfter: behindStatus },
      });
      const second = project('su-second', '0.35.0');
      await source.connect(first);
      await source.connect(second);
      const secondReads = log(second, 'status --json');
      expect(await source.selfUpdate()).toEqual({ state: 'done', said: 'self-update: updated 0.35.0 -> 0.36.0 (abc1234)' });
      expect(calls(first)).toContain('self-update');
      expect(calls(second)).not.toContain('self-update');
      expect(source.machine().selfUpdate).toEqual({ state: 'done', at: expect.any(String), said: expect.any(String) });
      expect(log(second, 'status --json')).toBeGreaterThan(secondReads);
      // The project now shows the upgrade the new Jig makes.
      const shown = (await source.workspace()).find((p) => p.id === 'su-first');
      expect(shown).toMatchObject({ state: 'ready', attention: [expect.objectContaining({ kind: 'upgrade-available' })] });
    });

    it('skips a project without a Jig when it picks one to run through', async () => {
      const { source, config } = fresh();
      const bare = join(root, 'su-bare');
      mkdirSync(bare, { recursive: true });
      execFileSync('git', ['init', '-q'], { cwd: bare });
      await addProject(config, bare);
      const real = project('su-real', '0.35.0');
      await source.connect(real);
      expect(await source.selfUpdate()).toMatchObject({ state: 'done' });
      expect(calls(real)).toContain('self-update');
    });

    it('is refused as not-found when no project has a Jig, and runs nothing', async () => {
      const { source } = fresh();
      expect(await source.selfUpdate()).toEqual({ state: 'refused', code: 'not-found' });
      expect(source.machine().selfUpdate).toBeNull();
    });

    it('keeps why it failed, with no path', async () => {
      const { source } = fresh();
      await source.connect(
        project('su-fail', '0.35.0', {
          selfUpdate: { err: 'jig: error: self-update: cannot reach the remote at /Users/me/jig', code: 1 },
        }),
      );
      expect(await source.selfUpdate()).toEqual({ state: 'failed', reasons: ['cannot reach the remote at …'] });
      expect(source.machine().selfUpdate).toEqual({ state: 'failed', at: expect.any(String), reasons: ['cannot reach the remote at …'] });
      // A failed run does not hold the next one.
      expect(await source.selfUpdate()).toEqual({ state: 'failed', reasons: expect.any(Array) });
    });

    it('is under way until Jig ends, and holds the plan of a project upgrade meanwhile', async () => {
      const { source } = fresh();
      const dir = behind('su-hold');
      await source.connect(dir);
      writeFileSync(join(dir, 'hold-self'), '');
      const running = source.selfUpdate();
      await until(() => calls(dir).includes('self-update'));
      expect(source.machine().selfUpdate).toEqual({ state: 'running', since: expect.any(String) });
      expect(await source.planUpgrade('su-hold')).toEqual({ state: 'refused', code: 'running' });
      // Refused at once, not queued behind the run.
      expect(await source.selfUpdate()).toEqual({ state: 'refused', code: 'running' });
      expect(await source.upgradeAll()).toEqual({ state: 'refused', code: 'running' });
      expect(await source.upgrade('su-hold')).toEqual({ state: 'refused', code: 'running' });
      // Dismissing does not forget a run under way.
      source.dismissUpgradeAll();
      expect(source.machine().selfUpdate?.state).toBe('running');
      rmSync(join(dir, 'hold-self'));
      expect(await running).toMatchObject({ state: 'done' });
      expect(log(dir, 'upgrade --json')).toBe(0);
    });

    it('is refused while a project upgrade runs', async () => {
      const { source } = fresh();
      const dir = behind('su-while-upgrade');
      await source.connect(dir);
      expect(await source.upgrade('su-while-upgrade')).toEqual({ state: 'started' });
      expect(await source.selfUpdate()).toEqual({ state: 'refused', code: 'running' });
      go(dir);
      await until(() => source.machine() !== undefined && log(dir, 'upgrade --json') > 0);
    });
  });

  describe('Upgrade all', () => {
    it('answers at once and upgrades the projects that show an upgrade one at a time, in the order connected', async () => {
      const { source } = fresh();
      const one = behind('ua-one');
      const two = behind('ua-two');
      await source.connect(one);
      await source.connect(two);
      expect(await source.upgradeAll()).toEqual({ state: 'started' });
      expect(source.machine().upgradeAll).toEqual({ state: 'running', since: expect.any(String), current: null, upgraded: [] });

      await until(() => log(one, 'upgrade --json') > 0);
      expect(source.machine().upgradeAll).toMatchObject({ state: 'running', current: 'ua-one', upgraded: [] });
      await delay(250);
      // The second waits for the first to end.
      expect(log(two, 'upgrade --json')).toBe(0);
      expect(await source.upgradeAll()).toEqual({ state: 'refused', code: 'running' });
      expect(await source.selfUpdate()).toEqual({ state: 'refused', code: 'running' });
      expect(await source.upgrade('ua-two')).toEqual({ state: 'refused', code: 'running' });
      expect(await source.planUpgrade('ua-two')).toEqual({ state: 'refused', code: 'running' });

      go(one);
      await until(() => log(two, 'upgrade --json') > 0);
      expect(source.machine().upgradeAll).toMatchObject({ state: 'running', current: 'ua-two', upgraded: ['ua-one'] });
      go(two);
      await ended(source);
      expect(source.machine().upgradeAll).toEqual({
        state: 'done',
        at: expect.any(String),
        upgraded: ['ua-one', 'ua-two'],
        skipped: [],
        failed: null,
      });
      // No release was out: Jig is not updated.
      expect(calls(one)).not.toContain('self-update');
      expect(calls(two)).not.toContain('self-update');
      expect(log(one, 'upgrade --json')).toBe(1);
      expect(log(two, 'upgrade --json')).toBe(1);
    });

    it("names the newest release any project's last read names, for every project", async () => {
      const { source } = fresh();
      await source.connect(project('rel-heard', '0.35.0', { status: { attention: [release], housekeeping: null } }));
      await source.connect(
        project('rel-newer', '0.35.0', { status: { attention: [{ ...release, title: 'jig v0.36.1 is out' }], housekeeping: null } }),
      );
      // Its housekeeping has not heard of either.
      await source.connect(project('rel-deaf', '0.35.0'));
      await source.workspace();
      expect(source.machine().release).toBe('0.36.1');
    });

    it('never upgrades a project disconnected while it waits its turn, and keeps the one being upgraded', async () => {
      const { source } = fresh();
      const one = behind('ud-one');
      const two = behind('ud-two');
      await source.connect(one);
      await source.connect(two);
      await source.upgradeAll();
      await until(() => log(one, 'upgrade --json') > 0);
      expect(await source.disconnect('ud-one')).toBe('upgrading');
      // Disconnected while the first runs: its turn finds it gone.
      expect(await source.disconnect('ud-two')).toBe(true);
      go(one);
      await ended(source);
      expect(source.machine().upgradeAll).toMatchObject({ state: 'done', upgraded: ['ud-one'], skipped: [] });
      expect(log(two, 'upgrade --json')).toBe(0);
    });

    it('skips an up-to-date project and one it cannot read, and upgrades the rest', async () => {
      const { source } = fresh();
      const current = project('ua-current', '0.35.0');
      const broken = project('ua-broken', '0.35.0', { status: 'not json at all' });
      const needs = behind('ua-needs');
      for (const dir of [current, broken, needs]) await source.connect(dir);
      go(needs);
      expect(await source.upgradeAll()).toEqual({ state: 'started' });
      await ended(source);
      expect(source.machine().upgradeAll).toEqual({
        state: 'done',
        at: expect.any(String),
        upgraded: ['ua-needs'],
        skipped: ['ua-current', 'ua-broken'],
        failed: null,
      });
      expect(log(current, 'upgrade --json')).toBe(0);
      expect(log(broken, 'upgrade --json')).toBe(0);
      expect(log(needs, 'upgrade --json')).toBe(1);
    });

    it('ends done with everything skipped when no project is connected or none needs an upgrade', async () => {
      const empty = fresh().source;
      expect(await empty.upgradeAll()).toEqual({ state: 'started' });
      await ended(empty);
      expect(empty.machine().upgradeAll).toEqual({ state: 'done', at: expect.any(String), upgraded: [], skipped: [], failed: null });

      const { source } = fresh();
      await source.connect(project('ua-fine', '0.35.0'));
      await source.upgradeAll();
      await ended(source);
      expect(source.machine().upgradeAll).toMatchObject({ state: 'done', upgraded: [], skipped: ['ua-fine'], failed: null });
    });

    it('updates this machine first when a release is out, then upgrades the projects that now show an upgrade', async () => {
      const { source } = fresh();
      // Its status shows the release; after self-update (run through it) it shows the upgrade, as a new Jig would.
      const first = project('ua-rel-first', '0.34.0', {
        status: { attention: [release], housekeeping: null },
        selfUpdate: { out: 'self-update: updated 0.35.0 -> 0.36.0 (abc1234)', statusAfter: behindStatus },
        upgrade: outcome,
      });
      const second = behind('ua-rel-second');
      go(first);
      go(second);
      await source.connect(first);
      await source.connect(second);
      await source.upgradeAll();
      await ended(source);
      expect(calls(first)).toContain('self-update');
      expect(calls(second)).not.toContain('self-update');
      expect(calls(first).indexOf('self-update')).toBeLessThan(calls(first).indexOf('upgrade --json'));
      expect(source.machine().upgradeAll).toEqual({
        state: 'done',
        at: expect.any(String),
        upgraded: ['ua-rel-first', 'ua-rel-second'],
        skipped: [],
        failed: null,
      });
      expect(source.machine().selfUpdate).toMatchObject({ state: 'done' });
    });

    it('stops before any project when the self-update fails, and says why', async () => {
      const { source } = fresh();
      const first = project('ua-fail-first', '0.34.0', {
        status: { attention: [release, upgradeItem], housekeeping: null },
        selfUpdate: { err: 'jig: error: self-update: cannot reach the remote', code: 1 },
        upgrade: outcome,
      });
      const second = behind('ua-fail-second');
      go(first);
      go(second);
      await source.connect(first);
      await source.connect(second);
      await source.upgradeAll();
      await ended(source);
      expect(source.machine().upgradeAll).toEqual({
        state: 'done',
        at: expect.any(String),
        upgraded: [],
        skipped: [],
        failed: ['cannot reach the remote'],
      });
      expect(source.machine().selfUpdate).toMatchObject({ state: 'failed' });
      expect(log(first, 'upgrade --json')).toBe(0);
      expect(log(second, 'upgrade --json')).toBe(0);
    });

    it('gives a reason of its own when the self-update fails without one', async () => {
      const { source } = fresh();
      await source.connect(
        project('ua-silent', '0.34.0', { status: { attention: [release], housekeeping: null }, selfUpdate: { code: 1 } }),
      );
      await source.upgradeAll();
      await ended(source);
      expect(source.machine().upgradeAll).toMatchObject({ state: 'done', upgraded: [], failed: [expect.any(String)] });
    });

    it('does not update this machine when no release is out, even when a project is behind', async () => {
      const { source } = fresh();
      const dir = behind('ua-norel');
      go(dir);
      await source.connect(dir);
      await source.upgradeAll();
      await ended(source);
      expect(calls(dir)).not.toContain('self-update');
      expect(source.machine().selfUpdate).toBeNull();
    });

    it('continues past a project whose upgrade is refused', async () => {
      const { source } = fresh();
      const blocked = behind('ua-blocked', {
        upgrade: JSON.stringify({
          schema: 1,
          revision: 7,
          generated_at: 'x',
          error: { code: 'upgrade-blocked', message: 'upgrade: nothing was changed:\n  - dirty tree' },
        }),
      });
      const fine = behind('ua-fine-after');
      go(blocked);
      go(fine);
      await source.connect(blocked);
      await source.connect(fine);
      await source.upgradeAll();
      await ended(source);
      expect(log(fine, 'upgrade --json')).toBe(1);
      expect(source.machine().upgradeAll).toMatchObject({ state: 'done', failed: null });
    });

    it('keeps what it came to until dismissed, and may be started again afterwards', async () => {
      const { source } = fresh();
      const dir = behind('ua-again');
      go(dir);
      await source.connect(dir);
      await source.upgradeAll();
      await ended(source);
      expect(source.machine().upgradeAll?.state).toBe('done');
      source.dismissUpgradeAll();
      expect(source.machine()).toEqual({ release: null, selfUpdate: null, upgradeAll: null, landingAll: false });
      // Dismissing nothing is harmless.
      source.dismissUpgradeAll();
      expect(source.machine()).toEqual({ release: null, selfUpdate: null, upgradeAll: null, landingAll: false });
      expect(await source.upgradeAll()).toEqual({ state: 'started' });
      await ended(source);
    });

    it('clears a self-update result along with it', async () => {
      const { source } = fresh();
      await source.connect(project('ua-clear', '0.35.0'));
      await source.selfUpdate();
      expect(source.machine().selfUpdate?.state).toBe('done');
      source.dismissUpgradeAll();
      expect(source.machine().selfUpdate).toBeNull();
    });

    it('tells a listener when it starts, moves on and ends', async () => {
      const { source } = fresh();
      const dir = behind('ua-told');
      go(dir);
      await source.connect(dir);
      const changes: Change[] = [];
      const unsubscribe = source.subscribe((c) => changes.push(c));
      await settled(dir);
      const before = changes.length;
      await source.upgradeAll();
      await ended(source);
      expect(changes.length).toBeGreaterThan(before);
      unsubscribe();
    });
  });
});

describe('localSource, checking the merge of an upgrade pull request', () => {
  const waitingItem = {
    kind: 'upgrade-pull-request-waiting',
    subject: { type: 'project', id: null },
    tasks: [],
    title: 'An upgrade of Jig waits for its pull request to be merged',
    detail: 'jig/upgrade-9.9.9 into main, open as of 2026-10-20T10:00:00Z',
    todo: 'Review and merge the pull request, then run jig upgrade --land to bring it here.',
    url: 'https://github.com/o/r/pull/12',
    pull_request: { branch: 'jig/upgrade-9.9.9', base: 'main', state: 'open', fetched_at: '2026-10-20T10:00:00Z' },
    versions: { to: '9.9.9' },
  };
  const waitingStatus = { attention: [waitingItem], housekeeping: null };
  const landed = {
    mode: 'copy',
    dry_run: false,
    from: '0.38.1',
    to: '9.9.9',
    outcome: 'landed',
    files: null,
    git: {
      level: 'commit',
      branch: 'jig/upgrade-9.9.9',
      commit: 'af790d0',
      pushed: true,
      pull_request: 'https://github.com/example/example/pull/12',
      merged: true,
    },
    land: { base: 'main', branch_deleted: true, origin_branch_deleted: false },
    manual_steps: [],
    would_stop: [],
  };
  const nothing = { ...landed, from: '9.9.9', outcome: 'nothing-to-do', git: null, land: null };
  const refusal = (code: string, message: string) =>
    JSON.stringify({ schema: 1, revision: 7, generated_at: 'x', error: { code, message } });
  const notMerged = refusal(
    'not-merged',
    'upgrade --land: the pull request of jig/upgrade-9.9.9 is not merged yet; merge it. Nothing was changed',
  );
  const open = (name: string, more: Parameters<typeof project>[2] = {}, version = '0.39.0') =>
    project(name, version, { status: waitingStatus, land: landed, ...more });
  const log = (dir: string, call: string) => calls(dir).filter((c) => c === call).length;
  let configs = 0;
  function fresh() {
    return localSource(join(root, `land-config-${configs++}`));
  }
  const upgradeOf = async (source: ReturnType<typeof localSource>, id: string) =>
    (await source.workspace()).find((p) => p.id === id)?.upgrade;

  it('lands a project whose status names an upgrade pull request, and keeps what Jig answered', async () => {
    const source = fresh();
    const dir = open('land-ok');
    await source.connect(dir);
    const reads = log(dir, 'status --json');
    expect(await source.land('land-ok')).toEqual({ state: 'ended' });
    expect(log(dir, 'upgrade --land --json')).toBe(1);
    expect(log(dir, 'status --json')).toBeGreaterThan(reads);
    expect(await upgradeOf(source, 'land-ok')).toEqual({
      state: 'done',
      at: expect.any(String),
      upgrade: expect.objectContaining({ outcome: 'landed', from: '0.38.1', to: '9.9.9', land: expect.objectContaining({ base: 'main' }) }),
    });
  });

  it('keeps an answer of nothing to do', async () => {
    const source = fresh();
    const dir = open('land-nothing', { land: nothing });
    await source.connect(dir);
    expect(await source.land('land-nothing')).toEqual({ state: 'ended' });
    expect(await upgradeOf(source, 'land-nothing')).toMatchObject({ state: 'done', upgrade: { outcome: 'nothing-to-do' } });
  });

  it('shows the item with the pull request it carries', async () => {
    const source = fresh();
    await source.connect(open('land-item'));
    const shown = (await source.workspace()).find((p) => p.id === 'land-item');
    expect(shown).toMatchObject({
      state: 'ready',
      attention: [
        expect.objectContaining({
          kind: 'upgrade-pull-request-waiting',
          pullRequest: { branch: 'jig/upgrade-9.9.9', base: 'main', state: 'open', to: '9.9.9' },
        }),
      ],
    });
  });

  it('keeps a pull request that is not merged yet as a refusal with its code', async () => {
    const source = fresh();
    const dir = open('land-open', { land: notMerged });
    await source.connect(dir);
    expect(await source.land('land-open')).toEqual({ state: 'ended' });
    expect(await upgradeOf(source, 'land-open')).toEqual({
      state: 'refused',
      at: expect.any(String),
      code: 'not-merged',
      reasons: expect.any(Array),
    });
  });

  it('keeps a refusal to start, and a failure that is no refusal', async () => {
    const source = fresh();
    const blocked = open('land-blocked', {
      land: refusal('upgrade-blocked', 'upgrade --land: nothing was changed:\n  - the working tree has uncommitted changes; commit them'),
    });
    await source.connect(blocked);
    expect(await source.land('land-blocked')).toEqual({ state: 'ended' });
    expect(await upgradeOf(source, 'land-blocked')).toEqual({
      state: 'refused',
      at: expect.any(String),
      code: 'upgrade-blocked',
      reasons: ['the working tree has uncommitted changes; commit them'],
    });
    const broken = open('land-broken', { land: 'not json at all' });
    await source.connect(broken);
    expect(await source.land('land-broken')).toEqual({ state: 'ended' });
    expect(await upgradeOf(source, 'land-broken')).toMatchObject({ state: 'refused', code: 'failed' });
  });

  it('offers the landing after an upgrade of this page ended in an open pull request', async () => {
    const source = fresh();
    const item = {
      kind: 'upgrade-available',
      subject: { type: 'project', id: null },
      tasks: [],
      title: 't',
      detail: null,
      todo: 'jig upgrade',
      url: null,
      versions: { from: '0.39.0', to: '0.40.0' },
    };
    const git = { level: 'pr', branch: 'jig/upgrade-0.40.0', commit: 'abc', pushed: true, pull_request: 'https://x/pull/3', merged: false };
    const upgraded = {
      mode: 'copy',
      dry_run: false,
      from: '0.39.0',
      to: '0.40.0',
      outcome: 'upgraded',
      files: null,
      git,
      manual_steps: [],
      would_stop: [],
    };
    const dir = project('land-after-upgrade', '0.39.0', {
      status: { attention: [item], housekeeping: null },
      upgrade: upgraded,
      land: landed,
    });
    writeFileSync(join(dir, 'go'), '');
    await source.connect(dir);
    await source.upgrade('land-after-upgrade');
    for (let i = 0; i < 160 && (await upgradeOf(source, 'land-after-upgrade'))?.state !== 'done'; i++) await delay(25);
    expect(await source.land('land-after-upgrade')).toEqual({ state: 'ended' });
    expect(log(dir, 'upgrade --land --json')).toBe(1);
    expect(await upgradeOf(source, 'land-after-upgrade')).toMatchObject({ state: 'done', upgrade: { outcome: 'landed' } });
  });

  it('keeps the wait after Not merged yet, until a landing brings it here, and shows it on the workspace', async () => {
    const source = fresh();
    const item = {
      kind: 'upgrade-available',
      subject: { type: 'project', id: null },
      tasks: [],
      title: 't',
      detail: null,
      todo: 'jig upgrade',
      url: null,
      versions: { from: '0.39.0', to: '0.40.0' },
    };
    const git = { level: 'pr', branch: 'jig/upgrade-0.40.0', commit: 'abc', pushed: true, pull_request: 'https://x/pull/3', merged: false };
    const upgraded = {
      mode: 'copy',
      dry_run: false,
      from: '0.39.0',
      to: '0.40.0',
      outcome: 'upgraded',
      files: null,
      git,
      manual_steps: [],
      would_stop: [],
    };
    // Housekeeping has not heard of the pull request: Jig still says `upgrade-available`, and no item names it.
    const dir = project('land-kept', '0.39.0', { status: { attention: [item], housekeeping: null }, upgrade: upgraded, land: notMerged });
    writeFileSync(join(dir, 'go'), '');
    await source.connect(dir);
    const shown = async () => (await source.workspace()).find((p) => p.id === 'land-kept');
    expect((await shown())?.mergeWait).toBeUndefined();
    await source.upgrade('land-kept');
    for (let i = 0; i < 160 && (await shown())?.upgrade?.state !== 'done'; i++) await delay(25);
    expect((await shown())?.mergeWait).toEqual({ state: 'open', to: '0.40.0', url: 'https://x/pull/3' });

    expect(await source.land('land-kept')).toEqual({ state: 'ended' });
    expect((await shown())?.upgrade).toMatchObject({ state: 'refused', code: 'not-merged' });
    // Still waiting, still offered: no Upgrade… to cut a second branch.
    expect((await shown())?.mergeWait).toEqual({ state: 'open', to: '0.40.0', url: 'https://x/pull/3' });
    expect(await source.land('land-kept')).toEqual({ state: 'ended' });
    expect(log(dir, 'upgrade --land --json')).toBe(2);

    writeFileSync(join(dir, 'land.json'), JSON.stringify({ schema: 1, revision: 8, generated_at: 'x', data: landed }));
    expect(await source.land('land-kept')).toEqual({ state: 'ended' });
    expect((await shown())?.mergeWait).toBeUndefined();
  });

  it("shows Jig's item as the wait, open or merged, and none for a Jig before 0.39.0", async () => {
    const source = fresh();
    await source.connect(open('wait-open'));
    const mergedItem = {
      ...waitingItem,
      kind: 'upgrade-pull-request-merged',
      url: null,
      pull_request: { ...waitingItem.pull_request, state: 'merged' },
    };
    await source.connect(project('wait-merged', '0.39.0', { status: { attention: [mergedItem], housekeeping: null } }));
    await source.connect(open('wait-old', {}, '0.38.1'));
    const waits = Object.fromEntries((await source.workspace()).map((p) => [p.id, p.mergeWait]));
    expect(waits).toEqual({
      'wait-open': { state: 'open', to: '9.9.9', url: 'https://github.com/o/r/pull/12' },
      'wait-merged': { state: 'merged', to: '9.9.9', url: null },
      'wait-old': undefined,
    });
  });

  it('refuses a merged run, one without a pull request, and one already merged', async () => {
    const item = {
      kind: 'upgrade-available',
      subject: { type: 'project', id: null },
      tasks: [],
      title: 't',
      detail: null,
      todo: 'jig upgrade',
      url: null,
      versions: { from: '0.39.0', to: '0.40.0' },
    };
    const gitOf = (more: Record<string, unknown>) => ({
      level: 'pr',
      branch: 'b',
      commit: 'abc',
      pushed: true,
      pull_request: 'https://x/pull/3',
      merged: false,
      ...more,
    });
    for (const [name, git] of [
      ['merged', gitOf({ merged: true })],
      ['no-pr', gitOf({ pull_request: null })],
      ['no-git', null],
    ] as const) {
      const source = fresh();
      const upgraded = {
        mode: 'copy',
        dry_run: false,
        from: '0.39.0',
        to: '0.40.0',
        outcome: 'upgraded',
        files: null,
        git,
        manual_steps: [],
        would_stop: [],
      };
      const dir = project(`land-no-${name}`, '0.39.0', { status: { attention: [item], housekeeping: null }, upgrade: upgraded });
      writeFileSync(join(dir, 'go'), '');
      await source.connect(dir);
      await source.upgrade(`land-no-${name}`);
      for (let i = 0; i < 160 && (await upgradeOf(source, `land-no-${name}`))?.state !== 'done'; i++) await delay(25);
      expect(await source.land(`land-no-${name}`)).toEqual({ state: 'refused', code: 'not-found' });
      expect(log(dir, 'upgrade --land --json')).toBe(0);
    }
  });

  it('refuses where there is nothing to check, a Jig before 0.39.0, an unknown id and a project it cannot read', async () => {
    const source = fresh();
    const plain = project('land-plain', '0.39.0');
    const old = open('land-old', {}, '0.38.1');
    const unreadable = project('land-unreadable', '0.39.0', { status: 'garbage' });
    await source.connect(plain);
    await source.connect(old);
    await source.connect(unreadable);
    expect(await source.land('land-plain')).toEqual({ state: 'refused', code: 'not-found' });
    expect(await source.land('land-old')).toEqual({ state: 'refused', code: 'not-found' });
    expect(await source.land('land-unreadable')).toMatchObject({ state: 'unreadable' });
    expect(await source.land('nobody')).toBeUndefined();
    for (const dir of [plain, old, unreadable]) expect(calls(dir)).not.toContain('upgrade --land --json');
  });

  it('shows the run while Jig lands, refuses other starts meanwhile, and tells a listener', async () => {
    const source = fresh();
    const dir = open('land-hold');
    await source.connect(dir);
    const changes: Change[] = [];
    const unsubscribe = source.subscribe((c) => changes.push(c));
    await settled(dir, 200);
    writeFileSync(join(dir, 'hold-land'), '');
    const landing = source.land('land-hold');
    await until(() => log(dir, 'upgrade --land --json') > 0);
    expect(await upgradeOf(source, 'land-hold')).toEqual({ state: 'running', since: expect.any(String), to: '9.9.9', landing: true });
    expect(await source.land('land-hold')).toEqual({ state: 'refused', code: 'running' });
    expect(await source.upgrade('land-hold')).toEqual({ state: 'refused', code: 'running' });
    expect(await source.landAll()).toEqual({ state: 'refused', code: 'running' });
    expect(await source.upgradeAll()).toEqual({ state: 'refused', code: 'running' });
    expect(await source.selfUpdate()).toEqual({ state: 'refused', code: 'running' });
    expect(changes.filter((c) => c.id === 'land-hold').length).toBeGreaterThan(0);
    rmSync(join(dir, 'hold-land'));
    expect(await landing).toEqual({ state: 'ended' });
    expect(log(dir, 'upgrade --land --json')).toBe(1);
    expect((await upgradeOf(source, 'land-hold'))?.state).toBe('done');
    unsubscribe();
  });

  it('is refused while a self-update or Upgrade all runs', async () => {
    const source = fresh();
    const dir = open('land-vs-machine', { selfUpdate: {} });
    await source.connect(dir);
    writeFileSync(join(dir, 'hold-self'), '');
    const updating = source.selfUpdate();
    await until(() => calls(dir).includes('self-update'));
    expect(await source.land('land-vs-machine')).toEqual({ state: 'refused', code: 'running' });
    expect(await source.landAll()).toEqual({ state: 'refused', code: 'running' });
    rmSync(join(dir, 'hold-self'));
    await updating;
    expect(log(dir, 'upgrade --land --json')).toBe(0);
  });

  describe('Check all merges', () => {
    it('lands each project in turn and tells which landed, which wait and which stopped', async () => {
      const source = fresh();
      const dirs = [
        open('la-landed'),
        open('la-waiting', { land: notMerged }),
        open('la-stopped', { land: refusal('upgrade-blocked', 'upgrade --land: nothing was changed:\n  - dirty') }),
        open('la-failed', { land: 'garbage' }),
        project('la-plain', '0.39.0'),
        open('la-old', {}, '0.38.0'),
        project('la-unreadable', '0.39.0', { status: 'garbage' }),
      ];
      for (const dir of dirs) await source.connect(dir);
      expect(source.machine().landingAll).toBe(false);
      expect(await source.landAll()).toEqual({
        state: 'ended',
        landed: { landed: ['la-landed'], waiting: ['la-waiting'], stopped: ['la-stopped', 'la-failed'] },
      });
      expect(source.machine().landingAll).toBe(false);
      for (const dir of dirs.slice(4)) expect(calls(dir)).not.toContain('upgrade --land --json');
      for (const dir of dirs.slice(0, 4)) expect(log(dir, 'upgrade --land --json')).toBe(1);
    });

    it('ends with nothing landed when no project has a pull request', async () => {
      const source = fresh();
      expect(await source.landAll()).toEqual({ state: 'ended', landed: { landed: [], waiting: [], stopped: [] } });
      await source.connect(project('la-none', '0.39.0'));
      expect(await source.landAll()).toEqual({ state: 'ended', landed: { landed: [], waiting: [], stopped: [] } });
    });

    it('is under way for the machine, holds every upgrade, and lets go afterwards', async () => {
      const source = fresh();
      const one = open('lb-one');
      const two = open('lb-two');
      const behindItem = {
        kind: 'upgrade-available',
        subject: { type: 'project', id: null },
        tasks: [],
        title: 't',
        detail: null,
        todo: 'jig upgrade',
        url: null,
        versions: { from: '0.34.0', to: '0.35.0' },
      };
      const behind = project('lb-behind', '0.39.0', {
        status: { attention: [behindItem], housekeeping: null },
        plan: { ...nothing, dry_run: true, from: '0.34.0', to: '0.35.0', outcome: 'planned' },
      });
      await source.connect(one);
      await source.connect(two);
      await source.connect(behind);
      writeFileSync(join(one, 'hold-land'), '');
      const all = source.landAll();
      await until(() => log(one, 'upgrade --land --json') > 0);
      expect(source.machine().landingAll).toBe(true);
      expect(log(two, 'upgrade --land --json')).toBe(0);
      expect(await source.landAll()).toEqual({ state: 'refused', code: 'running' });
      expect(await source.land('lb-two')).toEqual({ state: 'refused', code: 'running' });
      expect(await source.upgrade('lb-behind')).toEqual({ state: 'refused', code: 'running' });
      expect(await source.planUpgrade('lb-behind')).toEqual({ state: 'refused', code: 'running' });
      expect(await source.upgradeAll()).toEqual({ state: 'refused', code: 'running' });
      expect(await source.selfUpdate()).toEqual({ state: 'refused', code: 'running' });
      rmSync(join(one, 'hold-land'));
      expect(await all).toMatchObject({ state: 'ended', landed: { landed: ['lb-one', 'lb-two'] } });
      expect(source.machine().landingAll).toBe(false);
      expect(await source.planUpgrade('lb-behind')).toMatchObject({ state: 'planned' });
    });

    it('tells a listener when it starts and when it ends', async () => {
      const source = fresh();
      const dir = open('lc-told');
      await source.connect(dir);
      const seen: boolean[] = [];
      const unsubscribe = source.subscribe(() => seen.push(source.machine().landingAll));
      await settled(dir, 200);
      seen.length = 0;
      await source.landAll();
      expect(seen).toContain(true);
      expect(seen.at(-1)).toBe(false);
      unsubscribe();
    });
  });
});
