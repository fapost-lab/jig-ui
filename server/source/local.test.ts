import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
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
 * A git clone whose Jig answers `--version`, `status --json` and `task list --json` from files, and
 * logs every call to `calls.log`. `status` given as a string is printed as is, with exit 1.
 */
function project(name: string, version: string, answers: { status?: unknown; tasks?: unknown } = {}): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const refused = typeof answers.status === 'string';
  writeFileSync(
    join(dir, 'status.json'),
    refused ? (answers.status as string) : envelope(answers.status ?? { attention: [], housekeeping: null }),
  );
  writeFileSync(join(dir, 'tasks.json'), envelope(answers.tasks ?? { tasks: [], hidden: 0, housekeeping: null }));
  writeFileSync(
    join(dir, '.ai', 'scripts', 'jig'),
    `#!/usr/bin/env bash
echo "$*" >> calls.log
case "$*" in
  --version) echo "jig ${version}" ;;
  "status --json") cat status.json; exit ${refused ? 1 : 0} ;;
  "task list --json") cat tasks.json ;;
esac
`,
  );
  return dir;
}

const calls = (dir: string) => readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');

describe('localSource', () => {
  const source = localSource(join(root, 'config'));

  const busy = project('busy', '0.29.0', {
    status: { attention: [attention], housekeeping: { ran_at: 'x', forge: 'github', stale: true } },
    tasks: {
      tasks: [
        task('a', 'active'),
        task('b', 'active', false, {
          worktree: { path: '/secret/tree-of-b', uncommitted: 3 },
          actions: [
            { id: 'pause', command: 'jig task pause b', offered: true, reason: null },
            { id: 'start', command: 'jig task start b', offered: false, reason: 'checked out in /secret/tree-of-b' },
          ],
        }),
        task('c', 'active', true),
        task('d', 'ready'),
      ],
      hidden: 2,
      housekeeping: null,
    },
  });
  const old = project('old', '0.26.0');
  const broken = project('broken', '0.29.0', {
    status: '{"schema":1,"revision":7,"generated_at":"x","error":{"code":"not-initialised","message":"no Jig in /secret/path"}}',
  });

  it('shows every connected project, in order, read only when its Jig is supported', async () => {
    for (const dir of [busy, old, broken]) await source.connect(dir);
    expect(await source.workspace()).toEqual([
      {
        id: 'busy',
        state: 'ready',
        jigVersion: '0.29.0',
        counts: { active: 2, paused: 1, ready: 1 },
        attention: [attention],
        housekeepingStale: true,
      },
      { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' },
      { id: 'broken', state: 'unreadable', code: 'not-initialised' },
    ]);
    expect(calls(old)).not.toContain('status --json');
    expect(calls(old)).not.toContain('task list --json');
  });

  it('carries no part of a refusal but its code', async () => {
    expect(JSON.stringify(await source.workspace())).not.toContain('/secret/path');
  });

  it('shows a project whose directory is gone, without reading it', async () => {
    const gone = project('gone', '0.29.0');
    await source.connect(gone);
    rmSync(gone, { recursive: true, force: true });
    expect((await source.workspace()).at(-1)).toEqual({ id: 'gone', state: 'unavailable', reason: 'missing' });
  });

  it('shows a project whose Jig answers in a newer shape as incompatible', async () => {
    const newer = project('newer', '0.30.0', { tasks: { tasks: [task('a', 'parked')], hidden: 0, housekeeping: null } });
    await source.connect(newer);
    expect((await source.workspace()).at(-1)).toEqual({ id: 'newer', state: 'incompatible', jigVersion: '0.30.0' });
    await source.disconnect('newer');
  });

  it("lists a project's live tasks as a board reads them, with the finished ones counted", async () => {
    await source.connect(
      project('waiting', '0.29.0', {
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
      finished: 2,
      tasks: [
        {
          id: 'a',
          class: 'T2',
          status: 'active',
          goal: 'Goal of a',
          paused: false,
          started: true,
          gate: null,
          autopilot: null,
          pullRequest: null,
        },
        expect.objectContaining({ id: 'b' }),
        expect.objectContaining({ id: 'c', paused: true }),
        expect.objectContaining({ id: 'd', status: 'ready' }),
      ],
    });
    expect(await source.tasks('waiting')).toEqual({
      state: 'ready',
      finished: 0,
      tasks: [
        expect.objectContaining({ id: 'f', started: false, gate: null, autopilot: null }),
        expect.objectContaining({ id: 'g', started: true, gate: 'waiting', autopilot: 'stopped' }),
        expect.objectContaining({ id: 'h', pullRequest: { url: 'https://x/pull/1', state: 'merged', ci: null, fetchedAt: 'x' } }),
      ],
    });
    expect(await source.tasks('old')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' });
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
    expect(await source.task('busy', 'a')).toMatchObject({ task: { id: 'a', attention: [], actions: [] } });
    expect(await source.task('busy', 'gone-task')).toEqual({ state: 'ready', task: null });
    expect(await source.task('old', 'a')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' });
    expect(await source.task('nobody', 'a')).toBeUndefined();
  });

  it('disconnects by id', async () => {
    expect(await source.disconnect('gone')).toBe(true);
    expect(await source.disconnect('gone')).toBe(false);
  });
});

/**
 * A clone whose Jig answers from `status.json` and `tasks.json` (an envelope with an `error` exits
 * 1), logs every call, and on every call writes under `.ai/runtime/working/` as Jig's reads do.
 */
function liveProject(name: string): { dir: string; answer: (revision: number, tasks: unknown[], statusError?: boolean) => void } {
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
case "$*" in
  --version) echo "jig 0.29.0" ;;
  "status --json") cat status.json; if grep -q '"error"' status.json; then exit 1; fi ;;
  "task list --json") cat tasks.json ;;
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

  it('finds a change the system watcher never reported on its next rescan', async () => {
    const rescanning = localSource(join(root, 'rescan-config'), { rescanMs: 300 });
    const quiet = liveProject('quiet');
    await rescanning.connect(quiet.dir);
    const seen: Change[] = [];
    const stop = rescanning.subscribe((change) => seen.push(change));
    await until(() => calls(quiet.dir).length >= 6);
    seen.length = 0;
    quiet.answer(5, [task('a', 'active'), task('z', 'active')]); // outside .ai/: no event
    await until(() => seen.length > 0);
    stop();
    expect(seen).toEqual([{ id: 'quiet', revision: 5 }]);
  });
});
