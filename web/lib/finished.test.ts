import { describe, expect, it } from 'vitest';
import { finished, type FinishedTask, latestFirst } from './finished';

const task = (more: Partial<FinishedTask> = {}): FinishedTask => ({
  id: 'fix-typo',
  status: 'consolidated',
  goal: 'Fix the typo.',
  updatedAt: '2026-10-24',
  pullRequest: null,
  ...more,
});

describe('finished', () => {
  it('says a closed task went well and an abandoned one quietly', () => {
    expect(finished(task())).toEqual({ word: 'closed', tone: 'good', pr: undefined });
    expect(finished(task({ status: 'abandoned' }))).toEqual({ word: 'abandoned', tone: 'quiet', pr: undefined });
  });

  it('names a pull request by its number and state, with its link', () => {
    const pr = { url: 'https://github.com/o/r/pull/40', state: 'merged' };
    expect(finished(task({ pullRequest: pr })).pr).toEqual({ text: '#40 merged', url: pr.url });
    const mr = { url: 'https://gitlab.com/o/r/-/merge_requests/7', state: null };
    expect(finished(task({ pullRequest: mr })).pr).toEqual({ text: '#7', url: mr.url });
  });

  it('names a pull request it cannot number, and gives no link the page would not open', () => {
    expect(finished(task({ pullRequest: { url: 'http://forge.local/x', state: 'closed' } })).pr).toEqual({
      text: 'Pull request closed',
      url: undefined,
    });
  });
});

describe('latestFirst', () => {
  it('puts the latest finished first, keeps Jig’s order within a day, and a task without a day last', () => {
    const tasks = [
      task({ id: 'a', updatedAt: '2026-10-17' }),
      task({ id: 'b', updatedAt: '2026-10-25' }),
      task({ id: 'c', updatedAt: null }),
      task({ id: 'd', updatedAt: '2026-10-25' }),
    ];
    expect(latestFirst(tasks).map((t) => t.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});
