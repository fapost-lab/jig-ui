import { describe, expect, it } from 'vitest';
import type { Task } from '../api';
import { placement, step } from './placement';

const task = (id: string, level?: string | null, position = 100): Task => ({
  id,
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  started: false,
  gate: null,
  autopilot: null,
  pullRequest: null,
  priority: null,
  queue: level === undefined ? null : { level, position },
});

// q1, q2 queued on the top level; e1 on an open epic's; l1, l2 not queued — the order a column shows them in.
const column = [task('q1', null, 100), task('q2', null, 200), task('e1', 'epic:e'), task('l1'), task('l2')];

describe('placement', () => {
  it.each([
    ['above everything', 'q2', 0, 'top'],
    ['after the nearest queued card above, on its level', 'q1', 2, { after: 'q2' }],
    ['a card not queued, between queued ones', 'l2', 1, { after: 'q1' }],
    ['a card not queued, to the top', 'l1', 0, 'top'],
    ['among the cards not queued, after the last queued one of its level above', 'q1', 5, { after: 'q2' }],
  ])('puts a card dropped %s', (_, id, gap, place) => {
    expect(placement(column, id, gap)).toEqual(place);
  });

  it('puts a card among cards not queued at the bottom of the queue when none of its level is above', () => {
    expect(placement([task('l1'), task('l2'), task('l3')], 'l3', 1)).toBe('bottom');
    expect(placement([task('l1'), task('l2'), task('l3')], 'l1', 3)).toBe('bottom');
  });

  it("moves an epic's task only against its own level", () => {
    const epic = [task('q1', null), task('e1', 'epic:e', 100), task('e2', 'epic:e', 200)];
    expect(placement(epic, 'e2', 1)).toBe('top');
    expect(placement(epic, 'e1', 3)).toEqual({ after: 'e2' });
  });

  it.each([
    ['onto its own place', 'q2', 1],
    ['just below its own place', 'q2', 2],
    ['inside a later level, right below its card', 'q1', 3],
    ['inside an earlier level, right above its card', 'e1', 1],
    ['for a card that is not in the column', 'nope', 0],
  ])('changes nothing for a drop %s', (_, id, gap) => {
    expect(placement(column, id, gap)).toBeUndefined();
  });
});

describe('step', () => {
  it('moves a card one place up or down, and not past either end', () => {
    expect(step(column, 'q2', -1)).toBe('top');
    expect(step(column, 'q1', 1)).toEqual({ after: 'q2' });
    expect(step(column, 'q1', -1)).toBeUndefined();
    expect(step(column, 'l2', 1)).toBeUndefined();
  });
});
