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
import { type Place, type ProjectSource, RegistryUnreadable, type Written } from '../source/project-source.js';
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

const refuse = <S extends 404 | 409 | 422 | 500>(c: Context, status: S, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

/** The path the person typed, absolute; `~/` stands for their home. */
function absolute(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined;
  const expanded = path.trim().replace(/^~(?=$|[\\/])/, homedir());
  return isAbsolute(expanded) ? expanded : undefined;
}

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isRevision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;

/** Where a drop puts a task: after another, or to the top or bottom of its level; `undefined` for anything else. */
function place(v: unknown): Place | undefined {
  if (v === 'top' || v === 'bottom') return v;
  const [after, before] = [field(v, 'after'), field(v, 'before')];
  return isId(after) ? { after } : isId(before) ? { before } : undefined;
}

/** A priority as the page sends it: 0 to 5, or `null` for none. */
const isPriority = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 5);

/** A new task's id as Jig takes one (`jig_valid_id`): never empty, never led by `.` or `-`, so never a flag. */
const isNewId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(v);

/** A goal as `jig task new --goal` takes one: a line of text, at most 500 characters; Jig refuses the rest as `usage`. */
const isGoal = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= 500 && !/[\r\n]/.test(v);

/** The body of a write that names only a task: the task and the revision it was read at, `undefined` where invalid. */
function taskAt(body: unknown) {
  const [task, revision] = [field(body, 'task'), field(body, 'revision')];
  return { task: isId(task) ? task : undefined, revision: isRevision(revision) ? revision : undefined };
}

/** What a write came to, in the API's form. A refusal names no path: only Jig's code goes on. */
function written(c: Context, w: Written | undefined) {
  if (w === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
  if (w.state === 'written') return c.json({ written: true as const }, 200);
  if (w.state !== 'refused') return c.json({ project: w }, 200);
  if (w.code === 'stale-revision') return refuse(c, 409, w.code, 'The project changed since the board was read.');
  if (w.code === 'not-found') return refuse(c, 404, w.code, 'This project has no live task with this id.');
  return refuse(c, 422, w.code, 'Jig refused the change.');
}

/** An upgrade refused before it ran, in the API's form: under way already, none to make, or Jig's code. */
function upgradeRefused(c: Context, code: string) {
  if (code === 'running') return refuse(c, 409, code, 'An upgrade of this project is under way.');
  if (code === 'not-found') return refuse(c, 404, code, 'This project shows no upgrade of Jig to make.');
  return refuse(c, 422, code, 'Jig refused the upgrade.');
}

/**
 * The API, chained so that its type carries every route's answers: the page derives its types
 * from `AppType` and never declares them a second time.
 */
function apiRoutes(source: ProjectSource, version: string) {
  return (
    new Hono()
      .get('/api/instance', (c) => c.json({ version }, 200))

      .get('/api/workspace', async (c) => c.json({ projects: await source.workspace(), machine: source.machine() }, 200))

      // Moves this machine's Jig to its newest release and answers once it has: a git fetch, not minutes.
      .post('/api/self-update', async (c) => {
        const run = await source.selfUpdate();
        if (run.state === 'done') return c.json({ said: run.said }, 200);
        if (run.state === 'failed')
          return c.json({ error: { code: 'failed', message: 'Jig could not update itself on this machine.', reasons: run.reasons } }, 422);
        if (run.code === 'running') return refuse(c, 409, run.code, 'An upgrade is under way; try again once it ends.');
        return refuse(c, 404, run.code, 'No connected project has a Jig to run jig self-update through.');
      })

      // Answered at once: the projects are upgraded one at a time in the server, and the workspace shows each.
      .post('/api/upgrade-all', async (c) => {
        const started = await source.upgradeAll();
        if (started.state === 'started') return c.json({ started: true as const }, 202);
        return refuse(c, 409, started.code, 'An upgrade is under way; try again once it ends.');
      })

      .delete('/api/upgrade-all', (c) => {
        source.dismissUpgradeAll();
        return c.body(null, 204);
      })

      .get('/api/projects/:id/board', async (c) => {
        const id = c.req.param('id');
        const read = await source.tasks(id);
        if (read === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        if (read.state !== 'ready') return c.json({ board: read }, 200);
        const { state, finished, revision } = read;
        return c.json({ board: { id, state, columns: columns(read.tasks), finished, revision } }, 200);
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

      // A write carries the revision of the board it was based on; Jig refuses it if anything was written since.
      .post(
        '/api/projects/:id/queue/move',
        validator('json', (body: unknown) => {
          const [task, revision] = [field(body, 'task'), field(body, 'revision')];
          return {
            task: isId(task) ? task : undefined,
            place: place(field(body, 'place')),
            revision: isRevision(revision) ? revision : undefined,
          };
        }),
        async (c) => {
          const { task, place, revision } = c.req.valid('json');
          if (task === undefined || place === undefined || revision === undefined) {
            return refuse(c, 422, 'usage', 'Give a task, where it goes and the revision it was read at.');
          }
          return written(c, await source.move(c.req.param('id'), task, place, revision));
        },
      )

      .post(
        '/api/projects/:id/queue/priority',
        validator('json', (body: unknown) => {
          const [task, priority, revision] = [field(body, 'task'), field(body, 'priority'), field(body, 'revision')];
          return {
            task: isId(task) ? task : undefined,
            // `undefined` for anything but 0 to 5 or null: a priority left out is no priority of none
            priority: isPriority(priority) ? priority : undefined,
            revision: isRevision(revision) ? revision : undefined,
          };
        }),
        async (c) => {
          const { task, priority, revision } = c.req.valid('json');
          if (task === undefined || priority === undefined || revision === undefined) {
            return refuse(c, 422, 'usage', 'Give a task, a priority from 0 to 5 or null, and the revision it was read at.');
          }
          return written(c, await source.prioritise(c.req.param('id'), task, priority, revision));
        },
      )

      // An epic is named by its spec and ordered among the top level of the queue, as a task is in its own level.
      .post(
        '/api/projects/:id/queue/epic/move',
        validator('json', (body: unknown) => {
          const [epic, revision] = [field(body, 'epic'), field(body, 'revision')];
          return {
            epic: isId(epic) ? epic : undefined,
            place: place(field(body, 'place')),
            revision: isRevision(revision) ? revision : undefined,
          };
        }),
        async (c) => {
          const { epic, place, revision } = c.req.valid('json');
          if (epic === undefined || place === undefined || revision === undefined) {
            return refuse(c, 422, 'usage', 'Give an epic, where it goes and the revision it was read at.');
          }
          return written(c, await source.moveEpic(c.req.param('id'), epic, place, revision));
        },
      )

      .post(
        '/api/projects/:id/queue/epic/priority',
        validator('json', (body: unknown) => {
          const [epic, priority, revision] = [field(body, 'epic'), field(body, 'priority'), field(body, 'revision')];
          return {
            epic: isId(epic) ? epic : undefined,
            priority: isPriority(priority) ? priority : undefined,
            revision: isRevision(revision) ? revision : undefined,
          };
        }),
        async (c) => {
          const { epic, priority, revision } = c.req.valid('json');
          if (epic === undefined || priority === undefined || revision === undefined) {
            return refuse(c, 422, 'usage', 'Give an epic, a priority from 0 to 5 or null, and the revision it was read at.');
          }
          return written(c, await source.prioritiseEpic(c.req.param('id'), epic, priority, revision));
        },
      )

      // A pause is asked of the task, not made: Jig honours it at the task's next stage boundary.
      .post('/api/projects/:id/queue/pause', validator('json', taskAt), async (c) => {
        const { task, revision } = c.req.valid('json');
        if (task === undefined || revision === undefined) return refuse(c, 422, 'usage', 'Give a task and the revision it was read at.');
        return written(c, await source.requestPause(c.req.param('id'), task, revision));
      })

      .post('/api/projects/:id/queue/pause/cancel', validator('json', taskAt), async (c) => {
        const { task, revision } = c.req.valid('json');
        if (task === undefined || revision === undefined) return refuse(c, 422, 'usage', 'Give a task and the revision it was read at.');
        return written(c, await source.cancelPause(c.req.param('id'), task, revision));
      })

      .post('/api/projects/:id/tasks/resume', validator('json', taskAt), async (c) => {
        const { task, revision } = c.req.valid('json');
        if (task === undefined || revision === undefined) return refuse(c, 422, 'usage', 'Give a task and the revision it was read at.');
        return written(c, await source.resume(c.req.param('id'), task, revision));
      })

      // A new task carries no revision: it writes nothing that exists (adr-20261022-filing-a-task-carries-no-revision).
      .post(
        '/api/projects/:id/tasks',
        validator('json', (body: unknown) => {
          const [task, goal] = [field(body, 'task'), field(body, 'goal')];
          return { task: isNewId(task) ? task : undefined, goal: isGoal(goal) ? goal : undefined };
        }),
        async (c) => {
          const { task, goal } = c.req.valid('json');
          if (task === undefined || goal === undefined) {
            return refuse(
              c,
              422,
              'usage',
              'Give an id of letters, digits, ".", "_" or "-", not led by "." or "-", and a goal of one line.',
            );
          }
          const w = await source.fileTask(c.req.param('id'), task, goal);
          if (w?.state === 'refused' && w.code === 'already-exists') {
            return refuse(c, 409, w.code, 'The project has a task with this id, maybe a finished one.');
          }
          return written(c, w);
        },
      )

      // A dry run: what upgrading the project's Jig would do, changing nothing.
      .post('/api/projects/:id/upgrade/plan', async (c) => {
        const planned = await source.planUpgrade(c.req.param('id'));
        if (planned === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        if (planned.state === 'planned') return c.json({ plan: planned.plan }, 200);
        if (planned.state !== 'refused') return c.json({ project: planned }, 200);
        return upgradeRefused(c, planned.code);
      })

      // Answered at once: the upgrade runs on in the server, and the workspace shows it and then what it came to.
      .post('/api/projects/:id/upgrade', async (c) => {
        const started = await source.upgrade(c.req.param('id'));
        if (started === undefined) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        if (started.state === 'started') return c.json({ started: true as const }, 202);
        if (started.state !== 'refused') return c.json({ project: started }, 200);
        return upgradeRefused(c, started.code);
      })

      .delete('/api/projects/:id/upgrade', async (c) => {
        if (!(await source.dismissUpgrade(c.req.param('id')))) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
        return c.body(null, 204);
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
        const disconnected = await source.disconnect(c.req.param('id'));
        if (disconnected === 'upgrading')
          return refuse(c, 409, 'upgrading', 'The project is being upgraded; disconnect it once that ends.');
        if (!disconnected) return refuse(c, 404, 'not-connected', 'No connected project has this id.');
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
