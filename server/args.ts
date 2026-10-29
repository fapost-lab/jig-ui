import { parseArgs } from 'node:util';

export const DEFAULT_PORT = 4870;

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | {
      kind: 'run';
      port: number;
      open: boolean;
    }
  | {
      kind: 'start';
      port: number;
      open: boolean;
    }
  | { kind: 'stop' }
  | { kind: 'status' }
  | { kind: 'open' }
  | { kind: 'reset-token' }
  | {
      kind: 'serve';
      port: number;
    }
  | {
      kind: 'error';
      message: string;
    };

const SUBCOMMANDS = ['start', 'stop', 'status', 'open', 'serve', 'reset-token'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

/** Subcommands that listen on a port; the others only talk to the instance that does. */
const TAKES_PORT: ReadonlySet<string> = new Set<Subcommand | 'run'>(['run', 'start', 'serve']);
/** Commands that start an instance and open the browser on it unless told not to. */
const OPENS: ReadonlySet<string> = new Set<Subcommand | 'run'>(['run', 'start']);

/** Parses the command line (without the node and script entries). Pure: it never exits or prints. */
export function parseCliArgs(argv: string[]): CliCommand {
  let positionals: string[];
  let values: {
    port?: string;
    'no-open'?: boolean;
    help?: boolean;
    version?: boolean;
  };
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        port: { type: 'string' },
        'no-open': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  const [name, ...rest] = positionals;
  if (rest.length > 0) return { kind: 'error', message: `Unexpected argument: ${rest[0]}` };
  if (name !== undefined && !(SUBCOMMANDS as readonly string[]).includes(name)) {
    return { kind: 'error', message: `Unknown command: ${name}. Run jig-ui --help.` };
  }
  const command = name ?? 'run';
  if (values.port !== undefined && !TAKES_PORT.has(command)) {
    return { kind: 'error', message: `--port does not apply to ${command}.` };
  }
  if (values['no-open'] && !OPENS.has(command)) {
    return { kind: 'error', message: `--no-open does not apply to ${command}.` };
  }

  let port = DEFAULT_PORT;
  if (values.port !== undefined) {
    port = /^\d+$/.test(values.port) ? Number(values.port) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { kind: 'error', message: `Invalid --port value: ${values.port}. Use a number from 1 to 65535.` };
    }
  }

  switch (command) {
    case 'start':
      return { kind: 'start', port, open: !values['no-open'] };
    case 'serve':
      return { kind: 'serve', port };
    case 'stop':
    case 'status':
    case 'open':
    case 'reset-token':
      return { kind: command };
    default:
      return { kind: 'run', port, open: !values['no-open'] };
  }
}
