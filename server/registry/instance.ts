import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What a running instance records so that a second start can find it. */
export interface InstanceInfo {
  port: number;
  token: string;
  pid: number;
  version: string;
}

const FILE = 'instance.json';
/** The page that sends the browser on to the instance; it carries the token, so it lives here too. */
export const OPEN_FILE = 'open.html';

/** The cookie that carries the token; named by port, as browsers do not separate cookies by port. */
export const cookieName = (port: number): string => `jig-ui-${port}`;

export async function readInstance(dir: string): Promise<InstanceInfo | undefined> {
  try {
    const info = JSON.parse(await readFile(join(dir, FILE), 'utf8')) as Partial<InstanceInfo>;
    if (typeof info.port !== 'number' || typeof info.token !== 'string') return undefined;
    return info as InstanceInfo;
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

/** True when an instance answers on its port with its token; a crash leaves the file behind. */
export async function probeInstance(info: InstanceInfo, timeoutMs = 1000): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/instance`, {
      headers: { cookie: `${cookieName(info.port)}=${info.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}
