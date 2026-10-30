import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { hasJig } from '../jig/client.js';

/** The home folder's folders macOS asks about before an app reads them; the result names the ones passed over. */
const ASKED: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  darwin: ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures'],
};

/** The home folder's folders that hold an app's data, not projects: passed over without a word. */
const QUIET: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  darwin: ['Library'],
  win32: ['AppData'],
};

export interface Scan {
  /** The main checkouts with Jig that are not connected, sorted. */
  found: string[];
  /** How many main checkouts with Jig under the folder are connected already. */
  connected: number;
  /** The home folder's folders passed over because macOS asks before an app reads them. */
  skipped: string[];
  /** The walk stopped at its limit of folders. */
  stopped: boolean;
}

export interface ScanOptions {
  home: string;
  /** The real paths of the connected projects, as the registry keeps them. */
  connected: ReadonlySet<string>;
  platform?: NodeJS.Platform;
  /** How many folders deep below `folder` the walk reads. */
  depth?: number;
  /** How many folders it reads at most. */
  folders?: number;
}

/**
 * The Jig projects under `folder`, a real path: each folder with a `.git` directory — a main checkout — and Jig's
 * script. It reads folder listings only: it runs no Jig and no git and opens no file. It never walks into a repository,
 * a hidden folder, `node_modules` or a symbolic link, and passes over a folder it may not read.
 */
export async function scanFolder(
  folder: string,
  { home, connected, platform = process.platform, depth = 5, folders = 20_000 }: ScanOptions,
): Promise<Scan> {
  const scan: Scan = { found: [], connected: 0, skipped: [], stopped: false };
  const asked = new Set(ASKED[platform]);
  const passed = new Set([...asked, ...(QUIET[platform] ?? [])]);
  let read = 0;

  async function walk(dir: string, level: number): Promise<void> {
    if (read >= folders) {
      scan.stopped = true;
      return;
    }
    read++;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const git = entries.find((e) => e.name === '.git');
    if (git) {
      // A `.git` file is a worktree's (connect refuses it), a submodule's or a `--separate-git-dir` clone's: passed over,
      // as the ADR says; its path typed in the field connects the last two.
      if (git.isDirectory() && hasJig(dir)) {
        if (connected.has(dir)) scan.connected++;
        else scan.found.push(dir);
      }
      return;
    }
    if (level >= depth) return;
    const inHome = dir === home;
    const next = entries.filter((e) => {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') return false;
      if (!inHome || !passed.has(e.name)) return true;
      if (asked.has(e.name)) scan.skipped.push(e.name);
      return false;
    });
    await Promise.all(next.map((e) => walk(join(dir, e.name), level + 1)));
  }

  await walk(folder, 0);
  scan.found.sort();
  scan.skipped.sort();
  return scan;
}

/** A path in the form the connect field takes: `~` for the home folder at its head. */
export const tilde = (path: string, home: string): string =>
  path === home || path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
