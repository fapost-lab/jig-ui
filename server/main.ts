import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from '@hono/node-server';
import { type CliCommand, DEFAULT_PORT, parseCliArgs } from './args.js';
import { createApp, readPackageVersion } from './http/app.js';
import { openBrowser } from './open-browser.js';
import { configDir } from './registry/config-dir.js';
import { connectThrough, type InstanceInfo, probeInstance, readInstance, removeInstance, writeInstance } from './registry/instance.js';
import { mainCheckout } from './source/checkout.js';
import { instanceStatus, startInstance, stopInstance } from './service.js';
import { localSource } from './source/local.js';

const HOST = '127.0.0.1';

const HELP = `Usage: jig-ui [options]
       jig-ui start [--port <n>]
       jig-ui stop | status | open

Run without a command, Jig UI runs in this terminal and opens the browser.

Commands:
  start          Start Jig UI in the background
  stop           Stop the running Jig UI
  status         Say whether Jig UI is running (exit code 3 when it is not)
  open           Open the running Jig UI in the browser
  serve          Run in this terminal without a browser or a folder: what start runs

Options:
  --port <n>     Port to listen on (default 4870); run, start and serve
  --no-open      Print the link instead of opening the browser; run only
  -v, --version  Print the version and exit
  -h, --help     Print this help and exit
`;

/** The exit code of `status` and `open` when Jig UI is not running. */
const NOT_RUNNING = 3;

/** An instance whose port stays silent: maybe busy, so nothing is removed or started in its place. */
const silent = ({ port, pid }: InstanceInfo): string =>
  `Jig UI on port ${port} (pid ${pid}) does not answer. Try again; if it stays silent, end that process yourself.`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type Address = Pick<InstanceInfo, 'port' | 'token'>;

// The token swap redirects to `/` with no fragment, so the browser keeps this one: the board opens.
const link = ({ port, token }: Address, project?: string): string =>
  `http://${HOST}:${port}/?token=${token}${project ? `#/projects/${project}` : ''}`;

async function show(info: Address, open: boolean, dir: string, project?: string): Promise<void> {
  console.log(`Open it at ${link(info, project)}`);
  if (open && !(await openBrowser(link(info, project), dir))) console.log('Could not open a browser; open the link above.');
}

/** The folder this command runs in, as a checkout to connect: a worktree stands for its clone's main checkout. */
async function here(): Promise<
  | {
      path: string;
      worktree: boolean;
    }
  | undefined
> {
  const checkout = await mainCheckout(process.cwd());
  if (checkout.kind === 'main') return { path: checkout.root, worktree: false };
  // A bare clone's worktree has no main checkout: nothing to connect, said as outside a project.
  if (checkout.kind === 'worktree' && checkout.main) return { path: checkout.main, worktree: true };
  return undefined;
}

/**
 * Connects the folder through the instance and returns the project's id. Outside a Jig project it says
 * nothing: the command then only starts, as it always did.
 */
async function connectHere(info: Address, place: Awaited<ReturnType<typeof here>>): Promise<string | undefined> {
  if (!place) return undefined;
  const result = await connectThrough(info, place.path);
  if ('id' in result) {
    const what = place.worktree ? `the main checkout of this worktree, ${place.path}` : place.path;
    console.log(result.created ? `Connected ${result.id}: ${what}.` : `${result.id} is connected: ${what}.`);
    return result.id;
  }
  if (result.code !== 'not-a-repository' && result.code !== 'no-jig') console.log(`Could not connect this folder: ${result.message}`);
  return undefined;
}

/** The instance recorded in the config directory, if it still answers with its token. */
async function runningInstance(dir: string): Promise<InstanceInfo | undefined> {
  const info = await readInstance(dir);
  return info && (await probeInstance(info)) ? info : undefined;
}

/** After losing the port: the winner writes its file only once it listens, so give it a moment. */
async function winnerOfRace(dir: string): Promise<InstanceInfo | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const winner = await runningInstance(dir);
    if (winner) return winner;
    await delay(200);
  }
  return undefined;
}

/**
 * Runs the server in this process. `run` also connects the folder and opens the browser; `serve`
 * (what `start` runs in the background) does neither and keeps quiet about Ctrl+C.
 */
async function runServer(command: Extract<CliCommand, { kind: 'run' | 'serve' }>, dir: string): Promise<void> {
  const { port } = command;
  const foreground = command.kind === 'run';
  const open = foreground && command.open;
  const place = foreground ? await here() : undefined;
  const running = await runningInstance(dir);
  if (running) {
    console.log(`Jig UI is already running on port ${running.port}.`);
    // ponytail: a --port equal to the default is indistinguishable from no flag; no note then.
    if (port !== running.port && port !== DEFAULT_PORT) console.log(`--port ${port} is ignored.`);
    if (foreground) await show(running, open, dir, await connectHere(running, place));
    return;
  }

  const version = readPackageVersion();
  const token = randomBytes(32).toString('base64url');
  const shutdown = (): void => {
    void removeInstance(dir, token).finally(() => {
      server.close(() => process.exit(0));
      if ('closeAllConnections' in server) server.closeAllConnections();
    });
  };
  const server = serve(
    { fetch: createApp({ port, token, source: localSource(dir), version, stop: shutdown }).fetch, hostname: HOST, port },
    () => {
      void (async () => {
        await writeInstance(dir, { port, token, pid: process.pid, version });
        console.log(`Jig UI ${version} is running at http://${HOST}:${port}/`);
        if (!foreground) return;
        await show({ port, token }, open, dir, await connectHere({ port, token }, place));
        console.log('Press Ctrl+C to stop.');
      })().catch((error: unknown) => fail(`Could not start: ${error instanceof Error ? error.message : String(error)}`));
    },
  );

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') fail(`Could not start the server: ${error.message}`);
    // Two starts at once: the one that lost the port opens the one that won.
    void winnerOfRace(dir).then(async (winner) => {
      if (!winner) fail(`Port ${port} is already in use. Stop the other process or choose another port with --port.`);
      console.log(`Jig UI is already running on port ${winner.port}.`);
      if (foreground) await show(winner, open, dir, await connectHere(winner, place));
      process.exit(0);
    });
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function startBackground(port: number, dir: string): Promise<void> {
  const result = await startInstance(dir, port);
  if (result.kind === 'failed') {
    console.error(`Could not start Jig UI. The end of ${result.log}:\n${result.tail}`);
    process.exit(1);
  }
  if (result.kind === 'not-answering') fail(silent(result.info));
  if (result.kind === 'already-running') {
    console.log(`Jig UI is already running on port ${result.info.port}.`);
    if (port !== result.info.port && port !== DEFAULT_PORT) console.log(`--port ${port} is ignored.`);
    console.log(`Open it at ${link(result.info)}`);
    return;
  }
  console.log(`Jig UI ${result.info.version} is running at http://${HOST}:${result.info.port}/ in the background.`);
  console.log(`Open it at ${link(result.info)}`);
  console.log(`Log: ${result.log}`);
}

async function stopBackground(dir: string): Promise<void> {
  const result = await stopInstance(dir);
  switch (result.kind) {
    case 'not-running':
      console.log('Jig UI is not running.');
      return;
    case 'stale':
      console.log(
        `Jig UI is not running: the file of an instance on port ${result.info.port} was left behind and is removed. No process was signalled.`,
      );
      return;
    case 'stopped':
      console.log(`Stopped Jig UI on port ${result.info.port}.`);
      return;
    case 'not-answering':
      console.error(silent(result.info));
      process.exitCode = 1;
      return;
    case 'timeout':
      console.error(`Jig UI on port ${result.info.port} (pid ${result.info.pid}) did not stop in time.`);
      process.exitCode = 1;
  }
}

async function statusOf(dir: string): Promise<void> {
  const status = await instanceStatus(dir);
  if (status.kind === 'running') {
    const { info } = status;
    console.log(`Jig UI ${info.version} is running at http://${HOST}:${info.port}/ (pid ${info.pid}).`);
    console.log(`Open it at ${link(info)}`);
    return;
  }
  if (status.kind === 'not-answering') {
    console.error(silent(status.info));
    process.exitCode = 1;
    return;
  }
  console.log(
    status.kind === 'stale'
      ? `Jig UI is not running; the file of an instance on port ${status.info.port} was left behind. jig-ui stop removes it.`
      : 'Jig UI is not running. Start it with jig-ui start.',
  );
  process.exitCode = NOT_RUNNING;
}

async function openRunning(dir: string): Promise<void> {
  const status = await instanceStatus(dir);
  if (status.kind === 'running') return show(status.info, true, dir);
  if (status.kind === 'not-answering') fail(silent(status.info));
  console.log('Jig UI is not running. Start it with jig-ui start.');
  process.exitCode = NOT_RUNNING;
}

export async function main(): Promise<void> {
  const command = parseCliArgs(process.argv.slice(2));
  if (command.kind === 'error') fail(command.message);
  if (command.kind === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (command.kind === 'version') {
    console.log(readPackageVersion());
    return;
  }

  const dir = configDir(process.env, process.platform, homedir());
  switch (command.kind) {
    case 'start':
      return startBackground(command.port, dir);
    case 'stop':
      return stopBackground(dir);
    case 'status':
      return statusOf(dir);
    case 'open':
      return openRunning(dir);
    default:
      return runServer(command, dir);
  }
}
