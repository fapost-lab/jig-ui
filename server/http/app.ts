import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import { validator } from 'hono/validator';
import { columns, placeOf } from '../board/columns.js';
import { type ProjectSource, RegistryUnreadable } from '../source/project-source.js';
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
  /** Where the connected projects are read and changed. */
  source: ProjectSource;
  version?: string;
  /** Directory of the built page. */
  webRoot?: string;
}

/** How often an idle stream sends a comment, so a closed tab is noticed and its subscription ends. */
const PING_MS = 30_000;

const refuse = <S extends 404 | 422 | 500>(c: Context, status: S, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

/** The path the person typed, absolute; `~/` stands for their home. */
function absolute(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined;
  const expanded = path.trim().replace(/^~(?=$|[\\/])/, homedir());
  return isAbsolute(expanded) ? expanded : undefined;
}

/**
 * The API, chained so that its type carries every route's answers: the page derives its types
 * from `AppType` and never declares them a second time.
 */
function apiRoutes(source: ProjectSource, version: string) {
  return (
    new Hono()
      .get('/api/instance', (c) => c.json({ version }, 200))

      .get('/api/workspace', async (c) => c.json({ projects: await source.workspace() }, 200))

      .get('/api/projects/:id/board', async (c) => {
        const id = c.req.param('id');
        const read = await source.tasks(id);
        if (read === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        if (read.state !== 'ready') return c.json({ board: read }, 200);
        return c.json({ board: { id, state: read.state, columns: columns(read.tasks), finished: read.finished } }, 200);
      })

      .get('/api/projects/:id/tasks/:task', async (c) => {
        const read = await source.task(c.req.param('id'), c.req.param('task'));
        if (read === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        if (read.state !== 'ready') return c.json({ task: read }, 200);
        if (read.task === null) return refuse(c, 404, 'not-found', 'This project has no live task with this id.');
        return c.json({ task: { state: read.state, ...read.task, column: placeOf(read.task) } }, 200);
      })

      .get('/api/projects/:id/specs', async (c) => {
        const read = await source.specs(c.req.param('id'));
        if (read === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        return c.json({ specs: read }, 200);
      })

      .post(
        '/api/projects',
        validator('json', (body: unknown) => ({
          path: absolute((body as { path?: unknown } | null)?.path),
        })),
        async (c) => {
          const { path } = c.req.valid('json');
          if (path === undefined) return refuse(c, 422, 'usage', 'Give the absolute path of a project.');
          const result = await source.connect(path);
          if ('code' in result) return refuse(c, 422, result.code, result.message);
          return result.created ? c.json({ project: result.project }, 201) : c.json({ project: result.project }, 200);
        },
      )

      .delete('/api/projects/:id', async (c) => {
        if (!(await source.disconnect(c.req.param('id')))) {
          return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        }
        return c.body(null, 204);
      })

      // A signal, not data: the page re-fetches what it shows (adr-20261014-project-source-port-keeps-hosting-open).
      .get('/api/events', (c) =>
        streamSSE(c, async (stream) => {
          const unsubscribe = source.subscribe(({ id, revision }) => {
            void stream.writeSSE({ event: 'changed', data: JSON.stringify({ project: id, revision }) });
          });
          stream.onAbort(unsubscribe);
          while (!stream.aborted) {
            await stream.sleep(PING_MS);
            if (!stream.aborted) await stream.write(': ping\n\n');
          }
        }),
      )
  );
}

/** The API's type, for the page; `import type` only, so no server code reaches its bundle. */
export type AppType = ReturnType<typeof apiRoutes>;

export function createApp({ port, token, source, version = readPackageVersion(), webRoot = DEFAULT_WEB_ROOT }: AppOptions): Hono {
  const app = new Hono();
  // Before the guard, so its refusals carry them too; HSTS means nothing on http://127.0.0.1.
  app.use(secureHeaders({ strictTransportSecurity: false }));
  app.use(localOnly(port));
  app.use(tokenAccess({ port, token }));
  app.onError((error, c) => {
    if (error instanceof RegistryUnreadable) return refuse(c, 500, 'registry-unreadable', error.message);
    // Hono's own refusals, such as a body that is no JSON: their status, in the API's form.
    if (error instanceof HTTPException) return c.json({ error: { code: 'usage', message: error.message } }, error.status);
    // Only the terminal hears what failed: the message may name a path.
    console.error(error);
    return refuse(c, 500, 'internal', 'Jig UI hit an error it did not expect; its terminal says what.');
  });

  app.route('/', apiRoutes(source, version));
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  if (existsSync(join(webRoot, 'index.html'))) {
    app.use('/*', serveStatic({ root: webRoot }));
  } else {
    app.get('/', (c) => c.text('The page is not built. Run npm run build.', 503));
  }

  return app;
}
