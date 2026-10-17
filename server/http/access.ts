import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { cookieName } from '../registry/instance.js';

/** Refuses requests whose `Host` or `Origin` is not this server's own loopback address. */
export function localOnly(port: number): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  return async (c, next) => {
    const host = c.req.header('host');
    const origin = c.req.header('origin');
    if (host === undefined || !hosts.has(host.toLowerCase())) {
      return c.text('Forbidden', 403);
    }
    if (origin !== undefined && !origins.has(origin.toLowerCase())) {
      return c.text('Forbidden', 403);
    }
    await next();
  };
}

function sameSecret(given: string | undefined, token: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The per-start token: `/?token=` swaps it for a cookie and redirects to `/`, and every `/api/*`
 * request without that cookie is refused. Static files need no token; they carry no data.
 */
export function tokenAccess({ port, token }: { port: number; token: string }): MiddlewareHandler {
  const cookie = cookieName(port);
  return async (c, next) => {
    const path = c.req.path;
    if (path === '/' && c.req.query('token') !== undefined) {
      if (!sameSecret(c.req.query('token'), token)) return c.text('Forbidden', 403);
      setCookie(c, cookie, token, { httpOnly: true, sameSite: 'Strict', path: '/' });
      return c.redirect('/', 302);
    }
    if ((path === '/api' || path.startsWith('/api/')) && !sameSecret(getCookie(c, cookie), token)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };
}
