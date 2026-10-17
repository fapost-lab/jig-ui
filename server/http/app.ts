import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { localOnly, tokenAccess } from './access.js';

/**
 * Reads the version from the package's own package.json. The relative path is the same from
 * `server/http/` (tests) and `dist/http/` (published), as both sit two levels below the root.
 */
export function readPackageVersion(): string {
  const url = new URL('../../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version: string };
  return pkg.version;
}

/** The built page: `dist/web`, next to `dist/http` where this file runs when published. */
export const DEFAULT_WEB_ROOT = fileURLToPath(new URL('../web', import.meta.url));

export interface AppOptions {
  /** The port the server listens on; `Host` and `Origin` must name it. */
  port: number;
  /** This start's token; the browser swaps it for a cookie that every API call must carry. */
  token: string;
  version?: string;
  /** Directory of the built page. */
  webRoot?: string;
}

export function createApp({ port, token, version = readPackageVersion(), webRoot = DEFAULT_WEB_ROOT }: AppOptions): Hono {
  const app = new Hono();
  app.use(localOnly(port));
  app.use(tokenAccess({ port, token }));

  app.get('/api/instance', (c) => c.json({ version }));
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  if (existsSync(join(webRoot, 'index.html'))) {
    app.use('/*', serveStatic({ root: webRoot }));
  } else {
    app.get('/', (c) => c.text('The page is not built. Run npm run build.', 503));
  }

  return app;
}
