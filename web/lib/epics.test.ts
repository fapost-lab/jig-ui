import { describe, expect, it } from 'vitest';
import type { Spec } from '../api';
import { epicStep } from './epics';

const spec = (id: string, epic: 'open' | 'finished' | null, position: number | null = null): Spec => ({
  id,
  title: null,
  missingFiles: [],
  release: null,
  epic: epic && { branch: `epic/${id}`, state: epic, checkedOut: false, missing: false, fetched: false },
  progress: null,
  phases: [],
  queue: position === null ? null : { position, priority: null },
});

// As the page shows them: the queued epics, then the open ones not queued, then the rest.
const specs = [
  spec('a', 'open', 100),
  spec('b', 'open', 200),
  spec('c', 'open'),
  spec('d', 'open'),
  spec('e', null),
  spec('f', 'finished'),
];

describe('epicStep', () => {
  it.each([
    ['b up, before a', 'b', -1, { before: 'a' }],
    ['a down, after b', 'a', 1, { after: 'b' }],
    ['c up, the first not queued: before b', 'c', -1, { before: 'b' }],
    ['d up, past one not queued: to the end of the queued ones', 'd', -1, { after: 'b' }],
    ['a up: nothing above', 'a', -1, undefined],
    ['b down onto an epic not queued', 'b', 1, undefined],
    ['c down onto another not queued', 'c', 1, undefined],
    ['d down: the last open epic', 'd', 1, undefined],
    ['a spec with no epic', 'e', -1, undefined],
    ['a finished epic', 'f', -1, undefined],
  ] as const)('moves %s', (_, id, by, place) => {
    expect(epicStep(specs, id, by)).toEqual(place);
  });

  it('queues an epic going up at the bottom when none is queued', () => {
    expect(epicStep([spec('a', 'open'), spec('b', 'open')], 'b', -1)).toBe('bottom');
  });
});
