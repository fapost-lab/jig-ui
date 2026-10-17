import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

// A system watcher that fails after it started: the Watcher must turn that into one change.
const failing = Object.assign(new EventEmitter(), { close: vi.fn() });
vi.mock('node:fs', async (original) => ({ ...(await original<typeof import('node:fs')>()), watch: () => failing }));

const { watchTree } = await import('./watch.js');

describe('watchTree, when the system watcher fails', () => {
  it('reports one change, closes, and does not throw', () => {
    let changes = 0;
    const watch = watchTree('/any', { ignore: () => false, onChange: () => changes++ });
    expect(watch.open).toBe(true);
    failing.emit('error', new Error('EMFILE'));
    expect(changes).toBe(1);
    expect(watch.open).toBe(false);
    expect(failing.close).toHaveBeenCalledOnce();
  });
});
