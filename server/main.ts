import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from '@hono/node-server';
import { DEFAULT_PORT, parseCliArgs } from './args.js';
import { createApp, readPackageVersion } from './http/app.js';
import { openBrowser } from './open-browser.js';
import { configDir } from './registry/config-dir.js';
import { type InstanceInfo, probeInstance, readInstance, removeInstance, writeInstance } from './registry/instance.js';

const HOST = '127.0.0.1';

const HELP = `Usage: jig-ui [options]

Options:
  --port <n>     Port to listen on (default 4870)
  --no-open      Print the link instead of opening the browser
  -v, --version  Print the version and exit
  -h, --help     Print this help and exit
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const link = ({ port, token }: Pick<InstanceInfo, 'port' | 'token'>): string => `http://${HOST}:${port}/?token=${token}`;

async function show(info: Pick<InstanceInfo, 'port' | 'token'>, open: boolean, dir: string): Promise<void> {
  console.log(`Open it at ${link(info)}`);
  if (open && !(await openBrowser(link(info), dir))) console.log('Could not open a browser; open the link above.');
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

  const { port, open } = command;
  const dir = configDir(process.env, process.platform, homedir());
  const running = await runningInstance(dir);
  if (running) {
    console.log(`Jig UI is already running on port ${running.port}.`);
    // ponytail: a --port equal to the default is indistinguishable from no flag; no note then.
    if (port !== running.port && port !== DEFAULT_PORT) console.log(`--port ${port} is ignored.`);
    await show(running, open, dir);
    return;
  }

  const version = readPackageVersion();
  const token = randomBytes(32).toString('base64url');
  const server = serve({ fetch: createApp({ port, token, configDir: dir, version }).fetch, hostname: HOST, port }, () => {
    void (async () => {
      await writeInstance(dir, { port, token, pid: process.pid, version });
      console.log(`Jig UI ${version} is running at http://${HOST}:${port}/`);
      await show({ port, token }, open, dir);
      console.log('Press Ctrl+C to stop.');
    })().catch((error: unknown) => fail(`Could not start: ${error instanceof Error ? error.message : String(error)}`));
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') fail(`Could not start the server: ${error.message}`);
    // Two starts at once: the one that lost the port opens the one that won.
    void winnerOfRace(dir).then(async (winner) => {
      if (!winner) fail(`Port ${port} is already in use. Stop the other process or choose another port with --port.`);
      console.log(`Jig UI is already running on port ${winner.port}.`);
      await show(winner, open, dir);
      process.exit(0);
    });
  });

  const shutdown = (): void => {
    void removeInstance(dir, token).finally(() => {
      server.close(() => process.exit(0));
      if ('closeAllConnections' in server) server.closeAllConnections();
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
