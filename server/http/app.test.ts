import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

const app = createApp({ port: PORT, token: TOKEN, webRoot });
const get = (path: string, headers: Record<string, string>) => app.request(path, { headers });

describe('createApp', () => {
  it('serves the built page on / without a token', async () => {
    const res = await get('/', { host: HOST });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="app"');
  });

  it('answers 503 when the page is not built', async () => {
    const bare = createApp({ port: PORT, token: TOKEN, webRoot: join(webRoot, 'missing') });
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
