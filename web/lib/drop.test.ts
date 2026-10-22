import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../api';
import { useDrop } from './drop';

const task = (id: string, pauseRequestable: boolean): Task => ({
  id,
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  pauseRequest: null,
  pauseRequestable,
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
    const drag = useDrop(onMove, onPause);
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
