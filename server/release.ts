import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

/** Where npm's registry answers a package's dist-tags: a few bytes, unlike the package's own document. */
export const DIST_TAGS = 'https://registry.npmjs.org/-/package/@fapost/jig-ui/dist-tags';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the registry may take before the answer is "nothing to say": an offline machine shows its version, not a wait. */
const TIMEOUT_MS = 3000;

/** A newer Jig UI than the running one, and the command that stops the running one, as the person started it. */
export interface Newer {
  version: string;
  stop: string;
}

/** A version's release numbers and its development-channel build, `0.5.2-next.41` → [0, 5, 2, 41]; `undefined` for any other form. */
function parts(version: string): number[] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-next\.(\d+))?$/.exec(version);
  return match ? match.slice(1).map((n) => Number(n ?? -1)) : undefined;
}

/** `a` is a later release than `b`: by release numbers, then by build on the development channel. */
export function later(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  if (!x || !y) return false;
  const at = x.findIndex((n, i) => n !== y[i]);
  return at >= 0 && x[at]! > y[at]!;
}

interface Asked {
  at: number;
  answer: Promise<Newer | null>;
}

export interface ReleaseDeps {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
  /** The Node.js running Jig UI, `process.execPath`. */
  execPath?: string;
  platform?: NodeJS.Platform;
  home?: string;
  timeoutMs?: number;
}

/** The folder of the Node.js `install.sh` downloads when the machine has none — `node` in Jig UI's data folder — with its separator. */
function ownNode(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string | undefined {
  if (platform === 'win32') return env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'jig-ui', 'node') + win32.sep;
  return posix.join(env.XDG_DATA_HOME || posix.join(home, '.local', 'share'), 'jig-ui', 'node') + posix.sep;
}

/**
 * Asks npm's registry, at most once a day, whether a newer Jig UI than `version` is out on its channel — `next` for a
 * development build (`x.y.z-next.n`), else `latest` — and keeps the answer, whatever it was, until the day is over. Any
 * failure is `null`, and so is every answer when `NO_UPDATE_NOTIFIER` is set: the convention for a machine that must
 * not reach the internet. It sends the package's name and nothing about the person or their projects.
 */
export function newerRelease(
  version: string,
  {
    fetch = globalThis.fetch,
    now = Date.now,
    env = process.env,
    execPath = process.execPath,
    platform = process.platform,
    home = homedir(),
    timeoutMs = TIMEOUT_MS,
  }: ReleaseDeps = {},
) {
  const tag = version.includes('-next.') ? 'next' : 'latest';
  // On the Node.js install.sh downloaded there is no npx on PATH: the `jig-ui` command it wrote is the way in. Where the
  // machine had a Node.js of its own, the script's command runs npx, and npx works too.
  const own = ownNode(env, platform, home);
  const stop = own && execPath.startsWith(own) ? 'jig-ui stop' : 'npx @fapost/jig-ui stop';
  /** When the registry was last asked, and what it answered. */
  let asked: Asked | undefined;

  async function ask(): Promise<Newer | null> {
    try {
      const res = await fetch(DIST_TAGS, { signal: AbortSignal.timeout(timeoutMs) });
      const tags: unknown = res.ok ? await res.json() : undefined;
      const out = typeof tags === 'object' && tags !== null ? (tags as Record<string, unknown>)[tag] : undefined;
      return typeof out === 'string' && later(out, version) ? { version: out, stop } : null;
    } catch {
      return null;
    }
  }

  return (): Promise<Newer | null> => {
    if (env.NO_UPDATE_NOTIFIER) return Promise.resolve(null);
    if (!asked || now() - asked.at >= DAY_MS) asked = { at: now(), answer: ask() };
    return asked.answer;
  };
}
