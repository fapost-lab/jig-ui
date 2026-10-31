import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DIST_TAGS, later, newerRelease } from './release.js';

const tags = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('later', () => {
  it.each([
    ['0.6.0', '0.5.1', true],
    ['0.5.10', '0.5.9', true],
    ['1.0.0', '0.9.9', true],
    ['0.5.1', '0.5.1', false],
    ['0.5.0', '0.5.1', false],
    ['0.5.2-next.45', '0.5.2-next.41', true],
    ['0.6.1-next.1', '0.5.2-next.41', true],
    ['0.5.2-next.9', '0.5.2-next.10', false],
    ['0.6.0', 'garbage', false],
    ['v0.6.0', '0.5.1', false],
  ])('%s after %s: %s', (a, b, expected) => {
    expect(later(a, b)).toBe(expected);
  });
});

describe('newerRelease', () => {
  it('names a newer latest, with the stop command for npx, after asking the dist-tags only', async () => {
    const fetch = tags({ latest: '0.6.0', next: '0.6.1-next.3' });
    expect(await newerRelease('0.5.1', { fetch, env: {} })()).toEqual({ version: '0.6.0', stop: 'npx @fapost/jig-ui stop' });
    expect(fetch).toHaveBeenCalledWith(DIST_TAGS, expect.anything());
  });

  it('compares a development build with next', async () => {
    const fetch = tags({ latest: '0.6.0', next: '0.6.1-next.3' });
    expect(await newerRelease('0.6.1-next.2', { fetch, env: {} })()).toEqual({ version: '0.6.1-next.3', stop: 'npx @fapost/jig-ui stop' });
    expect(await newerRelease('0.6.1-next.3', { fetch, env: {} })()).toBeNull();
  });

  it.each([
    ['linux', {}, '/home/me/.local/share/jig-ui/node/bin/node', 'jig-ui stop'],
    ['linux', { XDG_DATA_HOME: '/data' }, '/data/jig-ui/node/bin/node', 'jig-ui stop'],
    ['win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me\\AppData\\Local\\jig-ui\\node\\node.exe', 'jig-ui stop'],
    ['linux', {}, '/usr/local/bin/node', 'npx @fapost/jig-ui stop'],
    ['linux', {}, '/home/me/.local/share/jig-ui/node-other/bin/node', 'npx @fapost/jig-ui stop'],
    ['win32', {}, 'C:\\Program Files\\nodejs\\node.exe', 'npx @fapost/jig-ui stop'],
  ] as const)('on %s with %o, a Node.js at %s is told %s', async (platform, env, execPath, stop) => {
    const newer = newerRelease('0.5.1', { fetch: tags({ latest: '0.6.0' }), env, execPath, platform, home: '/home/me' });
    expect((await newer())?.stop).toBe(stop);
  });

  it('knows its own Node.js when the data folder is reached through a symlink', async () => {
    const real = realpathSync.native(mkdtempSync(join(tmpdir(), 'jig-ui-release-')));
    mkdirSync(join(real, 'data', 'jig-ui', 'node'), { recursive: true });
    symlinkSync(join(real, 'data'), join(real, 'link'), 'junction'); // a junction needs no rights on Windows
    const env = process.platform === 'win32' ? { LOCALAPPDATA: join(real, 'link') } : { XDG_DATA_HOME: join(real, 'link') };
    // Node.js resolves symlinks in its own path.
    const execPath = join(real, 'data', 'jig-ui', 'node', 'bin', 'node');
    try {
      expect((await newerRelease('0.5.1', { fetch: tags({ latest: '0.6.0' }), env, execPath })())?.stop).toBe('jig-ui stop');
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });

  it('says nothing for the same or an older release, an answer it cannot read, a refusal or no network', async () => {
    expect(await newerRelease('0.6.0', { fetch: tags({ latest: '0.6.0' }), env: {} })()).toBeNull();
    expect(await newerRelease('0.7.0', { fetch: tags({ latest: '0.6.0' }), env: {} })()).toBeNull();
    expect(await newerRelease('0.5.1', { fetch: tags({ latest: 6 }), env: {} })()).toBeNull();
    expect(await newerRelease('0.5.1', { fetch: tags(['0.6.0']), env: {} })()).toBeNull();
    expect(await newerRelease('0.5.1', { fetch: tags({ latest: '0.6.0' }, 404), env: {} })()).toBeNull();
    const offline = vi.fn(async () => Promise.reject(new TypeError('fetch failed')));
    expect(await newerRelease('0.5.1', { fetch: offline, env: {} })()).toBeNull();
  });

  it('gives up on a registry that does not answer in time', async () => {
    const silent = vi.fn(
      async (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    );
    expect(await newerRelease('0.5.1', { fetch: silent, env: {}, timeoutMs: 20 })()).toBeNull();
  });

  it('asks at most once a day, whatever the answer was', async () => {
    let now = 0;
    const fetch = tags({ latest: '0.6.0' });
    const newer = newerRelease('0.5.1', { fetch, now: () => now, env: {} });
    await Promise.all([newer(), newer()]);
    now += 23 * 60 * 60 * 1000;
    await newer();
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 60 * 60 * 1000;
    await newer();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks nothing when NO_UPDATE_NOTIFIER is set', async () => {
    const fetch = tags({ latest: '0.6.0' });
    expect(await newerRelease('0.5.1', { fetch, env: { NO_UPDATE_NOTIFIER: '1' } })()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
