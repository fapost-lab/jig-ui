import { describe, expect, it } from 'vitest';
import type { Attention, Project } from '../api';
import { upgradeLine, upgradeOf } from './upgrade';

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
});

const behind = ready('behind', [item('gate-waiting'), item('upgrade-available', { from: '0.34.0', to: '0.35.0' })]);
const current = ready('current', [item('release-available')]);
const old: Project = { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.31.0' };

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
