import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** The oldest Jig whose reads Jig UI understands: 0.29.0 is the first that prints JSON. */
export const MIN_JIG_VERSION = '0.29.0';

const SCRIPT = join('.ai', 'scripts', 'jig');
const TIMEOUT_MS = 10_000;

/**
 * The bash that runs `.ai/scripts/jig`. On Windows it is Git's, found next to git itself
 * (`<git>/mingw64/libexec/git-core` → `<git>/bin/bash.exe`): a `bash` on PATH may be WSL's.
 */
async function bash(platform: NodeJS.Platform): Promise<string> {
  if (platform !== 'win32') return 'bash';
  const { stdout } = await run('git', ['--exec-path'], { timeout: TIMEOUT_MS });
  return resolve(stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
}

/** Runs the project's own Jig in its main checkout, without a shell. */
async function jig(root: string, args: string[], platform: NodeJS.Platform): Promise<string> {
  const { stdout } = await run(await bash(platform), [SCRIPT, ...args], { cwd: root, timeout: TIMEOUT_MS });
  return stdout;
}

/**
 * The project's Jig version, `undefined` when the checkout has no Jig. Throws when Jig is there but
 * does not answer with a version.
 */
export async function jigVersion(root: string, platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  if (!existsSync(join(root, SCRIPT))) return undefined;
  const match = /^jig (\d+\.\d+\.\d+)\b/.exec((await jig(root, ['--version'], platform)).trim());
  if (!match?.[1]) throw new Error('jig --version did not print a version');
  return match[1];
}

/** True when `version` is at least the minimum Jig UI reads. */
export function supports(version: string, minimum: string = MIN_JIG_VERSION): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}
