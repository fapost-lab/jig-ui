import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  addItem,
  fileItem,
  fileNewItem,
  moveItem,
  cancelPause,
  closeTask,
  decideKnowledge,
  fileTask,
  housekeeping,
  jigVersion,
  withoutTokens,
  landUpgrade,
  JigRefusal,
  JigShapeError,
  MIN_JIG_VERSION,
  moveInQueue,
  planUpgrade,
  readArtifact,
  readArtifacts,
  readKnowledge,
  readKnowledgeText,
  readQueue,
  readSettings,
  readSourceDiff,
  readSpecs,
  readStatus,
  readFinishedTasks,
  readTasks,
  refresh,
  releaseNamed,
  requestPause,
  pauseTask,
  resumeTask,
  runUpgrade,
  selfUpdate,
  setPriority,
  setSetting,
  supports,
  unsetSetting,
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

describe('the environment of a Jig run', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('leaves out the GitHub token variables of the shell Jig UI was started from, and keeps the rest', async () => {
    for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) vi.stubEnv(name, 'from-an-envrc');
    vi.stubEnv('JIG_UI_KEPT', 'kept');
    const dir = join(root, 'env');
    mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
    writeFileSync(
      join(dir, '.ai', 'scripts', 'jig'),
      `#!/usr/bin/env bash\n[ -z "\${GH_TOKEN+x}\${GITHUB_TOKEN+x}\${GH_ENTERPRISE_TOKEN+x}\${GITHUB_ENTERPRISE_TOKEN+x}" ] || exit 1\n[ "$JIG_UI_KEPT" = kept ] || exit 1\necho "jig 0.45.0"\n`,
    );
    expect(await jigVersion(dir)).toBe('0.45.0');
  });

  it.each([
    ['darwin', ['Gh_Token', 'github_token', 'KEPT']],
    ['linux', ['Gh_Token', 'github_token', 'KEPT']],
    ['win32', ['KEPT']],
  ] as const)('on %s leaves out a token variable in another case only where the system names variables in any case', (platform, kept) => {
    const env = { GH_TOKEN: 't', Gh_Token: 't', github_token: 't', KEPT: 'k' };
    expect(Object.keys(withoutTokens(env, platform))).toEqual(kept);
  });
});

describe('readFinishedTasks', () => {
  // task-list-status-abandoned.json is what Jig 0.40.0 printed in a scratch repository; the rows of the closed ones are 0.31.0's.
  const finishedJig = (name: string, consolidated: string, abandoned: string): string => {
    const dir = answering(name, '{}');
    writeFileSync(join(dir, 'consolidated.json'), consolidated);
    writeFileSync(join(dir, 'abandoned.json'), abandoned);
    writeFileSync(
      join(dir, '.ai', 'scripts', 'jig'),
      `#!/usr/bin/env bash\necho "$*" >> calls.log\ncase "$*" in\n  *consolidated*) cat consolidated.json ;;\n  *abandoned*) cat abandoned.json; grep -q '"error"' abandoned.json && exit 1 ;;\nesac\nexit 0\n`,
    );
    return dir;
  };
  const closed = changed('task-list-all.json', (d) => (d.tasks = d.tasks.filter((t: { status: string }) => t.status === 'consolidated')));
  const dropped = readFileSync(fixture('task-list-status-abandoned.json'), 'utf8');

  it('asks for one status at a time, and reads both by id', async () => {
    const dir = finishedJig('finished', closed, dropped);
    expect((await readFinishedTasks(dir)).map((t) => [t.id, t.status])).toEqual([
      ['fix-typo', 'consolidated'],
      ['old-idea', 'abandoned'],
    ]);
    expect(readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').sort()).toEqual([
      'task list --status abandoned --json',
      'task list --status consolidated --json',
    ]);
  });

  it('refuses as a whole when either status is refused', async () => {
    const refused = readFileSync(fixture('refusal.json'), 'utf8');
    await expect(readFinishedTasks(finishedJig('finished-refused', closed, refused))).rejects.toEqual(refusal('usage'));
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
    expect(await readStatus(answering('status-empty', 'status.json'))).toMatchObject({
      attention: [],
      housekeepingStale: false,
      origin: null,
    });
  });

  // status-origin.json is what Jig 0.45.0 printed in a scratch repository whose origin, a local bare one, was two commits ahead.
  it('reads how the clone stands against origin, and the item asking for a refresh', async () => {
    const read = await readStatus(answering('status-origin', 'status-origin.json'));
    expect(read.origin).toEqual({ fetchedAt: '2026-11-13T08:40:55Z', behind: 2 });
    expect(read.attention).toEqual([
      expect.objectContaining({ kind: 'base-behind-origin', subject: { type: 'project', id: null }, todo: 'jig refresh' }),
    ]);
  });

  it('reads an origin with no base branch on either side as not knowing how far behind', async () => {
    const read = await readStatus(
      answering(
        `case-${cases++}`,
        changed('status-origin.json', (d) => (d.origin = { base: 'main', fetched_at: null, behind: null, ahead: null })),
      ),
    );
    expect(read.origin).toEqual({ fetchedAt: null, behind: null });
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

  it('refuses an origin whose behind is not a count', async () => {
    const answer = changed('status-origin.json', (d) => (d.origin.behind = '2'));
    await expect(readStatus(answering(`case-${cases++}`, answer))).rejects.toBeInstanceOf(JigShapeError);
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
      stagingFlow: false,
      staging: null,
      parked: null,
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

  it('asks only for the live tasks, and counts the finished ones it left out', async () => {
    const dir = logging('tasks-live', 'task-list.json');
    expect(await readTasks(dir)).toMatchObject({ finished: 0 });
    expect(args(dir)).toEqual(['task', 'list', '--json']);
    const before = changed('task-list.json', (d) => (d.hidden = 4));
    expect(await readTasks(answering(`case-${cases++}`, before))).toMatchObject({ finished: 4 });
    // Jig 0.37.0 hides the archived ones too, and says how many of the hidden they are.
    const since = changed('task-list.json', (d) => ((d.hidden = 4), (d.archived = 1)));
    expect(await readTasks(answering(`case-${cases++}`, since))).toMatchObject({ finished: 3 });
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

  // task-list-staging.json is what Jig 0.45.0 printed in a scratch repository on the staging flow, with a local origin:
  // `tested` merged into origin's staging branch, `fixing` merged and taken back with a fix, `waiting` pushed only.
  it('reads where a task stands on the staging flow, and nothing of it on any other flow', async () => {
    const read = await readTasks(answering('tasks-staging', 'task-list-staging.json'));
    expect(read.tasks.map((t) => [t.id, t.stagingFlow, t.staging, t.parked])).toEqual([
      ['fixing', true, 'behind', null],
      ['tested', true, 'on', { reason: 'signal', hint: null }],
      ['waiting', true, null, null],
    ]);
    // A pull request into staging waits for its review, which the person lands (their agent.git below merge).
    const review = changed('task-list-staging.json', (d) => (d.tasks[2].parked = { reason: 'review', hint: 'landing' }));
    expect((await readTasks(answering(`case-${cases++}`, review))).tasks[2]?.parked).toEqual({ reason: 'review', hint: 'landing' });
    const direct = await readTasks(answering('tasks-direct', 'task-list.json'));
    expect(direct.tasks.map((t) => [t.stagingFlow, t.staging, t.parked])).toEqual(direct.tasks.map(() => [false, null, null]));
  });

  it.each([
    ['a staging state this Jig UI does not know', (d: Record<string, any>) => (d.tasks[0].staging = 'ahead')],
    ['a parked task without its reason', (d: Record<string, any>) => (d.tasks[1].parked = { hint: null })],
  ])('refuses %s', async (_, change) => {
    await expect(readTasks(answering(`case-${cases++}`, changed('task-list-staging.json', change)))).rejects.toBeInstanceOf(JigShapeError);
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
    // Jig 0.29.0 names no item and shows no edit waiting.
    expect(ui?.phases[1]?.items[2]).toEqual({
      id: null,
      text: "fog: registration by `jig init` — needs a hook on Jig's side",
      checked: false,
      task: null,
      fog: true,
    });
    expect(ui?.waiting).toBeNull();
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

// spec-list-items.json and spec-list-waiting.json are what Jig 0.40.0 printed in a scratch project before and after
// two edits from `jig spec item` (an item added to phase 2, phase 2's item moved to phase 1), committed on spec/shop.
describe('readSpecs from Jig 0.40.0', () => {
  it("reads each item's handle, and no edit waiting", async () => {
    const [shop] = (await readSpecs(answering('specs-items', 'spec-list-items.json'))).specs;
    expect(shop?.phases.map((p) => p.items.map((i) => i.id))).toEqual([
      ['i-62da8b35c084', 'i-5d729342e61f', 'i-d515b2062980'],
      ['i-230488071aa6'],
    ]);
    expect(shop?.waiting).toBeNull();
  });

  it('reads the edits waiting on the write branch, with the roadmap as it is there', async () => {
    const [shop] = (await readSpecs(answering('specs-waiting', 'spec-list-waiting.json'))).specs;
    expect(shop?.progress).toEqual({ done: 1, total: 4, filed: 0, fog: 1 });
    expect(shop?.waiting).toMatchObject({
      branch: 'spec/shop',
      base: 'main',
      commits: 2,
      pushed: false,
      pr: null,
      progress: { done: 1, total: 5, filed: 0, fog: 1 },
    });
    expect(shop?.waiting?.phases.map((p) => p.items.map((i) => i.id))).toEqual([
      ['i-62da8b35c084', 'i-5d729342e61f', 'i-d515b2062980', 'i-230488071aa6'],
      ['i-9ab540b709b6'],
    ]);
    // The commit is Jig's to know.
    expect(shop?.waiting).not.toHaveProperty('commit');
  });

  it.each([
    ['an item handle that is not text', (d: Record<string, any>) => (d.specs[0].phases[0].items[0].id = 7)],
    ['a waiting edit without its branch', (d: Record<string, any>) => delete d.specs[0].waiting.branch],
    ['a waiting edit without its phases', (d: Record<string, any>) => delete d.specs[0].waiting.phases],
  ])('refuses %s', async (_, change) => {
    await expect(readSpecs(answering(`case-${cases++}`, changed('spec-list-waiting.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

// spec-item-*.json are what Jig 0.40.0 answered in that scratch project; the checkout's path is replaced by one of no one's.
describe('writing a roadmap', () => {
  it("adds an item at the bottom of a phase and answers Jig's note", async () => {
    const dir = logging(`case-${cases++}`, 'spec-item-add.json');
    expect(await addItem(dir, 'shop', 2, 'Pay by invoice — for companies', 1793950057)).toBe(
      'agent.git is commit: pushing spec/shop is yours',
    );
    expect(args(dir)).toEqual([
      'spec',
      'item',
      'add',
      'shop',
      '--phase',
      '2',
      '--text',
      'Pay by invoice — for companies',
      '--revision',
      '1793950057',
      '--json',
    ]);
  });

  it.each([
    [{ after: 'i-5d729342e61f' } as const, ['--after', 'i-5d729342e61f']],
    ['top' as const, ['--top']],
    [{ phase: 1 } as const, ['--phase', '1']],
  ])('moves an item %o', async (place, where) => {
    const dir = logging(`case-${cases++}`, 'spec-item-move.json');
    await moveItem(dir, 'shop', 'i-230488071aa6', place, 1793950060);
    expect(args(dir)).toEqual(['spec', 'item', 'move', 'shop', 'i-230488071aa6', ...where, '--revision', '1793950060', '--json']);
  });

  it('names a task filed earlier on an item', async () => {
    const dir = logging(`case-${cases++}`, 'spec-item-file.json');
    await fileItem(dir, 'shop', 'i-5d729342e61f', 'search-products', 1793950066);
    expect(args(dir)).toEqual([
      'spec',
      'item',
      'file',
      'shop',
      'i-5d729342e61f',
      '--task',
      'search-products',
      '--revision',
      '1793950066',
      '--json',
    ]);
  });

  // spec-item-file-new.json is what Jig 0.41.0 answered in a scratch project of its own.
  it("files a new task and names it on an item in one write, and answers Jig's note", async () => {
    const dir = logging(`case-${cases++}`, 'spec-item-file-new.json');
    expect(await fileNewItem(dir, 'shop', 'i-5d729342e61f', 'search-products', 'Search products by name', 1794293348)).toBe(
      'agent.git is commit: pushing spec/shop is yours',
    );
    expect(args(dir)).toEqual([
      'spec',
      'item',
      'file',
      'shop',
      'i-5d729342e61f',
      '--new',
      'search-products',
      '--goal',
      'Search products by name',
      '--revision',
      '1794293348',
      '--json',
    ]);
  });

  it('answers no note where Jig gives none', async () => {
    const json = changed('spec-item-add.json', (data) => {
      data.write.note = null;
    });
    expect(await addItem(answering(`case-${cases++}`, json), 'shop', 2, 'x', 1)).toBeNull();
  });

  const add = (dir: string) => addItem(dir, 'shop', 2, 'x', 1);
  it.each([
    [
      'spec-item-stale.json',
      'stale-revision',
      (dir: string) => moveItem(dir, 'shop', 'i-230488071aa6', 'top', 1),
      ['the clone changed since revision 1793950060; read again and retry'],
    ],
    [
      'spec-item-git-not-allowed.json',
      'git-not-allowed',
      add,
      [
        'agent.git is none in this clone, so Jig commits nothing; set it with `jig config set --local agent.git commit` (or higher), or make the change in an agent session',
      ],
    ],
    // Jig names the command it ran inside, which is not the one Jig UI ran: it stays.
    [
      'spec-item-not-linkable.json',
      'not-linkable',
      (dir: string) => fileItem(dir, 'shop', 'i-230488071aa6', 'started', 1),
      [
        'spec link: started is started on task/started; a started task is not moved — ship it where it was cut from, and an epic gets it when the default branch is merged into it',
      ],
    ],
    [
      'spec-item-checked-out.json',
      'branch-checked-out',
      add,
      [
        'spec/shop is checked out in … and Jig never moves a checkout; finish the work there, or switch that checkout to another branch, then try again',
      ],
    ],
  ])("carries the refusal in %s as %s, Jig's reason without its command's name or a path", async (json, code, write, reasons) => {
    await expect(write(answering(`case-${cases++}`, json, 1))).rejects.toMatchObject({ code, reasons });
  });

  // From Jig 0.42.0 an item that names a task already is refused with a code of its own (fapost-lab/jig#442).
  it('carries already-filed as its own code, not as a failure', async () => {
    const json = JSON.stringify({
      schema: 1,
      revision: 7,
      generated_at: 'x',
      error: { code: 'already-filed', message: 'spec item file: i-230488071aa6 already names a task: started' },
    });
    const write = fileItem(answering(`case-${cases++}`, json, 1), 'shop', 'i-230488071aa6', 'started', 1);
    await expect(write).rejects.toMatchObject({ code: 'already-filed' });
  });

  it('refuses an answer without its write', async () => {
    const json = changed('spec-item-add.json', (data) => {
      delete data.write;
    });
    await expect(addItem(answering(`case-${cases++}`, json), 'shop', 2, 'x', 1)).rejects.toBeInstanceOf(JigShapeError);
  });
});

/** A checkout whose Jig answers `knowledge proposed --json` with `proposed` and `knowledge sources --json` with `sources`. */
function knowing(name: string, proposed: string, sources: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  for (const [file, json] of [
    ['proposed.json', proposed],
    ['sources.json', sources],
  ]) {
    if (json!.endsWith('.json')) copyFileSync(fixture(json!), join(dir, file!));
    else writeFileSync(join(dir, file!), json!);
  }
  writeFileSync(
    join(dir, '.ai', 'scripts', 'jig'),
    `#!/usr/bin/env bash
case "$*" in
  "knowledge proposed --json") cat proposed.json ;;
  "knowledge sources --json") cat sources.json ;;
  *) exit 1 ;;
esac
`,
  );
  return dir;
}

// knowledge-*.json are what Jig 0.40.0 answered in a scratch project with a bare origin, at `agent.git: commit`; the
// checkout's path is replaced by one of no one's. Those named *-041, -read*, -drop, -not-on-*, -still-waits and
// -sources-dropped are Jig 0.41.0's, from a scratch project at `agent.git: push`.
/** What a record of Jig 0.40.0 reads for the fields Jig 0.41.0 added. */
const older = { decidable: null, reason: null, lossy: null };

describe('readKnowledge', () => {
  it('reads the proposals and the linked files that wait for a look, decisions waiting on the branch included', async () => {
    expect(await readKnowledge(knowing('knowledge', 'knowledge-proposed-waiting.json', 'knowledge-sources-waiting.json'))).toEqual({
      revision: 1793950171,
      proposals: [
        {
          id: 'feature-checkout',
          type: 'feature',
          domains: [],
          path: '.ai/knowledge/features/checkout.md',
          paths: ['src/checkout/**'],
          summary: 'How checkout takes a card payment',
          source: null,
          bytes: null,
          waiting: null,
          ...older,
        },
        {
          id: 'convention-coding-style',
          type: 'convention',
          domains: [],
          path: '.ai/knowledge/sources/coding-style.md',
          paths: [],
          summary: null,
          source: 'docs/style.md',
          bytes: 43,
          waiting: null,
          ...older,
        },
        {
          id: 'convention-ops',
          type: 'convention',
          domains: [],
          path: '.ai/knowledge/sources/ops.md',
          paths: [],
          summary: null,
          source: 'docs/ops.md',
          bytes: null,
          waiting: { decision: 'rejected', pr: null },
          ...older,
        },
      ],
      // A proposed stub's file shows with its proposal, an approved one whose file is as approved needs nobody.
      sources: [
        {
          id: 'convention-team-rules',
          state: 'changed',
          source: 'docs/rules.md',
          bytes: 106,
          waiting: { decision: 'reviewed', pr: null },
          ...older,
        },
      ],
      waiting: { branch: 'knowledge/decisions', base: 'main', pushed: false, pr: null },
    });
  });

  it("takes the lower of the two reads' revisions, and keeps each state that waits for a look", async () => {
    const sources = changed('knowledge-sources.json', (data) => {
      data.sources.push(
        { ...data.sources[1], id: 'a', state: 'unrecorded' },
        { ...data.sources[1], id: 'b', state: 'missing', bytes: null },
        { ...data.sources[1], id: 'c', state: 'ok' },
        { ...data.sources[1], id: 'd', state: 'rejected' },
      );
    }).replace('1793950123', '1793950200');
    const read = await readKnowledge(knowing(`case-${cases++}`, 'knowledge-proposed.json', sources));
    expect(read.revision).toBe(1793950123);
    expect(read.sources.map((s) => [s.id, s.state])).toEqual([
      ['convention-team-rules', 'changed'],
      ['a', 'unrecorded'],
      ['b', 'missing'],
    ]);
    expect(read.waiting).toBeNull();
  });

  it('reads whether a decision on each record would be judged on what the read shows (Jig 0.41.0)', async () => {
    const read = await readKnowledge(knowing(`case-${cases++}`, 'knowledge-proposed-041.json', 'knowledge-sources-041.json'));
    expect(read.proposals.map((p) => [p.id, p.decidable, p.reason, p.lossy, p.bytes])).toEqual([
      ['feature-checkout', true, null, false, null],
      ['feature-search', false, 'not-on-base', false, null],
      ['convention-coding-style', true, null, false, 19],
    ]);
    expect(read.sources).toEqual([
      {
        id: 'convention-deploy',
        state: 'missing',
        source: 'docs/deploy.md',
        bytes: null,
        waiting: null,
        decidable: true,
        reason: null,
        lossy: false,
      },
      {
        id: 'convention-legacy',
        state: 'unrecorded',
        source: 'docs/legacy.md',
        bytes: 20,
        waiting: null,
        decidable: true,
        reason: null,
        lossy: false,
      },
      {
        id: 'convention-team-rules',
        state: 'changed',
        source: 'docs/rules.md',
        bytes: 85,
        waiting: null,
        decidable: true,
        reason: null,
        lossy: false,
      },
    ]);
  });

  it('reads a dropped link as a rejection waiting on the branch', async () => {
    const read = await readKnowledge(knowing(`case-${cases++}`, 'knowledge-proposed-041.json', 'knowledge-sources-dropped.json'));
    expect(read.sources.map((s) => [s.id, s.waiting])).toEqual([
      ['convention-deploy', { decision: 'rejected', pr: null }],
      ['convention-legacy', { decision: 'reviewed', pr: null }],
      ['convention-team-rules', { decision: 'rejected', pr: null }],
    ]);
  });

  it.each([
    ['a proposal without its paths', 'proposed', (d: Record<string, any>) => delete d.proposals[0].paths],
    [
      'a decision Jig UI does not know',
      'proposed',
      (d: Record<string, any>) => (d.proposals[0].waiting = { decision: 'merged', pr: null }),
    ],
    ['a source without its size', 'sources', (d: Record<string, any>) => delete d.sources[0].bytes],
    ['a decidable that is no boolean', 'proposed', (d: Record<string, any>) => (d.proposals[0].decidable = 'yes')],
  ])('refuses %s', async (_, read, change) => {
    const proposed = read === 'proposed' ? changed('knowledge-proposed.json', change) : 'knowledge-proposed.json';
    const sources = read === 'sources' ? changed('knowledge-sources.json', change) : 'knowledge-sources.json';
    await expect(readKnowledge(knowing(`case-${cases++}`, proposed, sources))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('readSourceDiff', () => {
  it("reads a linked file's diff from its approved text as Jig prints it, quotes and tabs included", async () => {
    const dir = logging(`case-${cases++}`, 'knowledge-diff.json');
    expect(await readSourceDiff(dir, 'convention-team-rules')).toEqual({
      diff: '--- docs/rules.md (approved)\n+++ docs/rules.md\n@@ -1,4 +1,5 @@\n # Team rules\n \n - Review every change.\n-- Ship on green.\n+- Ship on green, after CI on Windows too.\n+- "Quotes" and a tab\there.\n',
      lossy: false,
    });
    expect(args(dir)).toEqual(['knowledge', 'sources', '--diff', 'convention-team-rules', '--json']);
  });

  it('reads no diff where no approved text is kept', async () => {
    expect(await readSourceDiff(answering(`case-${cases++}`, 'knowledge-diff-unrecorded.json'), 'convention-coding-style')).toEqual({
      diff: null,
      lossy: false,
    });
  });

  it('carries a document that links no file as not-found', async () => {
    await expect(readSourceDiff(answering(`case-${cases++}`, 'knowledge-diff-no-source.json', 1), 'feature-checkout')).rejects.toEqual(
      refusal('not-found'),
    );
  });
});

describe('readKnowledgeText', () => {
  it("reads a document's whole file, frontmatter included, and no linked file for one that links none", async () => {
    const dir = logging(`case-${cases++}`, 'knowledge-read.json');
    const read = await readKnowledgeText(dir, 'feature-checkout');
    expect(read.content).toMatch(/^---\nid: feature-checkout\n[^]*\n---\n# <Feature name>\n[^]*How checkout takes a card payment\.\n$/);
    expect(read).toMatchObject({ lossy: false, source: null });
    expect(args(dir)).toEqual(['knowledge', 'read', 'feature-checkout', '--json']);
  });

  it('reads the file a stub links as it is now', async () => {
    const read = await readKnowledgeText(answering(`case-${cases++}`, 'knowledge-read-stub.json'), 'convention-coding-style');
    expect(read.content).toContain('source: docs/style.md\n---\n');
    expect(read.source).toEqual({ content: '# Style\n\nUse tabs.\n', lossy: false });
  });

  it("reads no linked file for a stub whose file is gone, and says where a file's bytes were dropped", async () => {
    expect(
      (await readKnowledgeText(answering(`case-${cases++}`, 'knowledge-read-stub-missing.json'), 'convention-deploy')).source,
    ).toBeNull();
    expect((await readKnowledgeText(answering(`case-${cases++}`, 'knowledge-read-lossy.json'), 'convention-coding-style')).source).toEqual({
      content: '# Style\n\nUse tabs  here.\n',
      lossy: true,
    });
  });

  it('carries an id no document has as not-found', async () => {
    await expect(readKnowledgeText(answering(`case-${cases++}`, 'knowledge-read-not-found.json', 1), 'nobody')).rejects.toMatchObject({
      code: 'not-found',
      reasons: ['no document with id: nobody'],
    });
  });

  it('refuses a text without its content', async () => {
    const json = changed('knowledge-read.json', (data) => {
      delete data.content;
    });
    await expect(readKnowledgeText(answering(`case-${cases++}`, json), 'x')).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('decideKnowledge', () => {
  it("drops an approved stub's link with reject (Jig 0.41.0)", async () => {
    const dir = logging(`case-${cases++}`, 'knowledge-drop.json');
    expect(await decideKnowledge(dir, [{ doc: 'convention-team-rules', decision: 'reject' }], 1794230818, '0.41.0')).toBe(
      'agent.git is push: the pull request is yours',
    );
    expect(args(dir)).toEqual(['knowledge', 'reject', 'convention-team-rules', '--revision', '1794230818', '--json']);
  });

  it.each([
    ['accept', 'knowledge-accept.json'],
    ['reject', 'knowledge-reject.json'],
    ['reviewed', 'knowledge-reviewed.json'],
  ] as const)("runs %s on one document against the revision it was read at and answers Jig's note", async (decision, json) => {
    const dir = logging(`case-${cases++}`, json);
    expect(await decideKnowledge(dir, [{ doc: 'feature-checkout', decision }], 1793950153, '0.43.0')).toBe(
      'agent.git is commit: pushing knowledge/decisions is yours',
    );
    expect(args(dir)).toEqual(['knowledge', decision, 'feature-checkout', '--revision', '1793950153', '--json']);
  });

  it.each([
    ['knowledge-stale.json', 'stale-revision', 'accept', ['the clone changed since revision 1; read again and retry']],
    ['knowledge-not-proposed.json', 'not-proposed', 'reject', ['not a proposed document: convention-team-rules (status: active)']],
    ['knowledge-not-found.json', 'not-found', 'accept', ['no document with id: convention-ops']],
    [
      'knowledge-source-missing.json',
      'source-missing',
      'accept',
      ['convention-ops links docs/ops.md, which is missing, invalid or not tracked by git with this exact case; fix the link or reject it'],
    ],
    [
      'knowledge-git-not-allowed.json',
      'git-not-allowed',
      'reject',
      [
        'agent.git is none in this clone, so Jig commits nothing; set it with `jig config set --local agent.git commit` (or higher), or make the change in an agent session',
      ],
    ],
    [
      'knowledge-checked-out.json',
      'branch-checked-out',
      'reject',
      [
        'knowledge/decisions is checked out in … and Jig never moves a checkout; finish the work there, or switch that checkout to another branch, then try again',
      ],
    ],
    [
      'knowledge-not-on-base.json',
      'not-on-base',
      'accept',
      [
        'feature-search, as this checkout has it, is not on main as origin/main has it, and the decision is judged there; commit and push it, then decide',
      ],
    ],
    [
      'knowledge-not-on-branch.json',
      'not-on-branch',
      'accept',
      [
        'feature-search, as this checkout has it, reached main after knowledge/decisions was cut, and the decision is judged on that branch; decide it once the decisions waiting there have landed',
      ],
    ],
    [
      'knowledge-still-waits.json',
      'write-still-waits',
      'accept',
      [
        'knowledge/decisions has 1 edit(s) that never reached origin, above edits origin no longer has; Jig neither sends them out with those nor leaves them where nobody sees them wait. Move them to a branch of your own (git branch -m knowledge/decisions <name>), then try again',
      ],
    ],
  ] as const)(
    "carries the refusal in %s as %s of %s, Jig's reason without its command's name or a path",
    async (json, code, decision, reasons) => {
      const dir = answering(`case-${cases++}`, json, 1);
      await expect(decideKnowledge(dir, [{ doc: 'convention-ops', decision }], 1, '0.43.0')).rejects.toMatchObject({
        code,
        reasons,
      });
    },
  );

  it("answers Jig's note whole when the pull request was refused, naming the account it asked as (Jig 0.45.0)", async () => {
    // The note Jig's own-tree write gives for a failed `gh pr create`: gh's output, then `jig_gh_asked_as`.
    const note = [
      'knowledge accept: gh pr create failed:',
      'pull request create failed: GraphQL: must be a collaborator (createPullRequest)',
      'It asked GitHub as octo-me (github.account).',
    ].join('\n');
    const json = changed('knowledge-accept.json', (data) => {
      data.write.note = note;
    });
    expect(await decideKnowledge(answering(`case-${cases++}`, json), [{ doc: 'feature-checkout', decision: 'accept' }], 1, '0.45.0')).toBe(
      note,
    );
  });

  it('refuses an answer without its write', async () => {
    const json = changed('knowledge-accept.json', (data) => {
      delete data.write;
    });
    await expect(
      decideKnowledge(answering(`case-${cases++}`, json), [{ doc: 'x', decision: 'accept' }], 1, '0.43.0'),
    ).rejects.toBeInstanceOf(JigShapeError);
  });

  // Jig 0.45.0 in a scratch project: three documents, one of each kind, in one write.
  it('decides several documents of any kinds in one `jig knowledge decide` from Jig 0.44.0, each with the flag of its decision', async () => {
    const dir = logging(`case-${cases++}`, 'knowledge-decide.json');
    const decisions = [
      { doc: 'adr-20261114-alpha', decision: 'accept' },
      { doc: 'adr-20261114-beta', decision: 'reject' },
      { doc: 'adr-use-postgres', decision: 'reviewed' },
    ] as const;
    expect(await decideKnowledge(dir, [...decisions], 1794637520, '0.44.0')).toBe(
      'agent.git is commit: pushing knowledge/decisions is yours',
    );
    expect(args(dir)).toEqual([
      'knowledge',
      'decide',
      '--accept',
      'adr-20261114-alpha',
      '--reject',
      'adr-20261114-beta',
      '--reviewed',
      'adr-use-postgres',
      '--revision',
      '1794637520',
      '--json',
    ]);
  });

  it('carries the refusal of a decide whole, its line naming the document Jig stopped at', async () => {
    const dir = answering(`case-${cases++}`, 'knowledge-decide-not-proposed.json', 1);
    const decisions = [
      { doc: 'adr-20261114-gamma', decision: 'accept' },
      { doc: 'adr-20261114-alpha', decision: 'accept' },
    ] as const;
    await expect(decideKnowledge(dir, [...decisions], 1794637528, '0.45.0')).rejects.toMatchObject({
      code: 'not-proposed',
      reasons: ['not a proposed document: adr-20261114-alpha (status: accepted)'],
      doc: 'adr-20261114-alpha',
    });
  });

  it.each([
    ['none at all', [], '0.45.0'],
    [
      'more than one below Jig 0.44.0',
      [
        { doc: 'a', decision: 'accept' },
        { doc: 'b', decision: 'reject' },
      ],
      '0.43.0',
    ],
  ] as const)('refuses %s as usage without running Jig', async (_, decisions, version) => {
    const dir = logging(`case-${cases++}`, 'knowledge-decide.json');
    await expect(decideKnowledge(dir, [...decisions], 1, version)).rejects.toMatchObject({ code: 'usage' });
    expect(existsSync(join(dir, 'args.log'))).toBe(false);
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

// task-pause*.json and task-list-pause.json are what Jig 0.45.0 printed in a scratch repository, its worktree's path
// renamed: a task nobody started (later-idea), one started (other-work), one started with a pause asked (busy-task) and
// one paused (parked-idea).
describe('pausing a task at once', () => {
  it('pauses it against the revision it was read at, named by its bare id', async () => {
    const dir = logging(`case-${cases++}`, 'task-pause.json');
    await pauseTask(dir, 'parked-idea', 1794587926);
    expect(args(dir)).toEqual(['task', 'pause', 'parked-idea', '--revision', '1794587926', '--json']);
  });

  it.each([
    ['task-pause-already.json', 'already-paused'],
    ['task-pause-stale.json', 'stale-revision'],
  ])('carries the refusal in %s as %s', async (json, code) => {
    await expect(pauseTask(answering(`case-${cases++}`, json, 1), 'parked-idea', 1)).rejects.toEqual(refusal(code));
  });

  it('reads which tasks Jig pauses at once and which it takes a request for', async () => {
    const { tasks } = await readTasks(answering(`case-${cases++}`, 'task-list-pause.json'));
    const offered = (id: string) =>
      Object.fromEntries(
        tasks
          .find((t) => t.id === id)!
          .actions.filter((a) => a.id.includes('pause'))
          .map((a) => [a.id, a.offered]),
      );
    expect(offered('later-idea')).toMatchObject({ pause: true, 'request-pause': false });
    expect(offered('other-work')).toMatchObject({ pause: true, 'request-pause': true });
    expect(offered('busy-task')).toMatchObject({ pause: true, 'request-pause': false });
    expect(offered('parked-idea')).toMatchObject({ pause: false, 'request-pause': false });
    expect(tasks.find((t) => t.id === 'later-idea')!.branch).toBeNull();
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

// task-set-close*.json are what Jig 0.40.0 printed in a scratch repository.
describe('closeTask', () => {
  it('has Jig 0.40.0 check the close against the revision it was read at', async () => {
    const dir = logging(`case-${cases++}`, 'task-set-close.json');
    await closeTask(dir, 'beta', 1793894295, '0.40.0');
    expect(args(dir)).toEqual(['task', 'set', 'beta', 'status', 'consolidated', '--revision', '1793894295', '--json']);
  });

  it.each([
    ['task-set-close-stale.json', 'stale-revision'],
    ['task-set-close-not-found.json', 'not-found'],
  ])('carries the refusal in %s as %s', async (json, code) => {
    await expect(closeTask(answering(`case-${cases++}`, json, 1), 'beta', 1, '0.40.0')).rejects.toEqual(refusal(code));
  });

  it("carries Jig's reason a task is not closable, as its own command says it", async () => {
    await expect(closeTask(answering(`case-${cases++}`, 'task-set-close-not-closable.json', 1), 'e1', 1, '0.40.0')).rejects.toMatchObject({
      code: 'not-closable',
      reasons: [
        'status consolidated requires knowledge_consolidated true; record the knowledge decision first: jig task set e1 knowledge_consolidated true',
      ],
    });
  });

  it("reads an older Jig's revision first, then runs the command of Jig's close action", async () => {
    const dir = closing(`case-${cases++}`, 41);
    await closeTask(dir, 'beta', 41, '0.39.0');
    expect(closeCalls(dir)).toEqual(['queue list --json', 'task set beta status consolidated']);
  });

  it('refuses a revision the clone has moved past, running nothing', async () => {
    const dir = closing(`case-${cases++}`, 42);
    await expect(closeTask(dir, 'beta', 41, '0.39.0')).rejects.toEqual(refusal('stale-revision'));
    expect(closeCalls(dir)).toEqual(['queue list --json']);
  });

  it("carries Jig's refusal as its reasons, without a path", async () => {
    const err = [
      'jig: error: task set: status consolidated requires knowledge_consolidated true; record the knowledge decision first: jig task set beta knowledge_consolidated true',
      'jig: error: task set: cannot write /Users/me/project/.ai/workspace/tasks/beta/state',
      'a line that is not an error',
    ].join('\n');
    const dir = closing(`case-${cases++}`, 41, err, 1);
    await expect(closeTask(dir, 'beta', 41, '0.39.0')).rejects.toMatchObject({
      code: 'failed',
      reasons: [
        'status consolidated requires knowledge_consolidated true; record the knowledge decision first: jig task set beta knowledge_consolidated true',
        'cannot write …',
      ],
    });
  });
});

// config-*.json are what Jig 0.40.0 printed in a scratch repository, with a Telegram token in its local file.
describe('settings', () => {
  it("reads every key with its value, where it comes from, who answers it and Jig's description", async () => {
    const { revision, keys } = await readSettings(answering(`case-${cases++}`, 'config-keys.json'));
    expect(revision).toBe(1793894345);
    expect(keys).toHaveLength(43);
    expect(keys.find((k) => k.key === 'agent.git')).toEqual({
      key: 'agent.git',
      value: 'pr',
      set: true,
      source: 'local',
      scope: 'local only',
      kind: 'choice',
      allowed: ['none', 'commit', 'push', 'pr', 'merge'],
      default: 'none',
      description: expect.any(String),
      secret: false,
    });
    expect(keys.find((k) => k.key === 'forge')).toMatchObject({ source: 'project', scope: 'project', value: 'auto' });
    expect(keys.find((k) => k.key === 'notify.telegram.token')).toMatchObject({ value: null, set: true, secret: true });
  });

  it('reads a kind it does not know as text, and cuts every absolute path out of a value, its default and its description', async () => {
    const json = changed('config-keys.json', (data) => {
      Object.assign(data.keys[0], {
        kind: 'colour',
        value: '/Users/me/trees',
        default: '/Users/me/x',
        description: 'Kept in /Users/me/y.',
      });
    });
    const [first] = (await readSettings(answering(`case-${cases++}`, json))).keys;
    expect(first).toMatchObject({ kind: 'text', value: '…', default: '…', description: 'Kept in …' });
  });

  it("never passes a secret's value on, should Jig print one", async () => {
    const json = changed('config-keys.json', (data) => {
      Object.assign(
        data.keys.find((k: { secret: boolean }) => k.secret),
        { value: '123:abc', default: '456:def' },
      );
    });
    const { keys } = await readSettings(answering(`case-${cases++}`, json));
    expect(keys.find((k) => k.secret)).toMatchObject({ value: null, default: null, set: true });
  });

  it('refuses a scope it does not know', async () => {
    const json = changed('config-keys.json', (data) => {
      data.keys[0].scope = 'machine';
    });
    await expect(readSettings(answering(`case-${cases++}`, json))).rejects.toBeInstanceOf(JigShapeError);
  });

  it("sets one of the person's own keys in this clone against the revision it was read at", async () => {
    const dir = logging(`case-${cases++}`, 'config-set.json');
    await setSetting(dir, 'agent.git', 'pr', 1793894327);
    expect(args(dir)).toEqual(['config', 'set', 'agent.git', 'pr', '--local', '--revision', '1793894327', '--json']);
  });

  it('takes one out of the local file', async () => {
    const dir = logging(`case-${cases++}`, 'config-unset.json');
    await unsetSetting(dir, 'notify.telegram.token', 1793894337);
    expect(args(dir)).toEqual(['config', 'unset', 'notify.telegram.token', '--local', '--revision', '1793894337', '--json']);
  });

  it.each([
    ['config-set-unknown-key.json', 'unknown-key'],
    ['config-set-not-local.json', 'not-local'],
    ['config-set-secret-key.json', 'secret-key'],
    ['config-stale.json', 'stale-revision'],
  ])('carries the refusal in %s as %s', async (json, code) => {
    await expect(setSetting(answering(`case-${cases++}`, json, 1), 'k.k', 'v', 1)).rejects.toEqual(refusal(code));
  });

  it("carries Jig's reason a value is refused, without its command's name", async () => {
    await expect(
      setSetting(answering(`case-${cases++}`, 'config-set-invalid-value.json', 1), 'agent.git', 'sometimes', 1),
    ).rejects.toMatchObject({
      code: 'invalid-value',
      reasons: ["agent.git: invalid value 'sometimes': not a level: none, commit, push, pr or merge"],
    });
  });
});

// The refresh-*.json fixtures are what Jig 0.45.0 printed in a scratch repository with a local bare origin, one per way
// the base went, the worktree's path renamed.
describe('refresh', () => {
  it.each([
    ['refresh-fast-forwarded.json', 'done', 'fast-forwarded'],
    ['refresh-up-to-date.json', 'done', 'up-to-date'],
    ['refresh-blocked.json', 'done', 'blocked-by-changes'],
    ['refresh-diverged.json', 'done', 'diverged'],
    ['refresh-elsewhere.json', 'done', 'checked-out-elsewhere'],
    ['refresh-failed.json', 'failed', 'checked-out-elsewhere'],
  ])('reads %s', async (name, fetched, outcome) => {
    const read = await refresh(answering(`refresh-${cases++}`, name));
    expect(read.fetch).toBe(fetched);
    expect(read.base.outcome).toBe(outcome);
    expect(read.writes).toEqual([]);
  });

  it("answers neither git's messages nor a worktree's path", async () => {
    const read = await refresh(answering(`refresh-${cases++}`, 'refresh-elsewhere.json'));
    expect(read).toEqual({
      fetch: 'done',
      fetchedAt: '2026-11-13T08:40:59Z',
      base: {
        name: 'main',
        outcome: 'checked-out-elsewhere',
        from: '6c9d5513bc3e76e50c49d8de6af5cf1e8eeecacf',
        to: '6c9d5513bc3e76e50c49d8de6af5cf1e8eeecacf',
      },
      writes: [],
    });
    expect(JSON.stringify(await refresh(answering(`refresh-${cases++}`, 'refresh-failed.json')))).not.toMatch(/fatal|\/Users/);
  });

  it('reads the writes it closed', async () => {
    const answer = changed(
      'refresh-up-to-date.json',
      (d) => (d.writes = [{ target: 'knowledge', branch: 'knowledge/decisions', reason: 'merged' }]),
    );
    expect((await refresh(answering(`refresh-${cases++}`, answer))).writes).toEqual([
      { target: 'knowledge', branch: 'knowledge/decisions', reason: 'merged' },
    ]);
  });

  it.each([
    ['a base outcome Jig UI does not know', (d: Record<string, any>) => (d.base.outcome = 'rebased')],
    ['a fetch without its outcome', (d: Record<string, any>) => delete d.fetch.outcome],
    [
      'a write closed for a reason Jig UI does not know',
      (d: Record<string, any>) => (d.writes = [{ target: 'knowledge', branch: 'b', reason: 'gone' }]),
    ],
  ])('refuses %s', async (_, change) => {
    await expect(refresh(answering(`case-${cases++}`, changed('refresh-up-to-date.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('housekeeping', () => {
  it("runs jig housekeeping as text and answers its report a line each, grouping kept, the trash's path cut", async () => {
    const dir = selfUpdating(`case-${cases++}`, readFileSync(fixture('housekeeping.txt'), 'utf8'));
    const report = await housekeeping(dir);
    expect(args(dir)).toEqual(['housekeeping']);
    expect(report[0]).toBe('needs you (1):');
    expect(report[2]).toBe('removed (2): moved to …, recoverable for 7 days');
    expect(report[8]).toBe('    knowledge-drop-and-text-findings, quiet-design-findings, roadmap-from-page-findings,');
    expect(report).toHaveLength(15);
    expect(report.join('\n')).not.toMatch(/\.ai\//);
  });

  it('answers the report of a run that ended 3, a task left to consolidate, as a finished one', async () => {
    const dir = selfUpdating(`case-${cases++}`, readFileSync(fixture('housekeeping.txt'), 'utf8'), '', 3);
    const report = await housekeeping(dir);
    expect(report[0]).toBe('needs you (1):');
    expect(report.at(-1)).toBe('action needed: consolidate the tasks flagged needs-consolidation');
  });

  it("puts Jig's warnings first, paths cut, where the report points up at them", async () => {
    const err = 'housekeeping: old-task was not archived: no state in /Users/me/shop/.ai/workspace/tasks/old-task\n';
    const out = 'action needed: a task could not be archived; the reason is above\n';
    expect(await housekeeping(selfUpdating(`case-${cases++}`, out, err, 3))).toEqual([
      'housekeeping: old-task was not archived: no state in …',
      'action needed: a task could not be archived; the reason is above',
    ]);
  });

  it('cuts an absolute path out of the report', async () => {
    const dir = selfUpdating(`case-${cases++}`, 'removed (1): moved to /Users/me/shop/.ai/runtime/trash/x/, recoverable\n');
    expect(await housekeeping(dir)).toEqual(['removed (1): moved to … recoverable']);
  });

  it('cuts the trash day it deletes, a path under .ai/runtime', async () => {
    const dir = selfUpdating(`case-${cases++}`, 'delete trash/2026-11-01 (9 days old)\n');
    expect(await housekeeping(dir)).toEqual(['delete … (9 days old)']);
  });

  it("answers Jig's skipping line when another run holds the clone", async () => {
    const dir = selfUpdating(`case-${cases++}`, 'another housekeeping run holds this clone; skipping\n');
    expect(await housekeeping(dir)).toEqual(['another housekeeping run holds this clone; skipping']);
  });

  it('refuses as failed with the reasons of jig: error lines, without the housekeeping prefix and without a path', async () => {
    const err = [
      'noise',
      'jig: error: housekeeping: housekeeping.trash_ttl: not a duration',
      'jig: error: no .ai/config.yaml in /Users/me/shop',
    ].join('\n');
    const refused = await housekeeping(selfUpdating(`case-${cases++}`, '', err, 1)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(JigRefusal);
    expect((refused as JigRefusal).code).toBe('failed');
    expect((refused as JigRefusal).reasons).toEqual(['housekeeping.trash_ttl: not a duration', 'no … in …']);
  });

  it('is timeout when Jig does not answer within the limit', async () => {
    const slow = selfUpdating(`case-${cases++}`, '');
    writeFileSync(join(slow, '.ai', 'scripts', 'jig'), '#!/usr/bin/env bash\nsleep 5\n');
    await expect(housekeeping(slow, process.platform, 200)).rejects.toEqual(refusal('timeout'));
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
    ['npm ci --cache=/Users/me/.npm', 'npm ci --cache=…'],
    ['PATH=/opt/bin:$PATH make', 'PATH=… make'],
    ['dirs: /a/b:/c/d', 'dirs: …'],
    ['file:///Users/me/x', 'file:…'],
    ['[/Users/me/cache, /Users/me/x]', '[… …'],
    ['npm ci >/Users/me/ci.log', 'npm ci >…'],
    ['a;/x b,/y c|/z d&/w', 'a;… b,… c|… d&…'],
    ['src/**/*.ts, ./a/b, ../c, ~/d, 1/2', 'src/**/*.ts, ./a/b, ../c, ~/d, 1/2'],
    ['make CPPFLAGS=-I/Users/me/include', 'make CPPFLAGS=-I…'],
    ['docker run -v/Users/me/p:/app img', 'docker run -v… img'],
    ['task-x/a-b/c', 'task-x/a-b/c'],
    ['make CFLAGS="-I/Users/me/include" \'-L/Users/me/lib\'', 'make CFLAGS="-I…" \'-L…\''],
    ['[-I/Users/me/a, -L/Users/me/b]', '[-I… -L…'],
    ['cc -Wl,-L/Users/me/lib -Isrc/x pre-x/y', 'cc -Wl,-L… -Isrc… pre-x/y'],
    ['cc -isystem/Users/me/inc; tar -xzf/Users/me/a.tgz', 'cc -isystem… tar -xzf…'],
    ['npm ci --cache=${NPM_CACHE:-/Users/me/.npm}; cmd -/Users/me/x', 'npm ci --cache=${NPM_CACHE:-… cmd -…'],
    ['https://gitlab.com/group/-/merge_requests', 'https://gitlab.com/group/-/merge_requests'],
    ['[A-Z]+\\.[0-9]+', '[A-Z]+\\.[0-9]+'],
    ['cp $(git rev-parse --show-toplevel)/.env .', 'cp $(git rev-parse --show-toplevel)/.env .'],
    ['the roadmap names <spec-id>/<n>', 'the roadmap names <spec-id>/<n>'],
    ['pass -f/--force, use -h/--help', 'pass -f/--force, use -h/--help'],
    ['npm ci 2>/Users/me/err.log; cc -IC:\\x', 'npm ci 2>… cc -I…'],
    [
      'branch task/up-x, `git stash`, .gitattributes, https://example.com/a',
      'branch task/up-x, `git stash`, .gitattributes, https://example.com/a',
    ],
  ])('%s', (text, expected) => {
    expect(withoutPaths(text)).toBe(expected);
  });

  it('stays linear on a long run of word characters', () => {
    const start = performance.now();
    withoutPaths('a-'.repeat(50_000));
    expect(performance.now() - start).toBeLessThan(1000);
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
