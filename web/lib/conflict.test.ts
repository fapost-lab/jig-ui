import { describe, expect, it } from 'vitest';
import type { Column, Task } from '../api';
import { conflict } from './conflict';

const task = (id: string, more: Partial<Task> = {}): Task => ({
  id,
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  pauseRequest: null,
  pauseRequestable: true,
  resumable: false,
  closable: false,
  resumesTo: null,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  priority: null,
  queue: null,
  ...more,
});

const queued = (id: string, position: number, more: Partial<Task> = {}) => task(id, { queue: { level: null, position }, ...more });

const board = (progress: Task[], ready: Task[] = []): Column[] => [
  { id: 'in-progress', title: 'In progress', cards: progress },
  { id: 'ready', title: 'Ready', cards: ready },
];

const before = board([queued('alpha', 100), queued('beta', 200), queued('gamma', 300), queued('delta', 400)]);

describe('conflict', () => {
  it('says nothing on the board changed when a write elsewhere made the change stale', () => {
    expect(conflict(before, before, 'beta')).toEqual({ changed: [], said: 'nothing on the board changed' });
  });

  it("marks a card moved in its column, not the neighbours it passed, though Jig respaced the level's positions", () => {
    const after = board([queued('alpha', 1000), queued('gamma', 2000), queued('delta', 3000), queued('beta', 4000)]);
    expect(conflict(before, after, 'alpha')).toEqual({ changed: ['beta'], said: 'alpha did not change, 1 other card changed' });
    expect(conflict(before, after, 'beta').said).toBe('beta moved in In progress');
  });

  it('marks a card in another column, a new one and a changed one, and counts a card that left the board', () => {
    const after = board(
      [queued('alpha', 100, { priority: 1 }), queued('gamma', 300), task('epsilon')],
      [queued('beta', 200, { status: 'ready' })],
    );
    expect(conflict(before, after, 'beta')).toEqual({
      changed: ['alpha', 'epsilon', 'beta'],
      said: 'beta is now in Ready, 2 other cards changed, 1 other card left the board',
    });
  });

  it.each([
    ['up', [queued('alpha', 100), queued('gamma', 150), queued('beta', 200), queued('delta', 400)], 'gamma'],
    ['down', [queued('alpha', 100), queued('gamma', 300), queued('beta', 350), queued('delta', 400)], 'beta'],
  ])('marks the card an agent moved one step %s, not the neighbour it passed', (_, cards, mover) => {
    expect(conflict(before, board(cards), 'alpha')).toEqual({ changed: [mover], said: 'alpha did not change, 1 other card changed' });
  });

  it('does not mark a card for what it does not show, such as when its pull request was last asked about', () => {
    const pr = (fetchedAt: string) => ({ url: 'https://github.com/o/r/pull/7', state: 'open', ci: 'green', fetchedAt });
    const then = board([queued('alpha', 100, { pullRequest: pr('2026-10-25T10:00:00Z') })]);
    const now = board([queued('alpha', 100, { pullRequest: pr('2026-10-25T11:00:00Z'), pauseRequestable: false })]);
    expect(conflict(then, now, 'alpha')).toEqual({ changed: [], said: 'nothing on the board changed' });
  });

  it('says the card the person acted on left the board', () => {
    const after = board([queued('alpha', 100), queued('gamma', 300), queued('delta', 400)]);
    expect(conflict(before, after, 'beta')).toEqual({ changed: [], said: 'beta is no longer on the board' });
  });

  it("says the person's card changed when only its facts did", () => {
    const after = board([
      queued('alpha', 100),
      queued('beta', 200, { pauseRequest: { requestedAt: '2026-10-25T10:00:00Z' } }),
      queued('gamma', 300),
      queued('delta', 400),
    ]);
    expect(conflict(before, after, 'beta')).toEqual({ changed: ['beta'], said: 'beta changed' });
  });

  it('marks a card that joined the queue or moved to an epic’s level, its place in the queue being a fact', () => {
    const after = board([
      queued('alpha', 100),
      queued('beta', 200, { queue: { level: 'epic:e', position: 100 } }),
      queued('gamma', 300),
      queued('delta', 400),
    ]);
    expect(conflict(before, after, 'alpha').changed).toEqual(['beta']);
    const unqueued = board([queued('alpha', 100), task('beta')]);
    expect(conflict(unqueued, board([queued('alpha', 100), queued('beta', 200)]), 'alpha').changed).toEqual(['beta']);
  });
});
