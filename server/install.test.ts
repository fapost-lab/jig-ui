import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MINIMUM_NODE_MAJOR } from './node-version.js';

// `install.sh` at the repository's root, run as a person runs it: by bash, with no Node.js on PATH.
const SCRIPT = resolve(import.meta.dirname, '..', 'install.sh');
const windows = process.platform === 'win32';
// Git's bash on Windows, found next to git (a `bash` on PATH may be WSL's); its launcher puts Git's tools on PATH.
const BASH = windows
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '..', '..', '..', 'bin', 'bash.exe')
  : 'bash';
const SYSTEM_PATH = windows ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') : '/usr/bin:/bin:/usr/sbin:/sbin';
const SUFFIXES = ['win-x64.zip', 'win-arm64.zip', 'darwin-arm64.tar.gz', 'darwin-x64.tar.gz', 'linux-x64.tar.gz', 'linux-arm64.tar.gz'];

let dir: string;
let home: string;
let data: string;
let launcher: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jig-ui-install-'));
  home = join(dir, 'home');
  mkdirSync(home);
  // Where the script puts Node.js: %LOCALAPPDATA%\jig-ui on Windows, $XDG_DATA_HOME/jig-ui elsewhere.
  data = join(dir, 'data', 'jig-ui');
  launcher = windows ? join(home, 'bin', 'jig-ui') : join(home, '.local', 'bin', 'jig-ui');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A copy of nodejs.org/dist offering Node.js 24.99.0 for every machine: each archive as `archive` makes it, with its sum or a wrong one. */
function mirror(archive: (name: string, path: string) => void, rightSums: boolean): string {
  const dist = join(dir, 'dist');
  mkdirSync(join(dist, 'latest-v24.x'), { recursive: true });
  mkdirSync(join(dist, 'v24.99.0'));
  const files = SUFFIXES.map((suffix) => `node-v24.99.0-${suffix}`);
  const sums = files.map((file) => {
    const path = join(dist, 'v24.99.0', file);
    archive(file.replace(/\.(zip|tar\.gz)$/, ''), path);
    return rightSums ? createHash('sha256').update(readFileSync(path)).digest('hex') : '0'.repeat(64);
  });
  writeFileSync(join(dist, 'latest-v24.x', 'SHASUMS256.txt'), files.map((file, i) => `${sums[i]}  ${file}\n`).join(''));
  return pathToFileURL(dist).href;
}

/** A `node` and `npx` first on PATH: `node` of the given major, `npx` saying what it was asked. */
function fakeNode(major: number): string {
  const bin = join(dir, `fake-node-${major}`);
  mkdirSync(bin);
  // `node -p …` answers the major, `node --version` the version.
  writeFileSync(join(bin, 'node'), `#!/bin/sh\nif [ "$1" = -p ]; then echo ${major}; else echo v${major}.0.0; fi\n`);
  writeFileSync(join(bin, 'npx'), '#!/bin/sh\necho "npx $*"\n');
  chmodSync(join(bin, 'node'), 0o755);
  chmodSync(join(bin, 'npx'), 0o755);
  return `${bin}${delimiter}${SYSTEM_PATH}`;
}

/** A `uname` naming the given system and machine, and a `cygpath` passing a path through as it is, first on `path`. */
function fakeSystem(system: string, machine: string, path: string): string {
  const bin = join(dir, 'fake-system');
  mkdirSync(bin);
  writeFileSync(join(bin, 'uname'), `#!/bin/sh\nif [ "$1" = -m ]; then echo ${machine}; else echo ${system}; fi\n`);
  writeFileSync(join(bin, 'cygpath'), '#!/bin/sh\nprintf "%s\\n" "$2"\n');
  chmodSync(join(bin, 'uname'), 0o755);
  chmodSync(join(bin, 'cygpath'), 0o755);
  return `${bin}${delimiter}${path}`;
}

/** A Node.js and a launcher this script put there earlier; what they hold, to compare after a run. */
function earlierInstall(): () => [string, string] {
  mkdirSync(join(data, 'node'), { recursive: true });
  writeFileSync(join(data, 'node', 'earlier'), 'the Node.js that works');
  mkdirSync(join(launcher, '..'), { recursive: true });
  writeFileSync(launcher, "#!/bin/sh\n# Written by Jig UI's install.sh: earlier.\necho earlier\n");
  return () => [readFileSync(join(data, 'node', 'earlier'), 'utf8'), readFileSync(launcher, 'utf8')];
}

function install(path: string, mirror: string, ...args: string[]) {
  return spawnSync(BASH, [SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      HOME: home,
      PATH: path,
      LOCALAPPDATA: join(dir, 'data'),
      XDG_DATA_HOME: join(dir, 'data'),
      NODEJS_ORG_MIRROR: mirror,
      ...(windows ? { SystemRoot: process.env.SystemRoot } : {}),
    },
  });
}

describe('install.sh', () => {
  it('asks for the Node.js the server checks for', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toMatch(new RegExp(`^MINIMUM_NODE_MAJOR=${MINIMUM_NODE_MAJOR}$`, 'm'));
  });

  it('installs nothing from an archive that does not match its sum, and keeps the Node.js there', () => {
    const kept = earlierInstall();
    const before = kept();

    // An older Node.js on PATH does not count: the script goes for its own.
    const wrong = mirror((_, path) => writeFileSync(path, 'not node'), false);
    const result = install(fakeNode(MINIMUM_NODE_MAJOR - 4), wrong, '--version');

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("does not match nodejs.org's SHA-256 sum; nothing was installed");
    expect(kept()).toEqual(before);
  });

  // Node.js 24 needs macOS 13.5 or glibc 2.28. The archives are tarballs, made with tar; a zip is not.
  it.skipIf(windows)('replaces nothing with a Node.js that does not start on this machine', () => {
    const kept = earlierInstall();
    const before = kept();
    const broken = mirror((name, path) => {
      const root = join(dir, 'archive', name);
      mkdirSync(join(root, 'bin'), { recursive: true });
      writeFileSync(join(root, 'bin', 'node'), '#!/bin/sh\nexit 134\n');
      chmodSync(join(root, 'bin', 'node'), 0o755);
      execFileSync('tar', ['-czf', path, '-C', join(dir, 'archive'), name]);
    }, true);

    const result = install(fakeNode(MINIMUM_NODE_MAJOR - 4), broken, '--version');

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('does not run on this system; nothing was installed');
    expect(kept()).toEqual(before);
  });

  it('leaves a jig-ui command of somebody else alone, before downloading anything', () => {
    mkdirSync(join(launcher, '..'), { recursive: true });
    writeFileSync(launcher, '#!/bin/sh\necho mine\n');

    const result = install(SYSTEM_PATH, pathToFileURL(join(dir, 'nowhere')).href, '--version');

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('is not one this installer wrote');
    expect(readFileSync(launcher, 'utf8')).toBe('#!/bin/sh\necho mine\n');
    expect(existsSync(data)).toBe(false);
  });

  it("downloads nothing where Node.js 24 is on PATH, and starts Jig UI through that Node's npx", () => {
    const result = install(fakeNode(MINIMUM_NODE_MAJOR), pathToFileURL(join(dir, 'nowhere')).href, '--version');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('npx --yes @fapost/jig-ui --version');
    expect(readFileSync(launcher, 'utf8')).toContain("# Written by Jig UI's install.sh");
    expect(existsSync(data)).toBe(false);
  });

  // Git's bash.exe puts its own tools, `uname` among them, ahead of the PATH it is given: the stand-in is never asked.
  it.skipIf(windows)('starts Jig UI with a Node.js 24 already here on a system nodejs.org has no archive for', () => {
    const result = install(
      fakeSystem('FreeBSD', 'amd64', fakeNode(MINIMUM_NODE_MAJOR)),
      pathToFileURL(join(dir, 'nowhere')).href,
      '--version',
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('npx --yes @fapost/jig-ui --version');
  });

  it.skipIf(windows)("asks for the ARM64 archive under Git for Windows' own ARM64 build, and none under Cygwin", () => {
    const wrong = mirror((_, path) => writeFileSync(path, 'not node'), false);
    const older = fakeNode(MINIMUM_NODE_MAJOR - 4);
    const arm = install(fakeSystem('CLANGARM64_NT-10.0-26100', 'aarch64', older), wrong, '--version');

    expect(arm.status, arm.stderr).toBe(1);
    expect(arm.stderr).toContain("node-v24.99.0-win-arm64.zip does not match nodejs.org's SHA-256 sum");

    rmSync(join(dir, 'fake-system'), { recursive: true });
    const cygwin = install(fakeSystem('CYGWIN_NT-10.0-19045', 'x86_64', older), wrong, '--version');

    expect(cygwin.status, cygwin.stderr).toBe(1);
    expect(cygwin.stderr).toContain('no Node.js is published for CYGWIN_NT-10.0-19045 x86_64');
  });
});
