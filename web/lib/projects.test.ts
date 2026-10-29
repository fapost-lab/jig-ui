import { describe, expect, it } from 'vitest';
import type { Attention, Project } from '../api';
import { chosen, matching } from './projects';

const item: Attention = {
  kind: 'gate-waiting',
  subject: { type: 'task', id: 'a' },
  tasks: ['a'],
  title: 't',
  detail: null,
  todo: 'approve',
  url: null,
  versions: null,
};

const ready = (id: string, attention: Attention[] = []): Project => ({
  id,
  state: 'ready',
  jigVersion: '0.37.0',
  counts: { active: 0, paused: 0, ready: 0 },
  attention,
  housekeepingStale: false,
  upgrade: null,
});

const quiet = ready('quiet');
const waiting = ready('Waiting-Room', [item]);
const moved: Project = { id: 'moved', state: 'unavailable', reason: 'missing', upgrade: null };

describe('matching', () => {
  it('keeps the projects whose id holds what was typed, whatever its case', () => {
    expect(matching([quiet, waiting, moved], ' room ')).toEqual([waiting]);
    expect(matching([quiet, waiting, moved], 'nothing')).toEqual([]);
  });

  it('keeps every project when nothing is typed', () => {
    expect(matching([quiet, waiting], '  ')).toEqual([quiet, waiting]);
  });
});

describe('chosen', () => {
  it('shows the project asked for', () => {
    expect(chosen([quiet, waiting], 'quiet')).toBe(quiet);
  });

  it('shows the first that needs the person when none or an unknown one is asked for', () => {
    expect(chosen([quiet, waiting], undefined)).toBe(waiting);
    expect(chosen([quiet, moved, waiting], 'gone')).toBe(moved);
  });

  it('shows the first when nothing needs the person, and none without projects', () => {
    expect(chosen([quiet, ready('second')], undefined)).toBe(quiet);
    expect(chosen([], undefined)).toBeUndefined();
  });
});
