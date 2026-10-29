import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { removeInstance, writeInstance } from './instance.js';
import { loadToken, resetToken, TOKEN_FILE } from './token.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-token-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const fresh = () => join(mkdtempSync(join(root, 'case-')), 'jig-ui');

describe('loadToken', () => {
  it('makes a token, writes it for the user only and gives the same one again', async () => {
    const dir = fresh();
    const token = await loadToken(dir);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readFileSync(join(dir, TOKEN_FILE), 'utf8').trim()).toBe(token);
    if (process.platform !== 'win32') expect(statSync(join(dir, TOKEN_FILE)).mode & 0o777).toBe(0o600);
    expect(await loadToken(dir)).toBe(token);
  });

  it.each([
    ['empty', ''],
    ['not base64url', `${'!'.repeat(43)}\n`],
    ['cut short', 'abc\n'],
  ])('replaces a file that is %s', async (_, content) => {
    const dir = fresh();
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, TOKEN_FILE), content);
    const token = await loadToken(dir);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readFileSync(join(dir, TOKEN_FILE), 'utf8').trim()).toBe(token);
    if (process.platform !== 'win32') expect(statSync(join(dir, TOKEN_FILE)).mode & 0o777).toBe(0o600);
  });

  it('outlives the instance files', async () => {
    const dir = fresh();
    const token = await loadToken(dir);
    await writeInstance(dir, { port: 4870, token, pid: 1, version: '0.1.0' });
    await removeInstance(dir, { token, pid: 1 });
    expect(await loadToken(dir)).toBe(token);
  });
});

describe('resetToken', () => {
  it('makes the next start use a new token, and does nothing without a file', async () => {
    const dir = fresh();
    const token = await loadToken(dir);
    await resetToken(dir);
    expect(existsSync(join(dir, TOKEN_FILE))).toBe(false);
    await resetToken(dir);
    expect(await loadToken(dir)).not.toBe(token);
  });
});

describe('loadToken at once', () => {
  it('gives two starts the same token', async () => {
    const dir = fresh();
    const [a, b, c] = await Promise.all([loadToken(dir), loadToken(dir), loadToken(dir)]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(readFileSync(join(dir, TOKEN_FILE), 'utf8').trim()).toBe(a);
  });
});
