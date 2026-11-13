import { describe, expect, it } from 'vitest';
import type { Refreshed } from '../api';
import { refreshReport, staleFetch } from './refresh';

const refreshed = (base: Partial<Refreshed['base']> = {}, more: Partial<Refreshed> = {}): Refreshed => ({
  fetch: 'done',
  fetchedAt: '2026-11-13T08:40:56Z',
  base: { name: 'main', outcome: 'up-to-date', from: 'dbe9c989c721', to: 'dbe9c989c721', ...base },
  writes: [],
  ...more,
});

describe('refreshReport', () => {
  it.each([
    [
      'a base brought up',
      refreshed({ outcome: 'fast-forwarded', from: '79ed4f712093', to: 'dbe9c989c721' }),
      'quiet',
      ['main brought up to origin: 79ed4f7 → dbe9c98.'],
    ],
    ['a base already there', refreshed(), 'quiet', ['main is up to date with origin.']],
    [
      'changes in the way',
      refreshed({ outcome: 'blocked-by-changes' }),
      'attention',
      [
        'main is checked out here, and moving it would overwrite changes in this checkout: commit them or set them aside, then refresh again.',
      ],
    ],
    [
      'a base checked out in another worktree',
      refreshed({ outcome: 'checked-out-elsewhere' }),
      'attention',
      ['main is checked out in another worktree of this clone; Jig moves it only from there.'],
    ],
    [
      'a base with commits of its own',
      refreshed({ outcome: 'diverged' }),
      'attention',
      ["main here has commits origin's does not, so Jig leaves it as it is."],
    ],
    ['no base on either side', refreshed({ outcome: 'missing' }), 'attention', ['There is no main here, or none on origin.']],
    [
      'a fetch that failed',
      refreshed({}, { fetch: 'failed', fetchedAt: null }),
      'attention',
      [
        'Jig could not reach origin: the page shows the clone as of its last fetch.',
        'main is up to date with origin as of the last fetch.',
      ],
    ],
    [
      'a clone without origin',
      refreshed({}, { fetch: 'skipped', fetchedAt: null }),
      'attention',
      ['This clone has no origin to fetch from.', 'main is up to date with origin as of the last fetch.'],
    ],
    [
      "Jig's writes it closed",
      refreshed(
        {},
        {
          writes: [
            { target: 'knowledge', branch: 'knowledge/decisions', reason: 'merged' },
            { target: 'spec:jig-ui', branch: 'spec/jig-ui', reason: 'closed' },
          ],
        },
      ),
      'quiet',
      [
        'main is up to date with origin.',
        'Knowledge decisions no longer wait: their pull request merged.',
        'Roadmap edits of jig-ui no longer wait: their pull request was closed unmerged.',
      ],
    ],
  ] as const)('says %s', (_, r, tone, lines) => {
    expect(refreshReport(r)).toEqual({ tone, lines });
  });
});

describe('staleFetch', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  it('says nothing of a fetch within the day, or of a clone that never fetched', () => {
    expect(staleFetch({ fetchedAt: '2026-11-13T00:00:01Z', behind: 0 }, now)).toBeUndefined();
    expect(staleFetch({ fetchedAt: null, behind: null }, now)).toBeUndefined();
    expect(staleFetch(null, now)).toBeUndefined();
  });
  it('says how long ago the clone last fetched once that is more than a day', () => {
    expect(staleFetch({ fetchedAt: '2026-11-10T12:00:00Z', behind: 0 }, now)).toBe(
      'Last fetched from origin 3 days ago: what landed there since is not shown here.',
    );
  });
});
