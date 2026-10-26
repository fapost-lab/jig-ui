import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cancelPause,
  fileTask,
  jigVersion,
  JigRefusal,
  JigShapeError,
  MIN_JIG_VERSION,
  moveInQueue,
  readQueue,
  readSpecs,
  readStatus,
  readTasks,
  requestPause,
  resumeTask,
  setPriority,
  supports,
  writtenByReads,
} from './client.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-jig-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A checkout whose `.ai/scripts/jig` prints `output` for any command. */
function checkout(name: string, output: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\necho "${output}"\n`);
  return dir;
}

describe('jigVersion', () => {
  it("reads the project's own Jig", async () => {
    expect(await jigVersion(checkout('new', 'jig 0.29.0'))).toBe('0.29.0');
    expect(await jigVersion(checkout('old', 'jig 0.26.1'))).toBe('0.26.1');
  });

  it('is undefined without Jig', async () => {
    mkdirSync(join(root, 'bare'));
    expect(await jigVersion(join(root, 'bare'))).toBeUndefined();
  });

  it('throws when Jig names no version', async () => {
    await expect(jigVersion(checkout('odd', 'usage: jig'))).rejects.toThrow();
  });
});

describe('supports', () => {
  it.each([
    [MIN_JIG_VERSION, true],
    ['0.31.1', true],
    ['0.32.0', true],
    ['1.0.0', true],
    ['0.30.0', false],
    ['0.29.0', false],
    ['0.9.0', false],
  ])('%s → %s', (version, expected) => {
    expect(supports(version)).toBe(expected);
  });
});

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

/** A checkout whose Jig prints `json` (a fixture's name, or text) and exits with `status`, as a refusal does. */
function answering(name: string, json: string, status = 0): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  if (json.endsWith('.json')) copyFileSync(fixture(json), join(dir, 'out.json'));
  else writeFileSync(join(dir, 'out.json'), json);
  writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\ncat out.json\nexit ${status}\n`);
  return dir;
}

/** The fixture with one change, to show what its contract refuses. */
function changed(name: string, change: (data: Record<string, any>) => void): string {
  const envelope = JSON.parse(readFileSync(fixture(name), 'utf8'));
  change(envelope.data);
  return JSON.stringify(envelope);
}

let cases = 0;
const refusal = (code: string) => expect.objectContaining({ code }) as unknown as JigRefusal;

// Contract tests: the fixtures are what Jig printed — task-list.json and task-list-all.json are Jig 0.31.0's, the others
// Jig 0.29.0's: task-list-states.json with the `pause_request` and the two pause-request actions
// 0.31.0 adds, in the shape its lib/task.sh prints, and status-attention.json with items added in
// the documented shape, an unknown kind included. Each read pins the fields Jig UI relies on.
describe('readStatus', () => {
  it("reads what needs the person, in Jig's order, an unknown kind included", async () => {
    const read = await readStatus(answering('status', 'status-attention.json'));
    expect(read.revision).toBe(1792229323);
    expect(read.housekeepingStale).toBe(true);
    expect(read.attention.map((a) => a.kind)).toEqual(['gate-waiting', 'pull-request-waiting', 'phase-stopped', 'something-new']);
    expect(read.attention[1]).toEqual({
      kind: 'pull-request-waiting',
      subject: { type: 'task', id: 'pr-template' },
      tasks: ['pr-template'],
      title: 'Pull request waits for review',
      detail: null,
      todo: 'Review and merge the pull request.',
      url: 'https://github.com/fapost-lab/jig-ui/pull/14',
    });
  });

  it('reads a project where nothing needs the person and housekeeping never ran', async () => {
    expect(await readStatus(answering('status-empty', 'status.json'))).toMatchObject({ attention: [], housekeepingStale: false });
  });

  it.each([
    ['an item without a title', (d: Record<string, any>) => delete d.attention[0].title],
    ['an item without its url, which may only be null', (d: Record<string, any>) => delete d.attention[0].url],
    ['attention that is not a list', (d: Record<string, any>) => (d.attention = {})],
    ['housekeeping without stale', (d: Record<string, any>) => (d.housekeeping = { ran_at: 'x' })],
  ])('refuses %s', async (_, change) => {
    await expect(readStatus(answering(`case-${cases++}`, changed('status-attention.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('readTasks', () => {
  it('reads the live tasks', async () => {
    const read = await readTasks(answering('tasks', 'task-list.json'));
    expect(read.tasks.length).toBeGreaterThan(0);
    expect(read.tasks[0]).toMatchObject({ id: expect.any(String), status: expect.any(String), paused: expect.any(Boolean) });
  });

  it('reads what a board and a task show: start, gate, autopilot run, pull request, flags, actions', async () => {
    const read = await readTasks(answering('tasks-states', 'task-list-states.json'));
    expect(read.tasks.map((t) => t.id)).toEqual(['backlog-item', 'design-waits', 'run-stopped', 'set-aside', 'shipped']);
    expect(read.tasks[0]).toEqual({
      id: 'backlog-item',
      class: null,
      status: 'active',
      issue: null,
      goal: null,
      knowledgeConsolidated: false,
      paused: false,
      pauseRequest: null,
      createdAt: '2026-10-17',
      updatedAt: '2026-10-17',
      branch: null,
      baseBranch: 'main',
      worktree: null,
      gate: null,
      autopilot: null,
      pullRequest: null,
      housekeepingFlags: [],
      actions: expect.any(Array),
    });
    expect(read.tasks[0]?.actions.map((a) => a.id)).toEqual([
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
    expect(read.tasks[1]).toMatchObject({ gate: { state: 'waiting', by: null }, worktree: { uncommitted: 2 } });
    expect(read.tasks[1]?.actions.find((a) => a.id === 'approve-gate')).toEqual({
      id: 'approve-gate',
      command: 'jig task gate design-waits approved',
      offered: true,
      reason: null,
    });
    expect(read.tasks[2]?.autopilot).toEqual({
      state: 'stopped',
      mode: 'attended',
      stage: 'implement',
      stageAt: '2026-10-17T17:00:00Z',
      stopReason: 'which column?',
      stopAt: '2026-10-17T17:10:00Z',
      phase: null,
    });
    expect(read.tasks[3]).toMatchObject({ paused: true, housekeepingFlags: ['STALE_CANDIDATE'] });
    expect(read.tasks[4]?.pullRequest).toEqual({
      url: 'https://github.com/o/r/pull/7',
      state: 'open',
      ci: 'green',
      fetchedAt: '2026-10-17T16:00:00Z',
    });
  });

  it('asks for the finished tasks too, and reads them as Jig keeps them', async () => {
    const dir = logging('tasks-all', 'task-list-all.json');
    const read = await readTasks(dir);
    expect(args(dir)).toEqual(['task', 'list', '--all', '--json']);
    expect(read.tasks.map((t) => [t.id, t.status])).toEqual([
      ['fix-typo', 'consolidated'],
      ['live-one', 'active'],
      ['old-idea', 'abandoned'],
    ]);
  });

  it('reads a pause asked of a task and the actions to ask and take it back', async () => {
    const read = await readTasks(answering('tasks-requests', 'task-list.json'));
    const [alpha, beta] = read.tasks;
    expect(alpha?.pauseRequest).toBeNull();
    expect(beta?.pauseRequest).toEqual({ requestedAt: '2026-10-22T09:01:58Z' });
    const offered = (t: typeof alpha) =>
      t?.actions.filter((a) => a.id === 'request-pause' || a.id === 'cancel-pause-request').map((a) => [a.id, a.offered]);
    expect(offered(alpha)).toEqual([
      ['request-pause', true],
      ['cancel-pause-request', false],
    ]);
    expect(offered(beta)).toEqual([
      ['request-pause', false],
      ['cancel-pause-request', true],
    ]);
  });

  it('ignores an action id this Jig UI does not know, as Jig asks of a consumer', async () => {
    const read = await readTasks(
      answering(
        'tasks-unknown-action',
        changed('task-list.json', (d) => d.tasks[0].actions.push({ id: 'something-new', command: 'jig x', offered: true, reason: null })),
      ),
    );
    expect(read.tasks[0]?.actions.map((a) => a.id)).not.toContain('something-new');
  });

  it("never hands on where a task's worktree is", async () => {
    const read = await readTasks(answering('tasks-worktree', 'task-list-states.json'));
    expect(JSON.stringify(read.tasks.map((t) => t.worktree))).not.toContain('/w/design-waits');
  });

  it.each([
    ['without its status', (d: Record<string, any>) => delete d.tasks[0].status],
    ['with a status this Jig UI does not know', (d: Record<string, any>) => (d.tasks[0].status = 'parked')],
    ['with a gate without its state', (d: Record<string, any>) => (d.tasks[0].gate = { by: null })],
    ['with a pull request without its url', (d: Record<string, any>) => (d.tasks[0].pull_request = { state: 'open', ci: null })],
    ['without its branch', (d: Record<string, any>) => delete d.tasks[0].branch],
    ['with an autopilot run without its state', (d: Record<string, any>) => (d.tasks[0].autopilot = { mode: 'attended' })],
    ['without its class', (d: Record<string, any>) => delete d.tasks[0].class],
    ['with a goal that is not text', (d: Record<string, any>) => (d.tasks[0].goal = 3)],
    ['without its actions', (d: Record<string, any>) => delete d.tasks[0].actions],
    ['with an action not saying whether it is offered', (d: Record<string, any>) => (d.tasks[0].actions[0].offered = 'yes')],
    ['with a worktree without its count', (d: Record<string, any>) => (d.tasks[0].worktree = { path: '/w' })],
    ['with housekeeping flags that are not text', (d: Record<string, any>) => (d.tasks[0].housekeeping_flags = [1])],
    ['without its base branch', (d: Record<string, any>) => delete d.tasks[0].base_branch],
    ['without its pause request', (d: Record<string, any>) => delete d.tasks[0].pause_request],
    ['with a pause request without its time', (d: Record<string, any>) => (d.tasks[0].pause_request = { reason: null })],
  ])('refuses a task %s', async (_, change) => {
    await expect(readTasks(answering(`case-${cases++}`, changed('task-list.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('readTasks, the list as a whole', () => {
  it('refuses a list without its tasks', async () => {
    await expect(
      readTasks(
        answering(
          `case-${cases++}`,
          changed('task-list.json', (d) => delete d.tasks),
        ),
      ),
    ).rejects.toBeInstanceOf(JigShapeError);
  });
});

// spec-list.json is Jig 0.29.0's `spec list --json` for this repository, cut down, with a spec on an
// open epic and one missing its files added in the shape Jig's producer (lib/spec.sh) prints.
describe('readSpecs', () => {
  it("reads each spec with its phases and items, in Jig's order", async () => {
    const [ui, billing, half] = await readSpecs(answering('specs', 'spec-list.json'));
    expect(ui).toMatchObject({
      id: 'jig-ui',
      title: 'Jig UI — a local control center for Jig projects',
      missingFiles: [],
      release: null,
      epic: null,
    });
    expect(ui?.progress).toEqual({ done: 2, total: 5, filed: 1, fog: 1 });
    expect(ui?.phases.map((p) => [p.phase, p.title, p.done, p.total])).toEqual([
      [0, 'Package and release', 1, 1],
      [1, 'Read-only UI', 1, 3],
      [null, null, 0, 1],
    ]);
    expect(ui?.phases[1]?.items[2]).toEqual({
      text: "fog: registration by `jig init` — needs a hook on Jig's side",
      checked: false,
      task: null,
      fog: true,
    });
    expect(billing?.release).toBe('minor');
    expect(billing?.epic).toEqual({ branch: 'epic/billing', state: 'open', checkedOut: false, missing: false, fetched: true });
    expect(half).toMatchObject({ title: null, missingFiles: ['spec.md', 'roadmap.md'], progress: null, phases: [] });
  });

  it('reads a project with no specs', async () => {
    expect(await readSpecs(answering(`case-${cases++}`, '{"schema":1,"revision":1,"generated_at":"x","data":{"specs":[]}}'))).toEqual([]);
  });

  it.each([
    ['without its id', (d: Record<string, any>) => delete d.specs[0].id],
    ['without its title, which may only be null', (d: Record<string, any>) => delete d.specs[0].title],
    ['with an epic in a state Jig UI does not know', (d: Record<string, any>) => (d.specs[1].epic.state = 'merged')],
    ['with an epic without its branch', (d: Record<string, any>) => delete d.specs[1].epic.branch],
    ['with progress that is not a count', (d: Record<string, any>) => (d.specs[0].progress.done = -1)],
    ['with a phase without its items', (d: Record<string, any>) => delete d.specs[0].phases[0].items],
    ['with a phase number that is text', (d: Record<string, any>) => (d.specs[0].phases[0].phase = 'one')],
    ['with an item not saying whether it is checked', (d: Record<string, any>) => (d.specs[0].phases[0].items[0].checked = 'yes')],
    ['with missing files that are not names', (d: Record<string, any>) => (d.specs[2].missing_files = [1])],
  ])('refuses a spec %s', async (_, change) => {
    await expect(readSpecs(answering(`case-${cases++}`, changed('spec-list.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

// queue-list.json is what Jig 0.31.0 printed for three tasks, two of them queued, with an epic and a task on it
// added in the documented shape (Jig's docs/reading-jig-as-data.mdx); queue-move.json and queue-stale.json too.
describe('readQueue', () => {
  it("reads the queued tasks in Jig's order, without the epics", async () => {
    expect(await readQueue(answering('queue', 'queue-list.json'))).toEqual({
      revision: 1792656228,
      items: [
        { id: 'beta', level: null, position: 100, priority: null },
        { id: 'alpha', level: null, position: 200, priority: 1 },
        { id: 'booking-form', level: 'epic:booking', position: 100, priority: null },
      ],
    });
  });

  it.each([
    ['a priority above 5', (d: Record<string, any>) => (d.items[1].priority = 6)],
    ['a position that is no integer', (d: Record<string, any>) => (d.items[0].position = '100')],
    ['an item without its level, which may only be null', (d: Record<string, any>) => delete d.items[0].level],
  ])('refuses %s', async (_, change) => {
    await expect(readQueue(answering(`case-${cases++}`, changed('queue-list.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

/** A checkout whose Jig prints `json` and logs its arguments, one per line, to `args.log`. */
function logging(name: string, json: string, status = 0): string {
  const dir = answering(name, json, status);
  writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > args.log\ncat out.json\nexit ${status}\n`);
  return dir;
}
const args = (dir: string) => readFileSync(join(dir, 'args.log'), 'utf8').trim().split('\n');

describe('writing the queue', () => {
  it.each([
    [{ after: 'alpha' } as const, ['--after', 'task:alpha']],
    ['top' as const, ['--top']],
    ['bottom' as const, ['--bottom']],
  ])('moves a task %o against the revision it was read at', async (place, where) => {
    const dir = logging(`case-${cases++}`, 'queue-move.json');
    await moveInQueue(dir, 'beta', place, 1792656222);
    expect(args(dir)).toEqual(['queue', 'move', 'task:beta', ...where, '--revision', '1792656222', '--json']);
  });

  it.each([
    [1, '1'],
    [null, 'none'],
  ])('sets priority %s', async (priority, value) => {
    const dir = logging(`case-${cases++}`, 'queue-move.json');
    await setPriority(dir, 'beta', priority, 7);
    expect(args(dir)).toEqual(['queue', 'set', 'task:beta', '--priority', value, '--revision', '7', '--json']);
  });

  it('carries a stale revision as its code', async () => {
    await expect(moveInQueue(answering(`case-${cases++}`, 'queue-stale.json', 1), 'beta', 'top', 1)).rejects.toEqual(
      refusal('stale-revision'),
    );
    await expect(setPriority(answering(`case-${cases++}`, 'queue-stale.json', 1), 'beta', 2, 1)).rejects.toEqual(refusal('stale-revision'));
  });
});

// task-new*.json are what Jig 0.31.0 printed in a scratch repository.
describe('filing a task', () => {
  it("files a task with its goal, a person's text kept as one argument", async () => {
    const dir = logging(`case-${cases++}`, 'task-new.json');
    await fileTask(dir, 'zeta', 'File it; "quoted" --json $(x)');
    expect(args(dir)).toEqual(['task', 'new', 'zeta', '--goal', 'File it; "quoted" --json $(x)', '--json']);
  });

  // Unquoted by Node on Windows, a one-word goal must reach Jig as typed: Git bash globs and unquotes its command line.
  it.each(['out*', '*.json', "don't", 'a\\b', '"quoted"'])('keeps the one-word goal %s as it was typed', async (goal) => {
    const dir = logging(`case-${cases++}`, 'task-new.json');
    await fileTask(dir, 'zeta', goal);
    expect(args(dir)).toEqual(['task', 'new', 'zeta', '--goal', goal, '--json']);
  });

  it.each([
    ['task-new-exists.json', 'already-exists'],
    ['task-new-usage.json', 'usage'],
  ])('carries the refusal in %s as %s', async (json, code) => {
    await expect(fileTask(answering(`case-${cases++}`, json, 1), 'zeta', 'x')).rejects.toEqual(refusal(code));
  });
});

// queue-request*.json and queue-cancel.json are what Jig 0.31.0 printed in a scratch repository.
describe('asking a task to pause', () => {
  it('requests a pause against the revision it was read at', async () => {
    const dir = logging(`case-${cases++}`, 'queue-request.json');
    await requestPause(dir, 'beta', 1792656280);
    expect(args(dir)).toEqual(['queue', 'request', 'task:beta', 'pause', '--revision', '1792656280', '--json']);
  });

  it('takes a request back', async () => {
    const dir = logging(`case-${cases++}`, 'queue-cancel.json');
    await cancelPause(dir, 'beta', 3);
    expect(args(dir)).toEqual(['queue', 'cancel', 'task:beta', 'pause', '--revision', '3', '--json']);
  });

  it.each([
    ['queue-request-exists.json', 'already-exists'],
    ['queue-request-paused.json', 'failed'],
    ['queue-stale.json', 'stale-revision'],
  ])('carries the refusal in %s as %s', async (json, code) => {
    await expect(requestPause(answering(`case-${cases++}`, json, 1), 'beta', 1)).rejects.toEqual(refusal(code));
  });
});

// task-resume*.json are what Jig 0.35.0 printed in a scratch repository.
describe('resuming a task', () => {
  it('resumes a paused task against the revision it was read at, named by its bare id', async () => {
    const dir = logging(`case-${cases++}`, 'task-resume.json');
    await resumeTask(dir, 'beta', 1793042037);
    expect(args(dir)).toEqual(['task', 'resume', 'beta', '--revision', '1793042037', '--json']);
  });

  it.each([
    ['task-resume-not-paused.json', 'not-paused'],
    ['task-resume-wrong-checkout.json', 'wrong-checkout'],
    ['task-resume-stash-conflict.json', 'stash-conflict'],
    ['queue-stale.json', 'stale-revision'],
  ])('carries the refusal in %s as %s', async (json, code) => {
    await expect(resumeTask(answering(`case-${cases++}`, json, 1), 'beta', 1)).rejects.toEqual(refusal(code));
  });
});

describe('a refused read', () => {
  it("carries Jig's failure code", async () => {
    await expect(readTasks(answering('refused', 'refusal.json', 1))).rejects.toEqual(refusal('usage'));
  });

  it.each([
    ['an unknown code', '{"schema":1,"revision":1,"generated_at":"x","error":{"code":"brand-new","message":"m"}}', 1],
    ['no JSON at all', 'jig: error: something', 1],
  ])('is failed for %s', async (_, out, status) => {
    await expect(readTasks(answering(`case-${cases++}`, out, status))).rejects.toEqual(refusal('failed'));
  });

  it('is a shape error for another schema', async () => {
    const out = '{"schema":2,"revision":1,"generated_at":"x","data":{"tasks":[]}}';
    await expect(readTasks(answering(`case-${cases++}`, out))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('writtenByReads', () => {
  it("passes over Jig's records of its own reads, never the revision or the tasks", () => {
    expect(writtenByReads('runtime')).toBe(true);
    expect(writtenByReads('runtime/checkout')).toBe(true);
    expect(writtenByReads('runtime/working/live-updates')).toBe(true);
    expect(writtenByReads('runtime/revision')).toBe(false);
    expect(writtenByReads('runtime/revision/1792229491')).toBe(false);
    expect(writtenByReads('workspace/tasks/a/state')).toBe(false);
    expect(writtenByReads('runtimes')).toBe(false);
  });
});
