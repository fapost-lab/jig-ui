import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp, readPackageVersion } from './app.js';

const PORT = 4870;
const TOKEN = 'start-token';
const HOST = `127.0.0.1:${PORT}`;
const COOKIE = `jig-ui-${PORT}=${TOKEN}`;

const webRoot = mkdtempSync(join(tmpdir(), 'jig-ui-web-'));
writeFileSync(join(webRoot, 'index.html'), '<!doctype html><div id="app"></div>');
afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

const app = createApp({ port: PORT, token: TOKEN, configDir: join(webRoot, 'config'), webRoot });
const get = (path: string, headers: Record<string, string>) => app.request(path, { headers });

describe('createApp', () => {
  it('serves the built page on / without a token', async () => {
    const res = await get('/', { host: HOST });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="app"');
  });

  it('answers 503 when the page is not built', async () => {
    const bare = createApp({ port: PORT, token: TOKEN, configDir: join(webRoot, 'config'), webRoot: join(webRoot, 'missing') });
    expect((await bare.request('/', { headers: { host: HOST } })).status).toBe(503);
  });

  it('serves the package version on /api/instance with the cookie', async () => {
    const res = await get('/api/instance', { host: HOST, cookie: COOKIE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: readPackageVersion() });
  });

  it('answers an unknown API path with 404 only after the token', async () => {
    expect((await get('/api/nope', { host: HOST, cookie: COOKIE })).status).toBe(404);
    expect((await get('/api/nope', { host: HOST })).status).toBe(401);
  });
});

describe('token', () => {
  it('swaps the right token for a cookie and redirects to /', async () => {
    const res = await get(`/?token=${TOKEN}`, { host: HOST });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(COOKIE);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it.each(['wrong', '', `${TOKEN}x`])('refuses token %j without a cookie', async (token) => {
    const res = await get(`/?token=${token}`, { host: HOST });
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    ['no cookie', undefined],
    ['a wrong token', `jig-ui-${PORT}=wrong`],
    ['the cookie of another port', `jig-ui-${PORT + 1}=${TOKEN}`],
  ])('refuses /api with %s', async (_, cookie) => {
    const res = await get('/api/instance', cookie ? { host: HOST, cookie } : { host: HOST });
    expect(res.status).toBe(401);
  });
});

describe('access guard', () => {
  it.each([
    [`127.0.0.1:${PORT}`, undefined],
    [`localhost:${PORT}`, undefined],
    [`localhost:${PORT}`, `http://localhost:${PORT}`],
    [`127.0.0.1:${PORT}`, `http://127.0.0.1:${PORT}`],
  ])('allows host %s with origin %s', async (host, origin) => {
    const res = await get('/', origin ? { host, origin } : { host });
    expect(res.status).toBe(200);
  });

  it.each([
    ['evil.example', undefined],
    ['evil.example:4870', undefined],
    ['127.0.0.1', undefined],
    [`127.0.0.1:${PORT + 1}`, undefined],
    [`127.0.0.1:${PORT}`, 'http://evil.example'],
    [`127.0.0.1:${PORT}`, `http://localhost:${PORT + 1}`],
    [`127.0.0.1:${PORT}`, `https://127.0.0.1:${PORT}`],
    [`127.0.0.1:${PORT}`, 'null'],
  ])('refuses host %s with origin %s', async (host, origin) => {
    const res = await get('/', origin ? { host, origin } : { host });
    expect(res.status).toBe(403);
  });

  it.each([`/?token=${TOKEN}`, '/api/instance'])('guards %s too', async (path) => {
    expect((await get(path, { host: 'evil.example', cookie: COOKIE })).status).toBe(403);
    expect((await get(path, { host: HOST, origin: 'http://evil.example', cookie: COOKIE })).status).toBe(403);
  });

  it('refuses a request without a Host header', async () => {
    expect((await app.request('/')).status).toBe(403);
  });
});

/** A git clone whose `.ai/scripts/jig` answers `jig <version>`; no Jig at all without a version. */
function project(name: string, version?: string): string {
  const dir = join(realpathSync.native(webRoot), name);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  if (version) {
    mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\necho "jig ${version}"\n`);
  }
  return dir;
}

describe('/api/projects', () => {
  const projects = createApp({ port: PORT, token: TOKEN, configDir: join(webRoot, 'projects-config'), webRoot });
  const call = (method: string, path: string, body?: unknown) =>
    projects.request(path, {
      method,
      headers: { host: HOST, cookie: COOKIE, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ready = project('ready', '0.29.0');
  const old = project('old', '0.26.0');

  it('connects, lists and disconnects a project, by id only', async () => {
    const first = await call('POST', '/api/projects', { path: ready });
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ project: { id: 'ready', state: 'ready', jigVersion: '0.29.0' } });
    expect((await call('POST', '/api/projects', { path: join(ready, '.ai') })).status).toBe(200);

    const old201 = await call('POST', '/api/projects', { path: old });
    expect(old201.status).toBe(201);
    const list = await call('GET', '/api/projects');
    const text = await list.text();
    expect(JSON.parse(text)).toEqual({
      projects: [
        { id: 'ready', state: 'ready', jigVersion: '0.29.0' },
        { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' },
      ],
    });
    expect(text).not.toContain(realpathSync.native(webRoot));
    expect(text).not.toContain('"path"');

    expect((await call('DELETE', '/api/projects/old')).status).toBe(204);
    expect((await call('DELETE', '/api/projects/old')).status).toBe(404);
    expect(((await (await call('GET', '/api/projects')).json()) as { projects: unknown[] }).projects).toHaveLength(1);
  });

  it.each([
    ['usage', () => ({})],
    ['usage', () => ({ path: 'relative/dir' })],
    ['not-a-repository', () => ({ path: join(webRoot, 'nowhere') })],
    ['no-jig', () => ({ path: project('plain') })],
    [
      'worktree',
      () => {
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: ready });
        execFileSync('git', ['worktree', 'add', '-q', '--detach', join(webRoot, 'tree')], { cwd: ready });
        return { path: join(webRoot, 'tree') };
      },
    ],
  ])('refuses with %s, naming no path', async (code, body) => {
    const res = await call('POST', '/api/projects', body());
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe(code);
    expect(text).not.toContain(realpathSync.native(webRoot));
  });

  it('refuses every call without the token', async () => {
    expect((await projects.request('/api/projects', { headers: { host: HOST } })).status).toBe(401);
    expect((await projects.request('/api/projects', { method: 'POST', headers: { host: HOST } })).status).toBe(401);
  });

  it('reports an unreadable registry and leaves it as it is', async () => {
    const dir = join(webRoot, 'broken-config');
    mkdirSync(dir);
    writeFileSync(join(dir, 'projects.json'), '{');
    const broken = createApp({ port: PORT, token: TOKEN, configDir: dir, webRoot });
    const res = await broken.request('/api/projects', { headers: { host: HOST, cookie: COOKIE } });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('registry-unreadable');
  });
});
