import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { addProject, readProjects, RegistryUnreadable, removeProject } from '../registry/projects.js';
import { connectable, projectState } from '../source/local.js';
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
  /** Jig UI's config directory, where the registry lives. */
  configDir: string;
  version?: string;
  /** Directory of the built page. */
  webRoot?: string;
}

const refuse = (c: Context, status: 404 | 422 | 500, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

/** The path the person typed, absolute; `~/` stands for their home. */
function absolute(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined;
  const expanded = path.trim().replace(/^~(?=$|[\\/])/, homedir());
  return isAbsolute(expanded) ? expanded : undefined;
}

export function createApp({ port, token, configDir, version = readPackageVersion(), webRoot = DEFAULT_WEB_ROOT }: AppOptions): Hono {
  const app = new Hono();
  app.use(localOnly(port));
  app.use(tokenAccess({ port, token }));
  app.onError((error, c) => {
    if (error instanceof RegistryUnreadable) return refuse(c, 500, 'registry-unreadable', error.message);
    console.error(error);
    return c.text('Internal Server Error', 500);
  });

  app.get('/api/instance', (c) => c.json({ version }));

  app.get('/api/projects', async (c) => {
    const projects = await readProjects(configDir);
    return c.json({ projects: await Promise.all(projects.map(projectState)) });
  });

  app.post('/api/projects', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const path = absolute((body as { path?: unknown } | undefined)?.path);
    if (path === undefined) return refuse(c, 422, 'usage', 'Give the absolute path of a project.');
    const found = await connectable(path);
    if ('code' in found) return refuse(c, 422, found.code, found.message);
    const { project, created } = await addProject(configDir, found.root);
    return c.json({ project: await projectState(project) }, created ? 201 : 200);
  });

  app.delete('/api/projects/:id', async (c) => {
    if (!(await removeProject(configDir, c.req.param('id')))) {
      return refuse(c, 404, 'not-connected', 'No connected project has this id.');
    }
    return c.body(null, 204);
  });
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  if (existsSync(join(webRoot, 'index.html'))) {
    app.use('/*', serveStatic({ root: webRoot }));
  } else {
    app.get('/', (c) => c.text('The page is not built. Run npm run build.', 503));
  }

  return app;
}
