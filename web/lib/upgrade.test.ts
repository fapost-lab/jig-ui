import { describe, expect, it } from 'vitest';
import type { Attention, Machine, Project } from '../api';
import {
  agentRequest,
  machineBusy,
  machineLine,
  needsUpgrade,
  releaseOf,
  upgradeAllPlan,
  upgradeLine,
  upgradeMark,
  upgradeOf,
  upgradeResult,
  type UpgradeRun,
} from './upgrade';

const item = (kind: string, versions: Attention['versions'] = null): Attention => ({
  kind,
  subject: { type: 'project', id: null },
  tasks: [],
  title: 't',
  detail: null,
  todo: 'jig upgrade',
  url: null,
  versions,
});

const ready = (id: string, attention: Attention[] = []): Project => ({
  id,
  state: 'ready',
  jigVersion: '0.34.0',
  counts: { active: 0, paused: 0, ready: 0 },
  attention,
  housekeepingStale: false,
  upgrade: null,
});

const behind = ready('behind', [item('gate-waiting'), item('upgrade-available', { from: '0.34.0', to: '0.35.0' })]);
const current = ready('current', [item('release-available')]);
const old: Project = { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0', upgrade: null };

describe('upgradeOf', () => {
  it("reads both versions from Jig's upgrade item", () => {
    expect(upgradeOf(behind)).toEqual({ from: '0.34.0', to: '0.35.0' });
  });

  it('finds none without the item, or where the project cannot be read', () => {
    expect(upgradeOf(current)).toBeUndefined();
    expect(upgradeOf(old)).toBeUndefined();
  });
});

describe('upgradeMark', () => {
  it("marks a project behind with its Jig and the machine's", () => {
    expect(upgradeMark(behind)).toBe('0.34.0 → 0.35.0 on this machine');
  });

  it('marks none that is not behind, or cannot be read', () => {
    expect(upgradeMark(current)).toBeUndefined();
    expect(upgradeMark(old)).toBeUndefined();
  });
});

describe('upgradeLine', () => {
  const behindToo = ready('behind-too', [item('upgrade-available', { from: '0.31.0', to: '0.35.0' })]);

  it.each([
    ['nothing when no project is behind', [current, old], undefined],
    ['one project', [behind, current], '1 project runs an older Jig than this machine: run jig upgrade in it.'],
    [
      'several, not one that cannot be read',
      [behind, behindToo, old],
      '2 projects run an older Jig than this machine: run jig upgrade in each.',
    ],
  ])('says %s', (_, projects, line) => {
    expect(upgradeLine(projects)).toBe(line);
  });
});

type Done = Extract<UpgradeRun, { state: 'done' }>;
const git = {
  level: 'pr',
  branch: 'jig/upgrade-0.35.0',
  commit: 'abc',
  pushed: true,
  pullRequest: 'https://github.com/o/r/pull/3',
  merged: false,
};
const done = (outcome: string, more: Partial<Done['upgrade']> = {}): Done => ({
  state: 'done',
  at: '2026-10-27T08:00:00Z',
  upgrade: { mode: 'copy', from: '0.34.0', to: '0.35.0', outcome, git: null, manualSteps: [], wouldStop: [], ...more },
});

describe('upgradeResult', () => {
  it.each([
    ['merged', done('upgraded', { git: { ...git, merged: true } }), 'Upgraded to 0.35.0 and merged.', 'good', git.pullRequest],
    [
      'with a pull request',
      done('upgraded', { git }),
      'Upgraded to 0.35.0 on branch jig/upgrade-0.35.0: its pull request waits for review.',
      'attention',
      git.pullRequest,
    ],
    [
      'pushed',
      done('upgraded', { git: { ...git, pullRequest: null } }),
      'Upgraded to 0.35.0 and pushed branch jig/upgrade-0.35.0; open a pull request from it.',
      'attention',
      null,
    ],
    [
      'committed on one branch',
      done('upgraded', { git: { ...git, branch: null, pushed: false, pullRequest: null } }),
      "Upgraded to 0.35.0, committed on the project's branch in the project; push it when you are ready.",
      'attention',
      null,
    ],
    [
      'staged',
      done('staged', { git: { ...git, commit: null, pushed: false, pullRequest: null } }),
      "Staged the upgrade to 0.35.0 on branch jig/upgrade-0.35.0, and the project's main checkout is left on it. Commit it there: git commit -F .ai/runtime/upgrade/message",
      'attention',
      null,
    ],
    ['with nothing to do', done('nothing-to-do'), 'Nothing to upgrade: the project already has 0.35.0.', 'quiet', null],
    [
      'incomplete',
      done('incomplete'),
      "Jig's check after placing the files failed, so nothing was committed. Run the upgrade again.",
      'bad',
      null,
    ],
    ['linked', done('linked'), "Linked to Jig's source; nothing to commit.", 'good', null],
    ['an outcome this page does not know', done('brand-new'), 'Jig ended the upgrade: brand-new.', 'quiet', null],
  ] as const)('says what an upgrade %s came to', (_, run, text, tone, url) => {
    expect(upgradeResult(run)).toMatchObject({ text, tone, url });
  });

  it('carries the steps the release asks for by hand', () => {
    expect(upgradeResult(done('upgraded', { git, manualSteps: ['Restart your agent.'] })).steps).toEqual(['Restart your agent.']);
  });

  it("gives Jig's reasons for not starting, and says where to look when it failed", () => {
    const blocked = upgradeResult({ state: 'refused', at: 'x', code: 'upgrade-blocked', reasons: ['uncommitted changes'] });
    expect(blocked).toMatchObject({
      text: 'Jig did not start the upgrade; nothing changed:',
      tone: 'attention',
      reasons: ['uncommitted changes'],
    });
    expect(upgradeResult({ state: 'refused', at: 'x', code: 'failed', reasons: [] })).toMatchObject({ tone: 'bad', reasons: [] });
  });
});

describe('agentRequest', () => {
  it('names the project', () => {
    expect(agentRequest('shop')).toBe('Upgrade Jig in shop');
  });
});

describe('releaseOf and needsUpgrade', () => {
  const released = ready('released', [{ ...item('release-available'), title: 'jig v0.38.0 is out' }]);

  it("reads Jig's line that a newer release is out", () => {
    expect(releaseOf(released)).toBe('jig v0.38.0 is out');
    expect(releaseOf(behind)).toBeUndefined();
    expect(releaseOf(old)).toBeUndefined();
  });

  it('needs an upgrade behind the machine or behind a release, not where it cannot be read', () => {
    expect(needsUpgrade(behind)).toBe(true);
    expect(needsUpgrade(released)).toBe(true);
    expect(needsUpgrade(ready('fresh'))).toBe(false);
    expect(needsUpgrade(old)).toBe(false);
  });

  it('counts a project older than the newest release another project names, whatever it says itself', () => {
    const deaf = ready('deaf');
    expect(releaseOf(deaf, '0.38.0')).toBe('jig v0.38.0 is out');
    expect(releaseOf(deaf, '0.34.0')).toBeUndefined();
    expect(releaseOf(deaf)).toBeUndefined();
    expect(needsUpgrade(deaf, '0.34.1')).toBe(true);
    expect(upgradeAllPlan([deaf, old], '0.38.0')).toEqual({ selfUpdate: true, projects: ['deaf'] });
  });

  it('plans Upgrade all: a self-update only when a release is out, and every project with an upgrade', () => {
    expect(upgradeAllPlan([behind, ready('fresh'), old])).toEqual({ selfUpdate: false, projects: ['behind'] });
    expect(upgradeAllPlan([behind, released])).toEqual({ selfUpdate: true, projects: ['behind', 'released'] });
  });
});

describe('machineLine', () => {
  const at = '2026-10-29T10:00:00Z';
  const m = (machine: Partial<Machine>): Machine => ({ release: null, selfUpdate: null, upgradeAll: null, ...machine });

  it('says nothing when nothing ran', () => {
    expect(machineLine(m({}))).toBeUndefined();
    expect(machineLine(undefined)).toBeUndefined();
    expect(machineBusy(m({}))).toBe(false);
  });

  it('follows Upgrade all through the self-update and each project', () => {
    const updating = m({
      selfUpdate: { state: 'running', since: at },
      upgradeAll: { state: 'running', since: at, current: null, upgraded: [] },
    });
    expect(machineLine(updating)?.text).toBe('Upgrade all: updating Jig on this machine…');
    expect(machineBusy(updating)).toBe(true);
    const second = m({ upgradeAll: { state: 'running', since: at, current: 'b', upgraded: ['a'] } });
    expect(machineLine(second)).toEqual({ text: 'Upgrade all: upgrading b… (done: a)', tone: 'quiet', reasons: [], ended: false });
  });

  it('says what Upgrade all came to, and why it stopped', () => {
    const done = m({ upgradeAll: { state: 'done', at, upgraded: ['a', 'b'], skipped: ['c'], failed: null } });
    expect(machineLine(done)?.text).toBe('Upgrade all ran the upgrade in a, b; left c alone. Each card says what its upgrade came to.');
    expect(machineLine(done)?.ended).toBe(true);
    const stopped = m({ upgradeAll: { state: 'done', at, upgraded: [], skipped: [], failed: ['cannot reach the remote'] } });
    expect(machineLine(stopped)).toEqual({
      text: 'Upgrade all stopped: Jig could not update itself on this machine.',
      tone: 'bad',
      reasons: ['cannot reach the remote'],
      ended: true,
    });
  });

  it('shows a self-update started from a card, over what an earlier Upgrade all came to', () => {
    expect(machineLine(m({ selfUpdate: { state: 'running', since: at } }))?.text).toBe('Updating Jig on this machine…');
    const after = m({
      selfUpdate: { state: 'running', since: at },
      upgradeAll: { state: 'done', at, upgraded: ['a'], skipped: [], failed: null },
    });
    expect(machineLine(after)).toMatchObject({ text: 'Updating Jig on this machine…', ended: false });
  });
});

describe('upgradeResult, a run Jig could not finish', () => {
  it('says what Jig said when it said why, and sends the person to the terminal when it did not', () => {
    const at = '2026-10-29T10:00:00Z';
    const said = upgradeResult({ state: 'refused', at, code: 'failed', reasons: ['pass --from <dir>'] });
    expect(said).toMatchObject({ tone: 'bad', reasons: ['pass --from <dir>'] });
    expect(said.text).toMatch(/Jig said:$/);
    expect(upgradeResult({ state: 'refused', at, code: 'failed', reasons: [] }).text).toMatch(/run jig upgrade in the project/);
  });
});
