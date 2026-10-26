import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { addProject } from '../registry/projects.js';
import { localSource } from './local.js';
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
    /** What `queue move`, `set`, `request`, `cancel`, `task new` and `task resume` print: an envelope's `data`, or a refusal's code. */
    write?: unknown;
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
  writeFileSync(join(dir, 'specs.json'), envelope(answers.specs ?? { specs: [] }));
  writeFileSync(join(dir, 'queue.json'), envelope(answers.queue ?? { items: [] }));
  const write = answers.write ?? { ref: 'task:x', item: null };
  writeFileSync(
    join(dir, 'write.json'),
    typeof write === 'string'
      ? JSON.stringify({ schema: 1, revision: 9, generated_at: 'x', error: { code: write, message: 'refused' } })
      : envelope(write),
  );
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
  "queue move "*|"queue set "*|"queue request "*|"queue cancel "*|"task new "*|"task resume "*) cat write.json; if grep -q '"error"' write.json; then exit 1; fi ;;
esac
`,
  );
  return dir;
}

const calls = (dir: string) => readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');

describe('localSource', () => {
  const source = localSource(join(root, 'config'));

  const busy = project('busy', '0.31.0', {
    status: { attention: [attention], housekeeping: { ran_at: 'x', forge: 'github', stale: true } },
    queue: {
      items: [
        { ref: 'epic:e', kind: 'epic', id: 'e', level: null, position: 100, priority: 0, depends_on: [] },
        { ref: 'task:b', kind: 'task', id: 'b', level: null, position: 200, priority: 2, depends_on: [] },
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
        attention: [attention],
        housekeepingStale: true,
      },
      { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' },
      { id: 'broken', state: 'unreadable', code: 'not-initialised' },
    ]);
    expect(calls(old)).not.toContain('status --json');
    expect(calls(old)).not.toContain('task list --all --json');
    expect(calls(old)).not.toContain('spec list --json');
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
        },
      ],
    });
    expect(await source.specs('old')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' });
    expect(await source.specs('nobody')).toBeUndefined();
    await source.disconnect('planned');
  });

  it('carries no part of a refusal but its code', async () => {
    expect(JSON.stringify(await source.workspace())).not.toContain('/secret/path');
  });

  it('shows a project whose directory is gone, without reading it', async () => {
    const gone = project('gone', '0.31.0');
    await source.connect(gone);
    rmSync(gone, { recursive: true, force: true });
    expect((await source.workspace()).at(-1)).toEqual({ id: 'gone', state: 'unavailable', reason: 'missing' });
  });

  it('shows a project whose Jig answers in a newer shape as incompatible', async () => {
    const newer = project('newer', '0.32.0', { tasks: { tasks: [task('a', 'parked')], hidden: 0, housekeeping: null } });
    await source.connect(newer);
    expect((await source.workspace()).at(-1)).toEqual({ id: 'newer', state: 'incompatible', jigVersion: '0.32.0' });
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
        attention: [attention],
      }),
    });
    expect(JSON.stringify(read)).not.toContain('/secret/');
    expect(await source.task('busy', 'a')).toMatchObject({
      task: { id: 'a', attention: [], actions: [{ id: 'request-pause', command: 'jig queue request task:a pause' }] },
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
    expect(await source.resume('stashed', 'a', 7)).toEqual({ state: 'refused', code: 'wrong-checkout' });
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
    expect(await source.move('stale', 'a', 'top', 3)).toEqual({ state: 'refused', code: 'stale-revision' });
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
    expect((await source.workspace())[0]).toEqual({ id: 'live', state: 'unreadable', code: 'failed' });
    live.answer(3, [task('a', 'ready'), task('b', 'active')]);
    touch(live.dir);
    await until(() => changes.length > 1);
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
