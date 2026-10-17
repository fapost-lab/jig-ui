import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { jigVersion, MIN_JIG_VERSION, supports } from './client.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-jig-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A checkout whose `.ai/scripts/jig` prints `output` for any command. */
function checkout(name: string, output: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\necho "${output}"\n`);
  return dir;
}

describe('jigVersion', () => {
  it("reads the project's own Jig", async () => {
    expect(await jigVersion(checkout('new', 'jig 0.29.0'))).toBe('0.29.0');
    expect(await jigVersion(checkout('old', 'jig 0.26.1'))).toBe('0.26.1');
  });

  it('is undefined without Jig', async () => {
    mkdirSync(join(root, 'bare'));
    expect(await jigVersion(join(root, 'bare'))).toBeUndefined();
  });

  it('throws when Jig names no version', async () => {
    await expect(jigVersion(checkout('odd', 'usage: jig'))).rejects.toThrow();
  });
});

describe('supports', () => {
  it.each([
    [MIN_JIG_VERSION, true],
    ['0.29.1', true],
    ['0.30.0', true],
    ['1.0.0', true],
    ['0.28.9', false],
    ['0.9.0', false],
  ])('%s → %s', (version, expected) => {
    expect(supports(version)).toBe(expected);
  });
});
