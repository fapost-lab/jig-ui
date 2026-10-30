import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  cancelPause,
  closeTask,
  fileTask,
  jigVersion,
  landUpgrade,
  JigRefusal,
  JigShapeError,
  MIN_JIG_VERSION,
  moveInQueue,
  planUpgrade,
  readArtifact,
  readArtifacts,
  readQueue,
  readSpecs,
  readStatus,
  readTasks,
  releaseNamed,
  requestPause,
  resumeTask,
  runUpgrade,
  selfUpdate,
  setPriority,
  supports,
  withoutPaths,
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
      versions: null,
    });
  });

  // status-upgrade.json is what Jig 0.35.0 printed in a scratch repository whose manifest says 0.33.0.
  it("reads the project's Jig and the machine's from an upgrade item", async () => {
    const read = await readStatus(answering('status-upgrade', 'status-upgrade.json'));
    expect(read.attention).toEqual([
      expect.objectContaining({ kind: 'upgrade-available', todo: 'jig upgrade', versions: { from: '0.33.0', to: '0.35.0' } }),
    ]);
  });

  // status-release.json is what Jig 0.37.0 printed once its housekeeping had heard of 0.38.0.
  it('reads the release a release item names, and none from another item', async () => {
    const read = await readStatus(answering('status-release', 'status-release.json'));
    expect(read.attention.map(releaseNamed)).toEqual(['0.38.0']);
    const other = await readStatus(answering('status-upgrade-named', 'status-upgrade.json'));
    expect(other.attention.map(releaseNamed)).toEqual([undefined]);
  });

  it('reads a project where nothing needs the person and housekeeping never ran', async () => {
    expect(await readStatus(answering('status-empty', 'status.json'))).toMatchObject({ attention: [], housekeepingStale: false });
  });

  it.each([
    ['an item without a title', (d: Record<string, any>) => delete d.attention[0].title],
    ['an item without its url, which may only be null', (d: Record<string, any>) => delete d.attention[0].url],
    ['attention that is not a list', (d: Record<string, any>) => (d.attention = {})],
    ['housekeeping without stale', (d: Record<string, any>) => (d.housekeeping = { ran_at: 'x' })],
    ['versions without the machine’s', (d: Record<string, any>) => (d.attention[0].versions = { from: '0.33.0' })],
  ])('refuses %s', async (_, change) => {
    await expect(readStatus(answering(`case-${cases++}`, changed('status-attention.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });

  it('refuses an upgrade item without its versions', async () => {
    const answer = changed('status-upgrade.json', (d) => delete d.attention[0].versions);
    await expect(readStatus(answering(`case-${cases++}`, answer))).rejects.toBeInstanceOf(JigShapeError);
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
      ['put-away', 'archived'],
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
    const [ui, billing, half] = (await readSpecs(answering('specs', 'spec-list.json'))).specs;
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
    expect(await readSpecs(answering(`case-${cases++}`, '{"schema":1,"revision":1,"generated_at":"x","data":{"specs":[]}}'))).toEqual({
      revision: 1,
      specs: [],
    });
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
  it("reads the queued tasks and epics apart, each in Jig's order", async () => {
    expect(await readQueue(answering('queue', 'queue-list.json'))).toEqual({
      revision: 1792656228,
      items: [
        { id: 'beta', level: null, position: 100, priority: null, dependsOn: [] },
        { id: 'alpha', level: null, position: 200, priority: 1, dependsOn: [] },
        {
          id: 'booking-form',
          level: 'epic:booking',
          position: 100,
          priority: null,
          dependsOn: [{ on: 'task:beta', reason: 'Quotes the form' }],
        },
      ],
      epics: [{ id: 'booking', level: null, position: 300, priority: 0, dependsOn: [] }],
    });
  });

  it.each([
    ['a priority above 5', (d: Record<string, any>) => (d.items[1].priority = 6)],
    ['a position that is no integer', (d: Record<string, any>) => (d.items[0].position = '100')],
    ['an item without its level, which may only be null', (d: Record<string, any>) => delete d.items[0].level],
    ['a dependency without its reason', (d: Record<string, any>) => delete d.items[3].depends_on[0].reason],
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
    await moveInQueue(dir, 'task:beta', place, 1792656222);
    expect(args(dir)).toEqual(['queue', 'move', 'task:beta', ...where, '--revision', '1792656222', '--json']);
  });

  it.each([
    [{ after: 'alpha' } as const, ['--after', 'epic:alpha']],
    [{ before: 'alpha' } as const, ['--before', 'epic:alpha']],
  ])('moves an epic %o among the epics', async (place, where) => {
    const dir = logging(`case-${cases++}`, 'queue-move.json');
    await moveInQueue(dir, 'epic:booking', place, 5);
    expect(args(dir)).toEqual(['queue', 'move', 'epic:booking', ...where, '--revision', '5', '--json']);
  });

  it.each([
    [1, '1'],
    [null, 'none'],
  ])('sets priority %s', async (priority, value) => {
    const dir = logging(`case-${cases++}`, 'queue-move.json');
    await setPriority(dir, 'task:beta', priority, 7);
    expect(args(dir)).toEqual(['queue', 'set', 'task:beta', '--priority', value, '--revision', '7', '--json']);
    await setPriority(dir, 'epic:booking', priority, 7);
    expect(args(dir)).toEqual(['queue', 'set', 'epic:booking', '--priority', value, '--revision', '7', '--json']);
  });

  it('carries a stale revision as its code', async () => {
    await expect(moveInQueue(answering(`case-${cases++}`, 'queue-stale.json', 1), 'task:beta', 'top', 1)).rejects.toEqual(
      refusal('stale-revision'),
    );
    await expect(setPriority(answering(`case-${cases++}`, 'queue-stale.json', 1), 'epic:beta', 2, 1)).rejects.toEqual(
      refusal('stale-revision'),
    );
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

// task-artifact*.json are what Jig 0.39.0 printed in this project; task-artifacts.json with an empty document and one
// out of the workspace put in, in the shape its lib/task.sh prints.
describe("a task's documents", () => {
  it('lists the ones that are there, in Jig order, an unavailable one with its reason', async () => {
    const dir = logging(`case-${cases++}`, 'task-artifacts.json');
    expect(await readArtifacts(dir, 'task-artifacts')).toEqual([
      { kind: 'task', state: 'present', reason: null, updatedAt: '2026-10-30T06:59:36Z', bytes: 1749 },
      { kind: 'discovery', state: 'present', reason: null, updatedAt: '2026-10-30T06:57:46Z', bytes: 1993 },
      { kind: 'design', state: 'present', reason: null, updatedAt: '2026-10-30T06:59:35Z', bytes: 5288 },
      { kind: 'verification', state: 'empty', reason: null, updatedAt: '2026-10-30T07:10:00Z', bytes: 0 },
      { kind: 'handoff', state: 'unavailable', reason: 'outside workspace', updatedAt: null, bytes: null },
    ]);
    expect(args(dir)).toEqual(['task', 'artifacts', 'task-artifacts', '--json']);
  });

  it('leaves out a kind it does not know, and refuses a state it does not', async () => {
    const later = changed('task-artifacts.json', (d) => (d.artifacts[0].kind = 'retrospective'));
    expect((await readArtifacts(answering(`case-${cases++}`, later), 'x')).map((a) => a.kind)).not.toContain('retrospective');
    const odd = changed('task-artifacts.json', (d) => (d.artifacts[0].state = 'stale'));
    await expect(readArtifacts(answering(`case-${cases++}`, odd), 'x')).rejects.toBeInstanceOf(JigShapeError);
  });

  it('reads one as it is written', async () => {
    const dir = logging(`case-${cases++}`, 'task-artifact-read.json');
    const read = await readArtifact(dir, 'task-artifacts', 'discovery');
    expect(read).toMatchObject({ kind: 'discovery', updatedAt: '2026-10-30T06:57:46Z', bytes: 1993 });
    expect(read.content).toMatch(/^# Discovery — task-artifacts\n\nRe-classified T2 → T3/);
    expect(args(dir)).toEqual(['task', 'artifact', 'read', 'task-artifacts', 'discovery', '--json']);
  });

  it('carries not-found for a document not there and for a task Jig does not know', async () => {
    await expect(readArtifact(answering(`case-${cases++}`, 'task-artifact-missing.json', 1), 'x', 'spec')).rejects.toEqual(
      refusal('not-found'),
    );
    await expect(readArtifacts(answering(`case-${cases++}`, 'task-artifacts-unknown.json', 1), 'x')).rejects.toEqual(refusal('not-found'));
  });
});

// upgrade-*.json are what Jig 0.35.0 printed in scratch repositories whose manifest says 0.33.0: clean, with a task
// started in the checkout, at agent.git none (staged), commit and push (to a bare remote).
describe('upgrading the project', () => {
  it('plans with a dry run, changing nothing', async () => {
    const dir = logging(`case-${cases++}`, 'upgrade-plan.json');
    expect(await planUpgrade(dir)).toEqual({
      mode: 'copy',
      from: '0.33.0',
      to: '0.35.0',
      outcome: 'planned',
      git: null,
      manualSteps: [],
      wouldStop: [],
    });
    expect(args(dir)).toEqual(['upgrade', '--dry-run', '--json']);
  });

  it('reads every reason a real run would not start', async () => {
    const plan = await planUpgrade(answering(`case-${cases++}`, 'upgrade-plan-stop.json'));
    expect(plan.wouldStop).toEqual([expect.stringMatching(/^task up-x is started and its branch task\/up-x is checked out here/)]);
  });

  it.each([
    ['upgrade-staged.json', 'staged', { level: 'none', commit: null, pushed: false }],
    ['upgrade-commit.json', 'upgraded', { level: 'commit', commit: '3110eef8eab82123984eed97745ca146a0eb21b0', pushed: false }],
    ['upgrade-push.json', 'upgraded', { level: 'push', pushed: true }],
  ])('reads what %s did: %s', async (json, outcome, git) => {
    const dir = logging(`case-${cases++}`, json);
    const done = await runUpgrade(dir);
    expect(done).toMatchObject({
      outcome,
      from: '0.33.0',
      to: '0.35.0',
      git: { branch: 'jig/upgrade-0.35.0', pullRequest: null, merged: false, ...git },
    });
    expect(args(dir)).toEqual(['upgrade', '--json']);
  });

  it("carries Jig's reasons with a refusal to start, a path in them cut out", async () => {
    const blocked = readFileSync(fixture('upgrade-blocked.json'), 'utf8').replace('(record .ai/', '(record /home/me/shop/.ai/');
    const refused = await runUpgrade(answering(`case-${cases++}`, blocked, 1)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(JigRefusal);
    expect((refused as JigRefusal).code).toBe('upgrade-blocked');
    expect((refused as JigRefusal).reasons).toEqual([expect.stringContaining('checked out here (record …); the upgrade would take')]);
  });

  it("carries Jig's words with any other refusal, its own prefix and every path cut off", async () => {
    const failed = (message: string) => JSON.stringify({ schema: 1, revision: 7, generated_at: 'x', error: { code: 'failed', message } });
    const source = await planUpgrade(
      answering(`case-${cases++}`, failed('upgrade: cannot determine the framework source root; pass --from <dir>'), 1),
    ).catch((e: unknown) => e);
    expect(source).toMatchObject({ code: 'failed', reasons: ['cannot determine the framework source root; pass --from <dir>'] });
    const pathed = await runUpgrade(
      answering(`case-${cases++}`, failed('jig: error: upgrade: no Jig at /Users/juve/.local/share/jig\nsecond line'), 1),
    ).catch((e: unknown) => e);
    expect(pathed).toMatchObject({ code: 'failed', reasons: ['no Jig at …', 'second line'] });
  });

  it.each([
    ['an upgrade without its outcome', (d: Record<string, any>) => delete d.outcome],
    ['git without pushed', (d: Record<string, any>) => delete d.git.pushed],
    ['reasons that are not a list', (d: Record<string, any>) => (d.would_stop = 'x')],
  ])('refuses %s', async (_, change) => {
    await expect(runUpgrade(answering(`case-${cases++}`, changed('upgrade-commit.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

/** A checkout whose Jig logs its arguments, prints `out` and `err`, and exits with `code`. */
function selfUpdating(name: string, out: string, err = '', code = 0): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'out.txt'), out);
  writeFileSync(join(dir, 'err.txt'), err);
  writeFileSync(
    join(dir, '.ai', 'scripts', 'jig'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > args.log\ncat out.txt\ncat err.txt >&2\nexit ${code}\n`,
  );
  return dir;
}

/** A checkout whose Jig answers `queue list --json` at `revision` and `task set` with `err` and `code`, logging every call. */
function closing(name: string, revision: number, err = '', code = 0): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'err.txt'), err);
  writeFileSync(
    join(dir, '.ai', 'scripts', 'jig'),
    `#!/usr/bin/env bash
echo "$*" >> calls.log
case "$*" in
  "queue list --json") echo '{"schema":1,"revision":${revision},"generated_at":"x","data":{"items":[]}}' ;;
  "task set "*) cat err.txt >&2; exit ${code} ;;
esac
`,
  );
  return dir;
}
const closeCalls = (dir: string) => readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');

describe('closeTask', () => {
  it("reads the clone's revision, then runs the command of Jig's close action", async () => {
    const dir = closing(`case-${cases++}`, 41);
    await closeTask(dir, 'beta', 41);
    expect(closeCalls(dir)).toEqual(['queue list --json', 'task set beta status consolidated']);
  });

  it('refuses a revision the clone has moved past, running nothing', async () => {
    const dir = closing(`case-${cases++}`, 42);
    await expect(closeTask(dir, 'beta', 41)).rejects.toEqual(refusal('stale-revision'));
    expect(closeCalls(dir)).toEqual(['queue list --json']);
  });

  it("carries Jig's refusal as its reasons, without a path", async () => {
    const err = [
      'jig: error: task set: status consolidated requires knowledge_consolidated true; record the knowledge decision first: jig task set beta knowledge_consolidated true',
      'jig: error: task set: cannot write /Users/me/project/.ai/workspace/tasks/beta/state',
      'a line that is not an error',
    ].join('\n');
    const dir = closing(`case-${cases++}`, 41, err, 1);
    await expect(closeTask(dir, 'beta', 41)).rejects.toMatchObject({
      code: 'failed',
      reasons: [
        'status consolidated requires knowledge_consolidated true; record the knowledge decision first: jig task set beta knowledge_consolidated true',
        'cannot write …',
      ],
    });
  });
});

describe('selfUpdate', () => {
  it('runs jig self-update as text and answers its last line', async () => {
    const dir = selfUpdating(`case-${cases++}`, 'fetching\nself-update: updated 0.37.0 -> 0.38.0 (abc1234)\n');
    expect(await selfUpdate(dir)).toBe('self-update: updated 0.37.0 -> 0.38.0 (abc1234)');
    expect(args(dir)).toEqual(['self-update']);
  });

  it('cuts a path out of what it says', async () => {
    const dir = selfUpdating(`case-${cases++}`, 'self-update: already current in /Users/me/jig/framework\n');
    expect(await selfUpdate(dir)).toBe('self-update: already current in …');
  });

  it('answers an empty line when Jig prints nothing', async () => {
    expect(await selfUpdate(selfUpdating(`case-${cases++}`, ''))).toBe('');
  });

  it('refuses as failed with the reasons of jig: error lines, with or without the self-update prefix and without a path', async () => {
    const err = [
      'noise on stderr',
      'jig: error: self-update: cannot reach the remote',
      'jig: error: checkout /Users/me/jig/framework has local changes',
      'jig: error:',
    ].join('\n');
    const refused = await selfUpdate(selfUpdating(`case-${cases++}`, '', err, 1)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(JigRefusal);
    expect((refused as JigRefusal).code).toBe('failed');
    expect((refused as JigRefusal).reasons).toEqual(['cannot reach the remote', 'checkout … has local changes']);
  });

  it('refuses as failed with no reasons when Jig explains nothing', async () => {
    const refused = await selfUpdate(selfUpdating(`case-${cases++}`, '', '', 2)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(JigRefusal);
    expect((refused as JigRefusal).code).toBe('failed');
    expect((refused as JigRefusal).reasons).toEqual([]);
  });

  it('refuses as failed when the checkout has no Jig', async () => {
    mkdirSync(join(root, 'no-jig'), { recursive: true });
    await expect(selfUpdate(join(root, 'no-jig'))).rejects.toEqual(refusal('failed'));
  });
});

describe('withoutPaths', () => {
  it.each([
    ['(record /Users/me/shop/.ai/runtime/working/x); then', '(record …); then'],
    ['in /c/Users/me/shop and', 'in … and'],
    ['at C:\\Users\\me\\shop.', 'at …'],
    [
      'branch task/up-x, `git stash`, .gitattributes, https://example.com/a',
      'branch task/up-x, `git stash`, .gitattributes, https://example.com/a',
    ],
  ])('%s', (text, expected) => {
    expect(withoutPaths(text)).toBe(expected);
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

  it('is timeout when Jig does not answer within the limit, its version read too', async () => {
    const slow = checkout('slow', 'jig 0.38.1');
    writeFileSync(join(slow, '.ai', 'scripts', 'jig'), '#!/usr/bin/env bash\nsleep 5\n');
    await expect(readStatus(slow, process.platform, 200)).rejects.toEqual(refusal('timeout'));
    await expect(jigVersion(slow, process.platform, 200)).rejects.toEqual(refusal('timeout'));
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

// Jig 0.38.1 from fapost-lab/jig main after #352 (released as 0.39.0) printed these in a scratch project, the forge faked
// as Jig's own tests fake it: an upgrade's pull request open and merged, and `jig upgrade --land` landing it, finding
// nothing, and refused while the pull request was open.
describe("an upgrade's pull request", () => {
  it('reads the item of a pull request open, and of one merged that is not here yet', async () => {
    const waiting = await readStatus(answering('status-pr-waiting', 'status-upgrade-pr-waiting.json'));
    expect(waiting.attention).toEqual([
      expect.objectContaining({
        kind: 'upgrade-pull-request-waiting',
        url: 'https://github.com/o/r/pull/12',
        versions: null,
        pullRequest: { branch: 'jig/upgrade-9.9.9', base: 'main', state: 'open', to: '9.9.9' },
      }),
    ]);
    const merged = await readStatus(answering('status-pr-merged', 'status-upgrade-pr-merged.json'));
    expect(merged.attention[0]).toMatchObject({
      kind: 'upgrade-pull-request-merged',
      todo: 'jig upgrade --land',
      pullRequest: { state: 'merged', to: '9.9.9' },
    });
  });

  it('refuses a pull request item without its pull request', async () => {
    const answer = changed('status-upgrade-pr-waiting.json', (d) => delete d.attention[0].pull_request);
    await expect(readStatus(answering(`case-${cases++}`, answer))).rejects.toBeInstanceOf(JigShapeError);
  });

  it('lands a merged upgrade, and finds nothing the second time', async () => {
    const dir = answering('land', 'upgrade-land.json');
    expect(await landUpgrade(dir)).toMatchObject({
      outcome: 'landed',
      from: '0.38.1',
      to: '9.9.9',
      git: { branch: 'jig/upgrade-9.9.9', merged: true, pullRequest: 'https://github.com/example/example/pull/12' },
      land: { base: 'main', branchDeleted: true, originBranchDeleted: false },
    });
    expect(await landUpgrade(answering('land-nothing', 'upgrade-land-nothing.json'))).toMatchObject({
      outcome: 'nothing-to-do',
      git: null,
    });
  });

  it('is refused not-merged while the pull request is open', async () => {
    const refused = await landUpgrade(answering('land-open', 'upgrade-land-not-merged.json', 1)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(JigRefusal);
    expect(refused).toMatchObject({ code: 'not-merged' });
  });
});

describe('stopJig', () => {
  // A stop refuses every run after it: each case takes a client of its own.
  const fresh = async () => {
    vi.resetModules();
    return import('./client.js');
  };

  it.skipIf(process.platform === 'win32')('stops an upgrade under way with everything it started, as Ctrl+C would', async () => {
    const dir = join(root, 'stopped-upgrade');
    mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
    // An upgrade waiting for CI: the script waits on a child of its own, which writes its pid first.
    writeFileSync(join(dir, '.ai', 'scripts', 'jig'), "#!/usr/bin/env bash\nbash -c 'echo $$ > waiter.pid; exec sleep 60'\n");
    const client = await fresh();
    const upgrade = client.runUpgrade(dir).catch((e: unknown) => e);
    for (let waited = 0; !existsSync(join(dir, 'waiter.pid')) && waited < 5_000; waited += 25) await delay(25);
    const waiter = Number(readFileSync(join(dir, 'waiter.pid'), 'utf8'));
    const started = Date.now();
    await client.stopJig(2_000);
    expect(await upgrade).toBeInstanceOf(client.JigRefusal);
    expect(Date.now() - started).toBeLessThan(2_000);
    // The child is gone too: signal 0 only asks whether the pid lives.
    await delay(100);
    expect(() => process.kill(waiter, 0)).toThrow();
  });

  it.skipIf(process.platform === 'win32')('gives up on a run whose output a process out of its group holds', async () => {
    const dir = join(root, 'held-upgrade');
    mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
    // A daemon of the run's own (as ssh or git may leave) leaves the group and keeps the output open. It says so with
    // `left`: until then it is still in the group, and on a slow runner the SIGKILL would take it along.
    writeFileSync(
      join(dir, '.ai', 'scripts', 'jig'),
      '#!/usr/bin/env bash\nperl -MPOSIX -e \'POSIX::setsid(); open(F, ">", "left"); close F; exec qw(sleep 6)\' &\nsleep 60\n',
    );
    const client = await fresh();
    const upgrade = client.runUpgrade(dir).catch((e: unknown) => e);
    for (let waited = 0; !existsSync(join(dir, 'left')) && waited < 5_000; waited += 25) await delay(25);
    const started = Date.now();
    await client.stopJig(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_000); // it waited for the run, past the SIGKILL
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(await Promise.race([upgrade.then(() => 'answered'), delay(10, 'still held')])).toBe('still held');
  });

  it('refuses a run asked for once Jig UI is stopping', async () => {
    const client = await fresh();
    await client.stopJig(10);
    const dir = answering('after-stop', 'upgrade-commit.json');
    writeFileSync(join(dir, '.ai', 'scripts', 'jig'), '#!/usr/bin/env bash\ntouch ran\ncat out.json\n');
    await expect(client.runUpgrade(dir)).rejects.toBeInstanceOf(client.JigRefusal);
    expect(existsSync(join(dir, 'ran'))).toBe(false);
  });

  it('has nothing to stop when nothing runs', async () => {
    await expect((await fresh()).stopJig(10)).resolves.toBeUndefined();
  });
});
