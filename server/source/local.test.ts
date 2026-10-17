import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { localSource } from './local.js';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'jig-ui-source-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const envelope = (data: unknown) => JSON.stringify({ schema: 1, revision: 7, generated_at: '2026-10-17T00:00:00Z', data });
/** A task-list row in Jig's shape: started, nothing waiting, no pull request, unless `more` says otherwise. */
const task = (id: string, status: string, paused = false, more: Record<string, unknown> = {}) => ({
  id,
  class: 'T2',
  status,
  goal: `Goal of ${id}`,
  paused,
  branch: `task/${id}`,
  gate: null,
  autopilot: null,
  pull_request: null,
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
  writeFileSync(join(dir, 'status.json'), refused ? (answers.status as string) : envelope(answers.status ?? { attention: [], housekeeping: null }));
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
    tasks: { tasks: [task('a', 'active'), task('b', 'active'), task('c', 'active', true), task('d', 'ready')], hidden: 2, housekeeping: null },
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
            task('g', 'active', false, { gate: { state: 'waiting', by: null }, autopilot: { state: 'stopped', mode: 'attended' } }),
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
        { id: 'a', class: 'T2', status: 'active', goal: 'Goal of a', paused: false, started: true, gate: null, autopilot: null, pullRequest: null },
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
        expect.objectContaining({ id: 'h', pullRequest: { url: 'https://x/pull/1', state: 'merged', ci: null } }),
      ],
    });
    expect(await source.tasks('old')).toEqual({ id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' });
    expect(await source.tasks('nobody')).toBeUndefined();
  });

  it('disconnects by id', async () => {
    expect(await source.disconnect('gone')).toBe(true);
    expect(await source.disconnect('gone')).toBe(false);
  });
});
