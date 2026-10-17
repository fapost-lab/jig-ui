import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type Checkout = { kind: 'main'; root: string } | { kind: 'worktree' } | { kind: 'not-a-repository' };

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
  return (await realpath(own)) === (await realpath(common)) ? { kind: 'main', root: await realpath(top) } : { kind: 'worktree' };
}
