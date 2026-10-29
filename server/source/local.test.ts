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
    /** What `queue move`, `set`, `request`, `cancel`, `task new` and `task resume` print, once no file `hold` is in the project: an envelope's `data`, or a refusal's code. */
    write?: unknown;
    /** What `upgrade --dry-run` prints, as `data`. */
    plan?: unknown;
    /** What `upgrade` prints once a file `go` is in the project: an envelope's `data`, or a whole envelope as a string. */
    upgrade?: unknown;
    /** What `self-update` does once no file `hold-self` is in the project; given `statusAfter`, it also replaces status.json with it, as a new Jig would. */
    selfUpdate?: {
      out?: string;
      err?: string;
      code?: number;
      statusAfter?: unknown;
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
  writeFileSync(join(dir, 'plan.json'), envelope(answers.plan ?? {}));
  writeFileSync(join(dir, 'upgrade.json'), typeof answers.upgrade === 'string' ? answers.upgrade : envelope(answers.upgrade ?? {}));
  const self = answers.selfUpdate ?? {};
  writeFileSync(join(dir, 'self.out'), self.out ?? 'self-update: already current');
  writeFileSync(join(dir, 'self.err'), self.err ?? '');
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
  "upgrade --dry-run --json") cat plan.json ;;
  "self-update") while [ -f hold-self ]; do sleep 0.05; done; cat self.out; echo; cat self.err >&2; if [ -f status-after.json ] && [ ${self.code ?? 0} -eq 0 ]; then cp status-after.json status.json; fi; exit ${self.code ?? 0} ;;
  "upgrade --json") while [ ! -f go ]; do sleep 0.05; done; cat upgrade.json; if grep -q '"error"' upgrade.json; then exit 1; fi ;;
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
    expect((await source.workspace())[0]).toEqual({ id: 'live', state: 'unreadable', code: 'failed', upgrade: null });
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
    expect(fresh().source.machine()).toEqual({ release: null, selfUpdate: null, upgradeAll: null });
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
      expect(source.machine()).toEqual({ release: null, selfUpdate: null, upgradeAll: null });
      // Dismissing nothing is harmless.
      source.dismissUpgradeAll();
      expect(source.machine()).toEqual({ release: null, selfUpdate: null, upgradeAll: null });
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
