import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../api';
import { useDrop } from './drop';

const task = (id: string, pauseRequestable: boolean, resumesTo: Task['resumesTo'] = null): Task => ({
  id,
  class: 'T2',
  status: 'active',
  goal: null,
  paused: resumesTo !== null,
  pauseRequest: null,
  pauseRequestable,
  resumable: resumesTo !== null,
  closable: false,
  resumesTo,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  priority: null,
  queue: null,
});

const event = () => ({ preventDefault: vi.fn(), dataTransfer: null }) as unknown as DragEvent;

describe('useDrop onto another column', () => {
  it.each([
    ['asks a pause on Paused when Jig offers it', 'paused', true, ['a']],
    ['allows nothing on Paused when Jig does not offer it', 'paused', false, []],
    ['allows nothing on any other column', 'backlog', true, []],
  ])('%s', (_, list, offered, paused) => {
    const onMove = vi.fn();
    const onPause = vi.fn();
    const drag = useDrop(onMove, onPause, vi.fn());
    drag.start(event(), 'in-progress', task('a', offered));
    const over = event();
    drag.over(over, list, []);
    expect(over.preventDefault).toHaveBeenCalledTimes(paused.length);
    drag.drop(list);
    expect(onPause.mock.calls.map(([id]) => id)).toEqual(paused);
    expect(onMove).not.toHaveBeenCalled();
    expect(drag.gap.value).toBeUndefined();
  });
});

describe('useDrop out of Paused', () => {
  it.each([
    ['resumes on the column a resume puts it in', 'in-progress', 'in-progress', ['a']],
    ['allows nothing on another column', 'ready', 'in-progress', []],
    ['allows nothing anywhere when it is not resumable', 'in-progress', null, []],
  ] as const)('%s', (_, list, resumesTo, resumed) => {
    const onMove = vi.fn();
    const onResume = vi.fn();
    const drag = useDrop(onMove, vi.fn(), onResume);
    drag.start(event(), 'paused', task('a', false, resumesTo));
    const over = event();
    drag.over(over, list, []);
    expect(over.preventDefault).toHaveBeenCalledTimes(resumed.length);
    drag.drop(list);
    expect(onResume.mock.calls.map(([id]) => id)).toEqual(resumed);
    expect(onMove).not.toHaveBeenCalled();
  });
});
