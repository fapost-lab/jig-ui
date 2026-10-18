import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { type Watch, type WatchOptions, watchTree } from './watch.js';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'jig-ui-watch-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A fresh directory with a `noise/` and a `deep/er/` inside it. */
function tree(name: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, 'noise'), { recursive: true });
  mkdirSync(join(dir, 'deep', 'er'), { recursive: true });
  return dir;
}

/**
 * Watches `dir` and counts the changes it reports from now on. macOS delivers the creation of the
 * tree late, and a late event fires one quiet time after it: the count starts only once a whole
 * quiet time and more has passed with nothing reported.
 */
async function watching(dir: string, options: Omit<WatchOptions, 'onChange'>): Promise<{ watch: Watch; changes: () => number }> {
  let changes = 0;
  const watch = watchTree(dir, { ...options, onChange: () => changes++ });
  const settle = (options.quietMs ?? 1_000) + 300;
  for (let seen = -1; seen !== changes;) {
    seen = changes;
    await delay(settle);
  }
  changes = 0;
  return { watch, changes: () => changes };
}

/** Waits until `count()` reaches `n`, or gives up after `ms`; system watchers start and report asynchronously. */
async function until(count: () => number, n: number, ms = 3_000): Promise<void> {
  for (let waited = 0; count() < n && waited < ms; waited += 20) await delay(20);
}

describe('watchTree', () => {
  it('reports a change anywhere below the directory, once per quiet run', async () => {
    const dir = tree('deep');
    // Wide enough that a loaded machine still delivers both writes inside one quiet run.
    const { watch, changes } = await watching(dir, { ignore: () => false, quietMs: 400 });
    writeFileSync(join(dir, 'deep', 'er', 'a'), '1');
    writeFileSync(join(dir, 'deep', 'er', 'b'), '2');
    await until(changes, 1);
    await delay(600);
    watch.close();
    expect(changes()).toBe(1);
  });

  it('says nothing about a path it is told to ignore', async () => {
    const dir = tree('ignored');
    const { watch, changes } = await watching(dir, { ignore: (p) => p.startsWith('noise'), quietMs: 20 });
    writeFileSync(join(dir, 'noise', 'x'), '1');
    await delay(300);
    expect(changes()).toBe(0);
    writeFileSync(join(dir, 'signal'), '1');
    await until(changes, 1);
    watch.close();
    expect(changes()).toBe(1);
  });

  it('reports a run of changes that never goes quiet after the longest wait', async () => {
    const dir = tree('busy');
    const { watch, changes } = await watching(dir, { ignore: () => false, quietMs: 200, maxWaitMs: 300 });
    for (let i = 0; i < 12; i++) {
      writeFileSync(join(dir, 'f'), String(i));
      await delay(50);
    }
    watch.close();
    expect(changes()).toBeGreaterThanOrEqual(1);
    expect(changes()).toBeLessThanOrEqual(3);
  });

  it('stops reporting once closed', async () => {
    const dir = tree('closed');
    let changes = 0;
    const watch = watchTree(dir, { ignore: () => false, onChange: () => changes++, quietMs: 20 });
    expect(watch.open).toBe(true);
    watch.close();
    expect(watch.open).toBe(false);
    writeFileSync(join(dir, 'f'), '1');
    await delay(200);
    expect(changes).toBe(0);
  });

  it('is not open for a directory that is not there, and does not throw', () => {
    const watch = watchTree(join(root, 'nowhere'), { ignore: () => false, onChange: () => undefined });
    expect(watch.open).toBe(false);
    watch.close();
  });
});
