import { describe, expect, it } from 'vitest';
import { createApp, readPackageVersion } from './app.js';

const PORT = 4870;
const app = createApp({ port: PORT });
const get = (path: string, headers: Record<string, string>) => app.request(path, { headers });

describe('createApp', () => {
  it('serves the placeholder page with the package version on /', async () => {
    const res = await get('/', { host: `127.0.0.1:${PORT}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('not built yet');
    expect(body).toContain(readPackageVersion());
  });

  it('serves nothing else', async () => {
    expect((await get('/anything', { host: `127.0.0.1:${PORT}` })).status).toBe(404);
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

  it('refuses a request without a Host header', async () => {
    expect((await app.request('/')).status).toBe(403);
  });
});
