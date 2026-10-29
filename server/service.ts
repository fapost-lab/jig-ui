import { spawn as spawnProcess } from 'node:child_process';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  type Answer,
  askInstance,
  type InstanceInfo,
  readInstance,
  removeInstance,
  requestStop,
  type StopRequested,
} from './registry/instance.js';

/** The log of the background instance; overwritten at each start, but it grows while the instance runs (task server-log-rotation). */
export const LOG_FILE = 'server.log';

/** How long the instance gets to answer a probe; one that stays silent is busy, never stale. */
const PROBE_MS = 3000;
/** How long a start waits for the new instance, and a stop for the old one to go. */
const WAIT_MS = 10_000;
const POLL_MS = 100;
const TAIL_LINES = 20;

/**
 * The background process as the service sees it: how it ended (`code` null: by a signal; `error`:
 * it never started), a way to let go of it, and a way to end it — it is our own child, not a pid read from a file.
 */
export interface Child {
  exit: Promise<{
    code: number | null;
    error?: string;
  }>;
  unref(): void;
  kill(): void;
}

/** What the service needs from the system; tests replace it so that no process is started or signalled. */
export interface ServiceDeps {
  probe(info: InstanceInfo, timeoutMs: number): Promise<Answer>;
  requestStop(info: InstanceInfo): Promise<StopRequested>;
  kill(pid: number, signal: NodeJS.Signals): void;
  spawn(
    command: string,
    args: string[],
    options: {
      cwd: string;
      fd: number;
    },
  ): Child;
  delay(ms: number): Promise<void>;
  now(): number;
}

/** The program that runs the instance: this very CLI, next to this file in `dist` and in `server`. */
const CLI_PATH = fileURLToPath(new URL('./cli.js', import.meta.url));

export const realDeps: ServiceDeps = {
  probe: askInstance,
  requestStop: (info) => requestStop(info),
  kill: (pid, signal) => process.kill(pid, signal),
  spawn(command, args, { cwd, fd }) {
    const child = spawnProcess(command, args, { detached: true, stdio: ['ignore', fd, fd], windowsHide: true, cwd });
    const exit = new Promise<{
      code: number | null;
      error?: string;
    }>((resolve) => {
      // A process that cannot start never exits and writes no log: its error is all there is to say.
      child.on('error', (error) => resolve({ code: -1, error: error.message }));
      child.on('exit', (code) => resolve({ code }));
    });
    return { exit, unref: () => child.unref(), kill: () => child.kill() };
  },
  delay: (ms) => sleep(ms),
  now: () => Date.now(),
};

export type InstanceStatus =
  | {
      kind: 'running';
      info: InstanceInfo;
    }
  | {
      kind: 'stale';
      info: InstanceInfo;
    }
  | {
      kind: 'not-answering';
      info: InstanceInfo;
    }
  | { kind: 'not-running' };

/**
 * Reads the instance file and asks the instance. A file whose port refuses, or answers as someone
 * else, is stale; one whose port stays silent is `not-answering`: maybe alive and busy. It deletes nothing.
 */
export async function instanceStatus(dir: string, deps: ServiceDeps = realDeps): Promise<InstanceStatus> {
  const info = await readInstance(dir);
  if (!info) return { kind: 'not-running' };
  const answer = await deps.probe(info, PROBE_MS);
  return { kind: answer === 'up' ? 'running' : answer === 'gone' ? 'stale' : 'not-answering', info };
}

export type StartResult =
  | {
      kind: 'already-running';
      info: InstanceInfo;
    }
  | {
      kind: 'not-answering';
      info: InstanceInfo;
    }
  | {
      kind: 'started';
      info: InstanceInfo;
      log: string;
    }
  | {
      kind: 'failed';
      log: string;
      tail: string;
    };

async function logTail(log: string): Promise<string> {
  try {
    return (await readFile(log, 'utf8')).trimEnd().split('\n').slice(-TAIL_LINES).join('\n');
  } catch {
    return '';
  }
}

/**
 * Starts the instance in the background and waits until it answers. The child is the CLI itself
 * as `serve`: detached from this terminal, its output in the log, its working directory the
 * config directory, so it holds no folder of the person's.
 */
export async function startInstance(dir: string, port: number, deps: ServiceDeps = realDeps): Promise<StartResult> {
  const status = await instanceStatus(dir, deps);
  if (status.kind === 'running') return { kind: 'already-running', info: status.info };
  // A second server would only lose the port to it, and the log would be overwritten for nothing.
  if (status.kind === 'not-answering') return status;

  await mkdir(dir, { recursive: true, mode: 0o700 });
  const log = join(dir, LOG_FILE);
  const handle = await open(log, 'w', 0o600);
  let child: Child;
  try {
    child = deps.spawn(process.execPath, [CLI_PATH, 'serve', '--port', String(port)], { cwd: dir, fd: handle.fd });
  } finally {
    // The child has its own copy of the descriptor.
    await handle.close();
  }
  child.unref();

  let ended:
    | {
        code: number | null;
        error?: string;
      }
    | undefined;
  void child.exit.then((value) => {
    ended = value;
  });

  const deadline = deps.now() + WAIT_MS;
  while (deps.now() < deadline) {
    await deps.delay(POLL_MS);
    const info = await readInstance(dir);
    if (info && (await deps.probe(info, PROBE_MS)) === 'up') return { kind: 'started', info, log };
    // A child that exited with 0 found another instance already there: the next poll sees it.
    if (ended && ended.code !== 0) break;
  }
  // Too slow is a failure too: end the child rather than let it come up after we said it did not.
  if (!ended) child.kill();
  return { kind: 'failed', log, tail: ended?.error ?? (await logTail(log)) };
}

export type StopResult =
  | { kind: 'not-running' }
  | {
      kind: 'stale';
      info: InstanceInfo;
    }
  | {
      kind: 'not-answering';
      info: InstanceInfo;
    }
  | {
      kind: 'stopped';
      info: InstanceInfo;
    }
  | {
      kind: 'timeout';
      info: InstanceInfo;
    };

/**
 * Stops the instance the file names. An instance that answers is asked over HTTP, with its token:
 * that works on every system and cannot hit a process that merely reused the pid. A stale file
 * only goes away, and no signal is sent, because its pid may belong to anything by now. A silent
 * port changes nothing: removing the file of a busy instance would leave it running unseen.
 */
export async function stopInstance(dir: string, deps: ServiceDeps = realDeps): Promise<StopResult> {
  const status = await instanceStatus(dir, deps);
  if (status.kind === 'not-running' || status.kind === 'not-answering') return status;
  const { info } = status;
  if (status.kind === 'stale') {
    await removeInstance(dir, info.token);
    return status;
  }

  const requested = await deps.requestStop(info);
  // An instance from before the endpoint existed: the probe just proved that its pid is the one that answers.
  if (requested === 'unsupported') {
    try {
      deps.kill(info.pid, 'SIGTERM');
    } catch {
      // Gone between the probe and the signal: the wait below sees it.
    }
  }

  const deadline = deps.now() + WAIT_MS;
  while (deps.now() < deadline) {
    if ((await deps.probe(info, PROBE_MS)) === 'gone') {
      // The server removes its files itself; this covers a hard exit.
      await removeInstance(dir, info.token);
      return { kind: 'stopped', info };
    }
    await deps.delay(POLL_MS);
  }
  return { kind: 'timeout', info };
}
