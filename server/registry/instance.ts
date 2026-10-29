import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/** What a running instance records so that a second start can find it. */
const InstanceInfo = z.object({ port: z.int(), token: z.string(), pid: z.int(), version: z.string() });
export type InstanceInfo = z.output<typeof InstanceInfo>;

const FILE = 'instance.json';
/** The page that sends the browser on to the instance; it carries the token, so it lives here too. */
export const OPEN_FILE = 'open.html';

/** The cookie that carries the token; named by port, as browsers do not separate cookies by port. */
export const cookieName = (port: number): string => `jig-ui-${port}`;

export async function readInstance(dir: string): Promise<InstanceInfo | undefined> {
  try {
    return InstanceInfo.safeParse(JSON.parse(await readFile(join(dir, FILE), 'utf8'))).data;
  } catch {
    return undefined;
  }
}

/** Writes a file of the config directory atomically (temp file, then rename), readable only by the user. */
export async function writeConfigFile(dir: string, name: string, content: string): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `${name}.${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, join(dir, name));
  return join(dir, name);
}

export async function writeInstance(dir: string, info: InstanceInfo): Promise<void> {
  await writeConfigFile(dir, FILE, `${JSON.stringify(info, null, 2)}\n`);
}

/** Removes the files only while they are still ours: an instance started after us may have replaced them. */
export async function removeInstance(dir: string, token: string): Promise<void> {
  if ((await readInstance(dir))?.token !== token) return;
  await rm(join(dir, OPEN_FILE), { force: true });
  await rm(join(dir, FILE), { force: true });
}

/**
 * What a probe heard on the instance's port. `up`: the instance, with its token. `gone`: a refused
 * connection, or an answer that is not the instance's — it is not there, and its file is stale.
 * `silent`: no answer in time — it may be alive and busy, so nothing may treat its file as stale.
 */
export type Answer = 'up' | 'gone' | 'silent';

const causeCode = (error: unknown): string | undefined => (error as { cause?: { code?: string } }).cause?.code;
/** A connection refused outright: nothing listens on the port. */
const refused = (error: unknown): boolean => causeCode(error) === 'ECONNREFUSED';

export async function askInstance(info: Pick<InstanceInfo, 'port' | 'token'>, timeoutMs = 1000): Promise<Answer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${info.port}/api/instance`, {
        headers: { cookie: `${cookieName(info.port)}=${info.token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // An unread body holds the connection, and the next probe of a stop's wait would queue behind it.
      await res.body?.cancel();
      return res.ok ? 'up' : 'gone';
    } catch (error) {
      if (refused(error)) return 'gone';
      // A kept-alive connection to a server that has since stopped breaks (reset, or closed as it
      // is used, as on Linux); only a timeout means silence, and a new connection tells the rest.
      if ((error as Error).name !== 'TimeoutError' && attempt === 0) continue;
      return 'silent';
    }
  }
}

/** True when an instance answers on its port with its token; a crash leaves the file behind. */
export async function probeInstance(info: InstanceInfo, timeoutMs = 1000): Promise<boolean> {
  return (await askInstance(info, timeoutMs)) === 'up';
}

/** What a connect through a running instance came to: the project's id, or the code and message it was refused with. */
export type Connected =
  | {
      id: string;
      created: boolean;
    }
  | {
      code: string;
      message: string;
    };

// An instance before 0.2.0 answers a failure it did not foresee in plain text: neither of these.
const Reply = z.union([
  z.object({ project: z.object({ id: z.string() }) }),
  z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
]);

/** Asks the instance to connect `path`, as the page does: the instance owns the registry, so no second process writes it. */
export async function connectThrough(info: Pick<InstanceInfo, 'port' | 'token'>, path: string, timeoutMs = 15_000): Promise<Connected> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/projects`, {
      method: 'POST',
      headers: { cookie: `${cookieName(info.port)}=${info.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = Reply.safeParse(await res.json().catch(() => undefined)).data;
    if (body && 'project' in body) return { id: body.project.id, created: res.status === 201 };
    return body?.error ?? { code: 'unexpected', message: `Jig UI answered ${res.status}.` };
  } catch (error) {
    return { code: 'unreachable', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * What a stop request came to. `unsupported`: an instance from before the endpoint existed (404).
 * `unreachable`: nothing answered. Any other answer, or a connection cut after the request went
 * out, is `stopping`: the server closes its sockets as it shuts down, so the caller waits on the
 * probe to learn whether it really went.
 */
export type StopRequested = 'stopping' | 'unsupported' | 'unreachable';

/** Asks the instance to shut down, as `connectThrough` asks it to connect: the token proves the instance is ours. */
export async function requestStop(info: Pick<InstanceInfo, 'port' | 'token'>, timeoutMs = 5000): Promise<StopRequested> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/instance/stop`, {
      method: 'POST',
      headers: { cookie: `${cookieName(info.port)}=${info.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    return res.status === 404 ? 'unsupported' : 'stopping';
  } catch (error) {
    // A timeout or reset after the request was sent may still be a server going down; a refusal is not.
    return refused(error) ? 'unreachable' : 'stopping';
  }
}
