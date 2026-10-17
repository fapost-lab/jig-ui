import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mainCheckout } from './checkout.js';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'jig-ui-checkout-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
const clone = join(root, 'clone');
mkdirSync(join(clone, 'server'), { recursive: true });
git(clone, 'init', '-q');
git(clone, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'first');
git(clone, 'worktree', 'add', '-q', '--detach', join(root, 'tree'));

describe('mainCheckout', () => {
  it('names the root of a main checkout, from the root or a subdirectory', async () => {
    expect(await mainCheckout(clone)).toEqual({ kind: 'main', root: clone });
    expect(await mainCheckout(join(clone, 'server'))).toEqual({ kind: 'main', root: clone });
  });

  it('names the root of a clone whose git directory lives elsewhere', async () => {
    const separate = join(root, 'separate');
    git(root, 'init', '-q', '--separate-git-dir', join(root, 'separate.git'), separate);
    expect(await mainCheckout(separate)).toEqual({ kind: 'main', root: separate });
  });

  it('refuses a worktree', async () => {
    expect(await mainCheckout(join(root, 'tree'))).toEqual({ kind: 'worktree' });
  });

  it('refuses a directory outside git, and one that does not exist', async () => {
    const plain = join(root, 'plain');
    mkdirSync(plain);
    expect(await mainCheckout(plain)).toEqual({ kind: 'not-a-repository' });
    expect(await mainCheckout(join(root, 'gone'))).toEqual({ kind: 'not-a-repository' });
  });
});
