import { serve } from '@hono/node-server';
import { parseCliArgs } from './args.js';
import { createApp, readPackageVersion } from './http/app.js';

const HOST = '127.0.0.1';

const HELP = `Usage: jig-ui [options]

Options:
  --port <n>     Port to listen on (default 4870)
  -v, --version  Print the version and exit
  -h, --help     Print this help and exit
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function main(): void {
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

  const { port } = command;
  const version = readPackageVersion();
  const server = serve({ fetch: createApp({ port, version }).fetch, hostname: HOST, port }, () => {
    console.log(`Jig UI ${version} is running at http://${HOST}:${port}/`);
    console.log('Press Ctrl+C to stop.');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      fail(`Port ${port} is already in use. Stop the other process or choose another port with --port.`);
    }
    fail(`Could not start the server: ${error.message}`);
  });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
    if ('closeAllConnections' in server) server.closeAllConnections();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
