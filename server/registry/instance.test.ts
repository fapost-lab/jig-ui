import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../http/app.js';
import { configDir } from './config-dir.js';
import {
  type InstanceInfo,
  OPEN_FILE,
  probeInstance,
  readInstance,
  removeInstance,
  writeConfigFile,
  writeInstance,
} from './instance.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-config-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const fresh = () => join(mkdtempSync(join(root, 'case-')), 'jig-ui');
const info: InstanceInfo = { port: 4870, token: 'one', pid: 1, version: '0.1.0' };

describe('configDir', () => {
  it('follows each system', () => {
    expect(configDir({ XDG_CONFIG_HOME: '/x' }, 'linux', '/home/u')).toBe('/x/jig-ui');
    expect(configDir({}, 'linux', '/home/u')).toBe('/home/u/.config/jig-ui');
    expect(configDir({}, 'darwin', '/Users/u')).toBe('/Users/u/.config/jig-ui');
    expect(configDir({ APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, 'win32', 'C:\\Users\\u')).toBe(
      'C:\\Users\\u\\AppData\\Roaming\\jig-ui',
    );
  });
});

describe('instance file', () => {
  it('reads back what was written', async () => {
    const dir = fresh();
    expect(await readInstance(dir)).toBeUndefined();
    await writeInstance(dir, info);
    expect(await readInstance(dir)).toEqual(info);
  });

  it.skipIf(process.platform === 'win32')('is readable only by the user', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'instance.json')).mode & 0o777).toBe(0o600);
  });

  it('treats a broken file as no instance', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    writeFileSync(join(dir, 'instance.json'), '{"port":');
    expect(await readInstance(dir)).toBeUndefined();
  });

  it('is removed, with the redirect page, only by the instance that owns it', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const page = await writeConfigFile(dir, OPEN_FILE, '<!doctype html>');
    await removeInstance(dir, 'another');
    expect(await readInstance(dir)).toEqual(info);
    expect(existsSync(page)).toBe(true);
    await removeInstance(dir, 'one');
    expect(await readInstance(dir)).toBeUndefined();
    expect(existsSync(page)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('writes the redirect page readable only by the user', async () => {
    const page = await writeConfigFile(fresh(), OPEN_FILE, '<!doctype html>');
    expect(statSync(page).mode & 0o777).toBe(0o600);
  });
});

describe('probeInstance', () => {
  it('is true only for an instance that answers with that token', async () => {
    const token = 'live-token';
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: (req) => app().fetch(req), hostname: '127.0.0.1', port: 0 }, () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;
    const app = () => createApp({ port, token, configDir: root, version: '0.1.0' });
    try {
      expect(await probeInstance({ ...info, port, token })).toBe(true);
      expect(await probeInstance({ ...info, port, token: 'stale' })).toBe(false);
    } finally {
      server.close();
    }
    expect(await probeInstance({ ...info, port, token })).toBe(false);
  });
});
