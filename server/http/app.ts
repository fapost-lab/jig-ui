import { readFileSync } from 'node:fs';
import { Hono, type MiddlewareHandler } from 'hono';

/**
 * Reads the version from the package's own package.json. The relative path is the same from
 * `server/http/` (tests) and `dist/http/` (published), as both sit two levels below the root.
 */
export function readPackageVersion(): string {
  const url = new URL('../../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version: string };
  return pkg.version;
}

export interface AppOptions {
  /** The port the server listens on; `Host` and `Origin` must name it. */
  port: number;
  version?: string;
}

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

export function createApp({ port, version = readPackageVersion() }: AppOptions): Hono {
  const app = new Hono();
  app.use(localOnly(port));

  app.get('/', (c) =>
    c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jig UI</title>
  </head>
  <body>
    <h1>Jig UI &mdash; not built yet</h1>
    <p>Version ${version}</p>
  </body>
</html>
`),
  );

  return app;
}
