import { describe, expect, it } from 'vitest';
import type { Task } from '../source/project-source.js';
import { columnOf, columns } from './columns.js';

const task = (more: Partial<Task> = {}): Task => ({
  id: 't',
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  pauseRequest: null,
  pauseRequestable: true,
  resumable: false,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  priority: null,
  queue: null,
  ...more,
});

describe('columnOf', () => {
  it.each([
    ['a started active task', {}, 'in-progress'],
    ['a task not started', { started: false }, 'backlog'],
    ['a design waiting at its gate', { gate: 'waiting' }, 'needs-you'],
    ['a design changed after approval', { gate: 'changed' }, 'needs-you'],
    ['an approved design', { gate: 'approved' }, 'in-progress'],
    ['a stopped autopilot run', { autopilot: 'stopped' }, 'needs-you'],
    ['a running autopilot', { autopilot: 'on' }, 'in-progress'],
    ['a ready task', { status: 'ready' as const }, 'ready'],
    [
      'a ready task with a pull request',
      { status: 'ready' as const, pullRequest: { url: 'https://x', state: 'open', ci: 'green', fetchedAt: null } },
      'ready',
    ],
    ['a paused task, whatever else holds', { paused: true, started: false, gate: 'waiting' }, 'paused'],
    ['a task not started with a gate', { started: false, gate: 'waiting' }, 'backlog'],
    ['a ready task whose autopilot stopped', { status: 'ready' as const, autopilot: 'stopped' }, 'needs-you'],
  ])('%s → %s', (_, more, column) => {
    expect(columnOf(task(more))).toBe(column);
  });
});

describe('columns', () => {
  it("puts every task in exactly one column, the columns in a fixed order, Jig's order kept", () => {
    const tasks = [task({ id: 'b' }), task({ id: 'a', started: false }), task({ id: 'c' }), task({ id: 'd', paused: true })];
    const board = columns(tasks);
    expect(board.map((c) => c.id)).toEqual(['needs-you', 'in-progress', 'ready', 'backlog', 'paused']);
    expect(board.map((c) => c.cards.map((t) => t.id))).toEqual([[], ['b', 'c'], [], ['a'], ['d']]);
  });

  it("orders a column as Jig's queue does: the top level, then each epic's, then the tasks not queued in Jig's order", () => {
    const at = (level: string | null, position: number) => ({ queue: { level, position } });
    const tasks = [
      task({ id: 'loose-b' }),
      task({ id: 'epic-z', ...at('epic:zeta', 100) }),
      task({ id: 'top-2', ...at(null, 200) }),
      task({ id: 'loose-a' }),
      task({ id: 'epic-a', ...at('epic:alpha', 300) }),
      task({ id: 'top-1', ...at(null, 150) }),
    ];
    expect(columns(tasks)[1]?.cards.map((t) => t.id)).toEqual(['top-1', 'top-2', 'epic-a', 'epic-z', 'loose-b', 'loose-a']);
  });

  it('names the column a resumable task lands in once resumed, and none for the rest', () => {
    const tasks = [
      task({ id: 'moving', paused: true, resumable: true }),
      task({ id: 'unbegun', paused: true, resumable: true, started: false }),
      task({ id: 'gated', paused: true, resumable: true, gate: 'waiting' }),
      task({ id: 'old-jig', paused: true }),
      task({ id: 'live' }),
    ];
    const cards = columns(tasks).flatMap((c) => c.cards);
    expect(Object.fromEntries(cards.map((t) => [t.id, t.resumesTo]))).toEqual({
      moving: 'in-progress',
      unbegun: 'backlog',
      gated: 'needs-you',
      'old-jig': null,
      live: null,
    });
  });
});
