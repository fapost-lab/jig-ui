import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scanFolder, tilde } from './scan.js';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'jig-ui-scan-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A folder with a `.git` directory, and Jig's script unless `jig` is false; the script fails the test if run. */
function repo(path: string, jig = true): string {
  const dir = join(root, path);
  mkdirSync(join(dir, '.git'), { recursive: true });
  if (jig) {
    mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/bin/sh\ntouch "${join(root, 'jig-ran')}"\n`, { mode: 0o755 });
  }
  return dir;
}

const home = join(root, 'home');
const app = repo('home/code/app');
const connected = repo('home/code/connected');
const options = { home, connected: new Set([connected]), platform: 'darwin' as const };
repo('home/code/plain', false);
repo('home/code/app/vendor/inner'); // inside a repository
const deep = repo('home/a/b/c/d/deep'); // 5 below home
repo('home/a/b/c/d/e/deeper'); // 6 below
repo('home/.hidden/hid');
repo('home/code/node_modules/dep');
repo('home/Documents/doc');
repo('home/Library/lib');
repo('home/AppData/app');
const worktree = join(root, 'home/code/tree');
mkdirSync(worktree, { recursive: true });
writeFileSync(join(worktree, '.git'), 'gitdir: elsewhere\n');
mkdirSync(join(worktree, '.ai', 'scripts'), { recursive: true });
writeFileSync(join(worktree, '.ai', 'scripts', 'jig'), '');
symlinkSync(join(root, 'home/code'), join(root, 'home/link'), 'junction'); // a junction needs no rights on Windows

describe('scanFolder', () => {
  it('finds the main checkouts with Jig, counts the connected ones, and passes over what it must', async () => {
    expect(await scanFolder(home, options)).toEqual({
      found: [deep, app, join(home, 'AppData/app')].sort(),
      connected: 1,
      skipped: ['Documents'],
      stopped: false,
    });
  });

  it('looks through a folder macOS asks about once it is named, and every folder of a home elsewhere', async () => {
    expect((await scanFolder(join(home, 'Documents'), options)).found).toEqual([join(home, 'Documents/doc')]);
    expect((await scanFolder(home, { ...options, platform: 'linux' })).found).toEqual(
      [app, deep, join(home, 'AppData/app'), join(home, 'Documents/doc'), join(home, 'Library/lib')].sort(),
    );
  });

  it("passes over a Windows home's AppData without a word", async () => {
    expect(await scanFolder(home, { ...options, platform: 'win32' })).toEqual({
      found: [app, deep, join(home, 'Documents/doc'), join(home, 'Library/lib')].sort(),
      connected: 1,
      skipped: [],
      stopped: false,
    });
  });

  it('goes as deep and as wide as it is let, and says when it stopped', async () => {
    expect((await scanFolder(home, { ...options, depth: 2 })).found).toEqual([join(home, 'AppData/app'), app].sort());
    expect(await scanFolder(home, { ...options, folders: 1 })).toEqual({ found: [], connected: 0, skipped: ['Documents'], stopped: true });
  });

  it('finds the folder named when it is a project, and nothing in a folder that is not there', async () => {
    expect((await scanFolder(app, options)).found).toEqual([app]);
    expect(await scanFolder(join(root, 'missing'), options)).toEqual({ found: [], connected: 0, skipped: [], stopped: false });
  });

  it.skipIf(process.platform === 'win32')('passes over a folder it may not read', async () => {
    const locked = repo('home/locked/x');
    chmodSync(join(root, 'home/locked'), 0o000);
    try {
      expect((await scanFolder(home, options)).found).not.toContain(locked);
    } finally {
      chmodSync(join(root, 'home/locked'), 0o755);
    }
  });

  it('runs no Jig', async () => {
    await scanFolder(home, options);
    expect(() => realpathSync(join(root, 'jig-ran'))).toThrow();
  });
});

describe('tilde', () => {
  it('puts ~ for the home folder at the head of a path, and only there', () => {
    expect(tilde(home, home)).toBe('~');
    expect(tilde(app, home)).toBe(join('~', 'code', 'app'));
    expect(tilde(`${home}-other`, home)).toBe(`${home}-other`);
    expect(tilde(root, home)).toBe(root);
  });
});
