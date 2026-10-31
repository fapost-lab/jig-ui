import { describe, expect, it } from 'vitest';
import type { Attention, Project } from '../api';
import { byName, chosen, landed, matching, readOnes, readProgress, type Reading } from './projects';

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
const slow: Reading = { id: 'slow', state: 'reading' };

describe('byName', () => {
  it('orders by id A–Z, case aside, numbers by value, and leaves the list it was given alone', () => {
    const given = [{ id: 'web' }, { id: 'App10' }, { id: 'api' }, { id: 'app2' }];
    expect(byName(given).map((p) => p.id)).toEqual(['api', 'app2', 'App10', 'web']);
    expect(given.map((p) => p.id)).toEqual(['web', 'App10', 'api', 'app2']);
  });
});

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

describe('while the projects are read', () => {
  it('shows the project asked for even before its read lands', () => {
    expect(chosen([quiet, slow], 'slow')).toBe(slow);
    expect(chosen([slow, waiting], 'Waiting-Room')).toBe(waiting);
  });

  it('chooses no card unasked until every read has landed', () => {
    expect(chosen([quiet, slow, waiting], undefined)).toBeUndefined();
    expect(chosen([quiet, waiting], undefined)).toBe(waiting);
  });

  it('counts the reads landed, and says nothing once all have', () => {
    expect(readProgress([quiet, slow, waiting])).toEqual({ read: 2, of: 3 });
    expect(readProgress([slow])).toEqual({ read: 0, of: 1 });
    expect(readProgress([quiet, waiting])).toBeUndefined();
    expect(readProgress([])).toBeUndefined();
  });

  it('finds a project being read by its id, and leaves it out of what needs every read', () => {
    expect(matching([quiet, slow], 'SLO')).toEqual([slow]);
    expect(readOnes([quiet, slow, moved])).toEqual([quiet, moved]);
  });

  it("puts a project's read in its place, and never over a project already read", () => {
    const read = { ...quiet, id: 'slow' };
    expect(landed([quiet, slow, waiting], read)).toEqual([quiet, read, waiting]);
    expect(landed([quiet, read], { ...waiting, id: 'slow' })).toEqual([quiet, read]);
    expect(landed([quiet], read)).toEqual([quiet]);
  });
});
