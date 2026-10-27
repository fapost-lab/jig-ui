import { describe, expect, it } from 'vitest';
import type { Attention, Project } from '../api';
import { agentRequest, upgradeLine, upgradeOf, upgradeResult, type UpgradeRun } from './upgrade';

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
