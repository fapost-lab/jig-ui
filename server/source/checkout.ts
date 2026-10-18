import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** A worktree names its clone's main checkout; `null` when the clone is bare and has none. */
export type Checkout =
  | {
      kind: 'main';
      root: string;
    }
  | {
      kind: 'worktree';
      main: string | null;
    }
  | { kind: 'not-a-repository' };

/**
 * Where `path` sits in git: a clone's main checkout (its root, even from a subdirectory), a
 * worktree, or nothing git knows. Only a worktree has a git directory of its own beside the
 * clone's common one; a submodule or a `--separate-git-dir` clone has one directory for both.
 */
export async function mainCheckout(path: string): Promise<Checkout> {
  let stdout: string;
  try {
    ({ stdout } = await run('git', ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'], {
      cwd: path,
      timeout: 10_000,
    }));
  } catch {
    return { kind: 'not-a-repository' };
  }
  const [top, own, common] = stdout.trim().split(/\r?\n/);
  if (!top || !own || !common) return { kind: 'not-a-repository' };
  if ((await realpath(own)) === (await realpath(common))) return { kind: 'main', root: await realpath(top) };
  return { kind: 'worktree', main: await mainWorktree(path) };
}

/**
 * The main working tree, which `git worktree list` names first — not `dirname(--git-common-dir)`, which
 * misses for a worktree of a submodule. A bare clone's first entry is the repository itself.
 */
async function mainWorktree(path: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['worktree', 'list', '--porcelain'], { cwd: path, timeout: 10_000 });
    const [first, second] = stdout.split(/\r?\n/);
    if (!first?.startsWith('worktree ') || second === 'bare') return null;
    return await realpath(first.slice('worktree '.length));
  } catch {
    return null;
  }
}
