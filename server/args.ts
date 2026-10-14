import { parseArgs } from 'node:util';

export const DEFAULT_PORT = 4870;

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'run'; port: number }
  | { kind: 'error'; message: string };

/** Parses the command line (without the node and script entries). Pure: it never exits or prints. */
export function parseCliArgs(argv: string[]): CliCommand {
  let values: { port?: string; help?: boolean; version?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        port: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  if (values.port === undefined) return { kind: 'run', port: DEFAULT_PORT };

  const port = /^\d+$/.test(values.port) ? Number(values.port) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { kind: 'error', message: `Invalid --port value: ${values.port}. Use a number from 1 to 65535.` };
  }
  return { kind: 'run', port };
}
