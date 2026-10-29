import { describe, expect, it } from 'vitest';
import { placeLine, priorityLabel, waitLine } from './queue';

describe('priorityLabel', () => {
  it('names a priority as the card does, and none', () => {
    expect([0, 5, null].map(priorityLabel)).toEqual(['P0', 'P5', 'none']);
  });
});

describe('placeLine', () => {
  it('says the place in the level, at the top or in an epic', () => {
    expect(placeLine({ place: { rank: 2, of: 5 }, queue: { level: null, position: 300 } })).toBe('2nd of 5 at the top');
    expect(placeLine({ place: { rank: 1, of: 3 }, queue: { level: 'epic:booking', position: 100 } })).toBe('1st of 3 in epic booking');
  });

  it.each([
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [21, '21st'],
    [113, '113th'],
  ])('writes %i as %s', (rank, word) => {
    expect(placeLine({ place: { rank, of: 200 }, queue: { level: null, position: 1 } })).toBe(`${word} of 200 at the top`);
  });

  it('says not queued without a place', () => {
    expect(placeLine({ place: null, queue: null })).toBe('not queued');
  });
});

describe('waitLine', () => {
  it("names a task by its id and an epic by its spec's, and the epic a dependency comes through", () => {
    expect(waitLine({ on: 'task:beta', reason: 'Quotes the form', through: null })).toBe('beta — Quotes the form');
    expect(waitLine({ on: 'epic:refunds', reason: 'Pauses it', through: 'epic:booking' })).toBe(
      'epic refunds — Pauses it (through epic booking)',
    );
  });
});
