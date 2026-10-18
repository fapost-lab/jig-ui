import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { localSource } from '../source/local.js';
import type { Change, ProjectSource } from '../source/project-source.js';
import { createApp, readPackageVersion } from './app.js';

const PORT = 4870;
const TOKEN = 'start-token';
const HOST = `127.0.0.1:${PORT}`;
const COOKIE = `jig-ui-${PORT}=${TOKEN}`;

const webRoot = mkdtempSync(join(tmpdir(), 'jig-ui-web-'));
writeFileSync(join(webRoot, 'index.html'), '<!doctype html><div id="app"></div>');
afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

const app = createApp({ port: PORT, token: TOKEN, source: localSource(join(webRoot, 'config')), webRoot });
const get = (path: string, headers: Record<string, string>) => app.request(path, { headers });

describe('createApp', () => {
  it('serves the built page on / without a token', async () => {
    const res = await get('/', { host: HOST });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="app"');
  });

  it('answers 503 when the page is not built', async () => {
    const bare = createApp({ port: PORT, token: TOKEN, source: localSource(join(webRoot, 'config')), webRoot: join(webRoot, 'missing') });
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

/**
 * A git clone whose `.ai/scripts/jig` answers `jig <version>` and an empty project to every JSON
 * read, refusing with a message that names a path; no Jig at all without a version.
 */
function project(name: string, version?: string, refuse = false, tasks: unknown[] = []): string {
  const dir = join(realpathSync.native(webRoot), name);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  if (version) {
    const data = `"data":{"attention":[],"housekeeping":null,"tasks":${JSON.stringify(tasks)},"hidden":0,"specs":[]}`;
    const error = `"error":{"code":"failed","message":"cannot read ${dir.replace(/\\/g, '/')}"}`;
    mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
    writeFileSync(
      join(dir, '.ai', 'scripts', 'jig'),
      `#!/usr/bin/env bash
[ "$1" = --version ] && { echo "jig ${version}"; exit 0; }
echo '{"schema":1,"revision":1,"generated_at":"x",${refuse ? error : data}}'
exit ${refuse ? 1 : 0}
`,
    );
  }
  return dir;
}

/** A task-list row in Jig's shape: started, nothing waiting, unless `more` says otherwise. */
const row = (id: string, more: Record<string, unknown> = {}) => ({
  id,
  class: 'T2',
  status: 'active',
  issue: null,
  goal: null,
  knowledge_consolidated: false,
  paused: false,
  created_at: '2026-10-17',
  updated_at: '2026-10-17',
  branch: `task/${id}`,
  base_branch: 'main',
  worktree: null,
  gate: null,
  autopilot: null,
  pull_request: null,
  housekeeping_flags: [],
  actions: [],
  ...more,
});

/** Fails when `text` carries the temporary root, raw or as JSON escapes it (a Windows path's backslashes). */
function expectNoPath(text: string): void {
  const root = realpathSync.native(webRoot);
  for (const form of [root, JSON.stringify(root).slice(1, -1), root.replace(/\\/g, '/')]) expect(text).not.toContain(form);
}

describe('/api/projects and /api/workspace', () => {
  const projects = createApp({ port: PORT, token: TOKEN, source: localSource(join(webRoot, 'projects-config')), webRoot });
  const call = (method: string, path: string, body?: unknown) =>
    projects.request(path, {
      method,
      headers: { host: HOST, cookie: COOKIE, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ready = project('ready', '0.29.0');
  const old = project('old', '0.26.0');
  const broken = project('broken', '0.29.0', true);
  const empty = { counts: { active: 0, paused: 0, ready: 0 }, attention: [], housekeepingStale: false };

  it('connects, lists and disconnects a project, by id only', async () => {
    const first = await call('POST', '/api/projects', { path: ready });
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ project: { id: 'ready', state: 'ready', jigVersion: '0.29.0', ...empty } });
    expect((await call('POST', '/api/projects', { path: join(ready, '.ai') })).status).toBe(200);

    expect((await call('POST', '/api/projects', { path: old })).status).toBe(201);
    expectNoPath(await (await call('POST', '/api/projects', { path: broken })).text());
    const list = await call('GET', '/api/workspace');
    const text = await list.text();
    expect(JSON.parse(text)).toEqual({
      projects: [
        { id: 'ready', state: 'ready', jigVersion: '0.29.0', ...empty },
        { id: 'old', state: 'unsupported', jigVersion: '0.26.0', minimum: '0.29.0' },
        { id: 'broken', state: 'unreadable', code: 'failed' },
      ],
    });
    expectNoPath(text);
    expect(text).not.toContain('"path"');

    expect((await call('DELETE', '/api/projects/old')).status).toBe(204);
    expect((await call('DELETE', '/api/projects/old')).status).toBe(404);
    expect(((await (await call('GET', '/api/workspace')).json()) as { projects: unknown[] }).projects).toHaveLength(2);
  });

  it("serves a project's board, its state when it is not readable, and 404 for an unknown id", async () => {
    const board = await call('GET', '/api/projects/ready/board');
    const text = await board.text();
    expect(JSON.parse(text)).toEqual({
      board: {
        id: 'ready',
        state: 'ready',
        finished: 0,
        columns: ['needs-you', 'in-progress', 'ready', 'backlog', 'paused'].map((id) => expect.objectContaining({ id, cards: [] })),
      },
    });
    expectNoPath(text);
    const unreadable = await (await call('GET', '/api/projects/broken/board')).text();
    expect(JSON.parse(unreadable)).toEqual({ board: { id: 'broken', state: 'unreadable', code: 'failed' } });
    expectNoPath(unreadable);
    expect((await call('GET', '/api/projects/nobody/board')).status).toBe(404);
  });

  it("serves a project's specs, its state when it is not readable, and 404 for an unknown id", async () => {
    const text = await (await call('GET', '/api/projects/ready/specs')).text();
    expect(JSON.parse(text)).toEqual({ specs: { state: 'ready', specs: [] } });
    expectNoPath(text);
    expect(await (await call('GET', '/api/projects/broken/specs')).json()).toEqual({
      specs: { id: 'broken', state: 'unreadable', code: 'failed' },
    });
    expect((await call('GET', '/api/projects/nobody/specs')).status).toBe(404);
  });

  it('puts the cards of a project in their columns and carries no worktree path', async () => {
    const tree = join(realpathSync.native(webRoot), 'tree-of-busy').replace(/\\/g, '/');
    const busy = project('busy', '0.29.0', false, [
      row('a', { branch: null }),
      row('b', { worktree: { path: tree, uncommitted: 1 }, gate: { state: 'waiting', by: null } }),
      row('c', { status: 'ready' }),
    ]);
    await call('POST', '/api/projects', { path: busy });
    const text = await (await call('GET', '/api/projects/busy/board')).text();
    const { board } = JSON.parse(text) as {
      board: {
        columns: {
          id: string;
          cards: { id: string }[];
        }[];
      };
    };
    expect(Object.fromEntries(board.columns.map((c) => [c.id, c.cards.map((t) => t.id)]))).toEqual({
      backlog: ['a'],
      'in-progress': [],
      'needs-you': ['b'],
      paused: [],
      ready: ['c'],
    });
    expectNoPath(text);
  });

  it('serves one task in full with its column, never a worktree path or a refusal naming one', async () => {
    const tree = join(realpathSync.native(webRoot), 'tree-of-detailed').replace(/\\/g, '/');
    const detailed = project('detailed', '0.29.0', false, [
      row('w', {
        worktree: { path: tree, uncommitted: 2 },
        gate: { state: 'waiting', by: null },
        actions: [
          { id: 'approve-gate', command: 'jig task gate w approved', offered: true, reason: null },
          { id: 'start', command: 'jig task start w', offered: false, reason: `checked out in ${tree}` },
        ],
      }),
    ]);
    await call('POST', '/api/projects', { path: detailed });
    const res = await call('GET', '/api/projects/detailed/tasks/w');
    const text = await res.text();
    expect(JSON.parse(text).task).toMatchObject({
      state: 'ready',
      id: 'w',
      column: { id: 'needs-you', title: 'Needs you' },
      worktree: { uncommitted: 2 },
      actions: [{ id: 'approve-gate', command: 'jig task gate w approved' }],
    });
    expectNoPath(text);
    expect((await call('GET', '/api/projects/detailed/tasks/nobody')).status).toBe(404);
    expect(((await (await call('GET', '/api/projects/detailed/tasks/nobody')).json()) as { error: { code: string } }).error.code).toBe(
      'not-found',
    );
    expect((await call('GET', '/api/projects/nobody/tasks/w')).status).toBe(404);
    expect(JSON.parse(await (await call('GET', '/api/projects/broken/tasks/w')).text()).task).toEqual({
      id: 'broken',
      state: 'unreadable',
      code: 'failed',
    });
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
    expectNoPath(text);
  });

  it.each([
    ['no JSON', { 'content-type': 'application/json' }, '{', 400],
    ['no body', {}, undefined, 422],
  ])('refuses a connect with %s as usage, in the API form', async (_what, headers, body, status) => {
    const res = await projects.request('/api/projects', { method: 'POST', headers: { host: HOST, cookie: COOKIE, ...headers }, body });
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('usage');
  });

  it('refuses every call without the token', async () => {
    expect((await projects.request('/api/workspace', { headers: { host: HOST } })).status).toBe(401);
    expect((await projects.request('/api/projects', { method: 'POST', headers: { host: HOST } })).status).toBe(401);
    expect((await projects.request('/api/projects/ready/specs', { headers: { host: HOST } })).status).toBe(401);
  });

  it('reports an unreadable registry and leaves it as it is', async () => {
    const dir = join(webRoot, 'broken-config');
    mkdirSync(dir);
    writeFileSync(join(dir, 'projects.json'), '{');
    const unreadable = createApp({ port: PORT, token: TOKEN, source: localSource(dir), webRoot });
    const res = await unreadable.request('/api/workspace', { headers: { host: HOST, cookie: COOKIE } });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('registry-unreadable');
  });

  it('answers an error it did not foresee in JSON, without its message', async () => {
    const failing: ProjectSource = {
      ...localSource(join(webRoot, 'failing-config')),
      workspace: () => Promise.reject(new Error('EACCES: /home/someone/.config/jig-ui')),
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await createApp({ port: PORT, token: TOKEN, source: failing, webRoot }).request('/api/workspace', {
      headers: { host: HOST, cookie: COOKIE },
    });
    quiet.mockRestore();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe('internal');
    expectNoPath(text);
  });
});

describe('headers', () => {
  it.each([
    ['the page', { host: HOST }, 200],
    ['an API answer', { host: HOST, cookie: COOKIE }, 200],
    ['a refusal', { host: 'evil.example' }, 403],
  ])('sets the security headers on %s', async (_what, headers, status) => {
    const res = await get(status === 200 && 'cookie' in headers ? '/api/instance' : '/', headers);
    expect(res.status).toBe(status);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });
});

describe('/api/events', () => {
  const listeners = new Set<(change: Change) => void>();
  const source: ProjectSource = {
    ...localSource(join(webRoot, 'events-config')),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const events = createApp({ port: PORT, token: TOKEN, source, webRoot });

  it('is refused without the token', async () => {
    expect((await events.request('/api/events', { headers: { host: HOST } })).status).toBe(401);
  });

  it('streams each change as a signal naming the project by id, and ends the subscription with the stream', async () => {
    const res = await events.request('/api/events', { headers: { host: HOST, cookie: COOKIE } });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await until(() => listeners.size === 1);
    for (const listener of listeners) listener({ id: 'busy', revision: 9 });
    const text = new TextDecoder().decode((await reader.read()).value);
    expect(text).toBe('event: changed\ndata: {"project":"busy","revision":9}\n\n');
    expectNoPath(text);
    await reader.cancel();
    await until(() => listeners.size === 0);
    expect(listeners.size).toBe(0);
  });
});

async function until(done: () => boolean, ms = 2_000): Promise<void> {
  for (let waited = 0; !done() && waited < ms; waited += 10) await new Promise((r) => setTimeout(r, 10));
}
