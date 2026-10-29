import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../http/app.js';
import { localSource } from '../source/local.js';
import type { ProjectSource } from '../source/project-source.js';
import { configDir } from './config-dir.js';
import {
  askInstance,
  connectThrough,
  type InstanceInfo,
  OPEN_FILE,
  probeInstance,
  readInstance,
  removeInstance,
  requestStop,
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
    writeFileSync(join(dir, 'instance.json'), JSON.stringify({ ...info, token: undefined }));
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
    const app = () => createApp({ port, token, source: localSource(root), version: '0.1.0' });
    try {
      expect(await probeInstance({ ...info, port, token })).toBe(true);
      expect(await probeInstance({ ...info, port, token: 'stale' })).toBe(false);
    } finally {
      server.close();
    }
    expect(await probeInstance({ ...info, port, token })).toBe(false);
  });
});

describe('connectThrough', () => {
  it('connects through the instance with its token, and passes on a refusal', async () => {
    const token = 'live-token';
    const asked: string[] = [];
    const source = {
      connect: async (path: string) => {
        asked.push(path);
        if (path === '/broken') throw new Error('EACCES');
        return path === '/p' ? { project: { id: 'p' }, created: true } : { code: 'no-jig', message: 'There is no Jig.' };
      },
    } as unknown as ProjectSource;
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: (req) => app().fetch(req), hostname: '127.0.0.1', port: 0 }, () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;
    const app = () => createApp({ port, token, source, version: '0.1.0' });
    try {
      expect(await connectThrough({ ...info, port, token }, '/p')).toEqual({ id: 'p', created: true });
      expect(await connectThrough({ ...info, port, token }, '/q')).toEqual({ code: 'no-jig', message: 'There is no Jig.' });
      expect(await connectThrough({ ...info, port, token: 'stale' }, '/p')).toMatchObject({ code: 'unexpected' });
      expect(await connectThrough({ ...info, port, token }, '/broken')).toMatchObject({ code: 'internal' });
      expect(asked).toEqual(['/p', '/q', '/broken']);
    } finally {
      server.close();
    }
    expect(await connectThrough({ ...info, port, token }, '/p')).toMatchObject({ code: 'unreachable' });
  });
});

/** A Jig UI server on a free port, as `main.ts` serves it. */
async function listening(
  token: string,
  stop?: () => void,
): Promise<{
  port: number;
  close: () => void;
}> {
  let port = 0;
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve(
      {
        fetch: (req) => createApp({ port, token, source: localSource(root), version: '0.1.0', stop }).fetch(req),
        hostname: '127.0.0.1',
        port: 0,
      },
      () => resolve(s),
    );
  });
  port = (server.address() as { port: number }).port;
  // As `main.ts` stops: kept-alive connections go too, so the port refuses at once.
  const close = () => {
    server.close();
    if ('closeAllConnections' in server) server.closeAllConnections();
  };
  return { port, close };
}

describe('askInstance', () => {
  it('tells the instance from a port that refuses or answers as someone else', async () => {
    const token = 'live-token';
    const { port, close } = await listening(token);
    try {
      expect(await askInstance({ port, token })).toBe('up');
      expect(await askInstance({ port, token: 'stale' })).toBe('gone');
    } finally {
      close();
    }
    expect(await askInstance({ port, token })).toBe('gone');
  });

  it('is silent, not gone, when the port takes the connection and never answers', async () => {
    const server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      expect(await askInstance({ port, token: 't' }, 200)).toBe('silent');
    } finally {
      server.close();
    }
  });
});

describe('requestStop', () => {
  it('asks the instance to stop with its token', async () => {
    const token = 'live-token';
    const stop = vi.fn();
    const { port, close } = await listening(token, stop);
    try {
      expect(await requestStop({ port, token })).toBe('stopping');
      await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    } finally {
      close();
    }
    expect(await requestStop({ port, token })).toBe('unreachable');
  });

  it('is unsupported where the instance has no such endpoint', async () => {
    const token = 'live-token';
    const { port, close } = await listening(token);
    try {
      expect(await requestStop({ port, token })).toBe('unsupported');
    } finally {
      close();
    }
  });
});
