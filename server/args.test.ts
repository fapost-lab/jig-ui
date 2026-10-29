import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parseCliArgs } from './args.js';

describe('parseCliArgs', () => {
  it('runs on the default port with no arguments', () => {
    expect(parseCliArgs([])).toEqual({ kind: 'run', port: DEFAULT_PORT, open: true });
  });

  it('reads --port in both forms', () => {
    expect(parseCliArgs(['--port', '5000'])).toEqual({ kind: 'run', port: 5000, open: true });
    expect(parseCliArgs(['--port=5001'])).toEqual({ kind: 'run', port: 5001, open: true });
  });

  it('reads --no-open', () => {
    expect(parseCliArgs(['--no-open'])).toEqual({ kind: 'run', port: DEFAULT_PORT, open: false });
    expect(parseCliArgs(['--port', '5000', '--no-open'])).toEqual({ kind: 'run', port: 5000, open: false });
  });

  it('recognises help and version', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['-h'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['--version'])).toEqual({ kind: 'version' });
    expect(parseCliArgs(['-v'])).toEqual({ kind: 'version' });
  });

  it.each([['--port', 'abc'], ['--port', '0'], ['--port', '70000'], ['--port', '-1'], ['--port'], ['--port=']])(
    'rejects invalid port %j',
    (...argv) => {
      expect(parseCliArgs(argv).kind).toBe('error');
    },
  );

  it('rejects unknown flags and positionals', () => {
    expect(parseCliArgs(['--nope']).kind).toBe('error');
    expect(parseCliArgs(['extra']).kind).toBe('error');
  });

  it('reads the subcommands', () => {
    expect(parseCliArgs(['start'])).toEqual({ kind: 'start', port: DEFAULT_PORT, open: true });
    expect(parseCliArgs(['start', '--port', '5000'])).toEqual({ kind: 'start', port: 5000, open: true });
    expect(parseCliArgs(['start', '--no-open'])).toEqual({ kind: 'start', port: DEFAULT_PORT, open: false });
    expect(parseCliArgs(['--port=5001', 'serve'])).toEqual({ kind: 'serve', port: 5001 });
    expect(parseCliArgs(['serve'])).toEqual({ kind: 'serve', port: DEFAULT_PORT });
    expect(parseCliArgs(['stop'])).toEqual({ kind: 'stop' });
    expect(parseCliArgs(['status'])).toEqual({ kind: 'status' });
    expect(parseCliArgs(['open'])).toEqual({ kind: 'open' });
    expect(parseCliArgs(['reset-token'])).toEqual({ kind: 'reset-token' });
  });

  it('lets help and version win over any subcommand', () => {
    expect(parseCliArgs(['stop', '--help'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['start', '-v'])).toEqual({ kind: 'version' });
  });

  it('rejects an unknown subcommand and a second positional', () => {
    expect(parseCliArgs(['restart']).kind).toBe('error');
    expect(parseCliArgs(['start', 'stop']).kind).toBe('error');
  });

  it('rejects a flag the subcommand does not take', () => {
    expect(parseCliArgs(['stop', '--port', '5000']).kind).toBe('error');
    expect(parseCliArgs(['status', '--port=5000']).kind).toBe('error');
    expect(parseCliArgs(['open', '--port', '5000']).kind).toBe('error');
    expect(parseCliArgs(['reset-token', '--port', '5000']).kind).toBe('error');
    expect(parseCliArgs(['reset-token', '--no-open']).kind).toBe('error');
    expect(parseCliArgs(['serve', '--no-open']).kind).toBe('error');
    expect(parseCliArgs(['stop', '--no-open']).kind).toBe('error');
  });

  it('rejects an invalid port for a subcommand', () => {
    expect(parseCliArgs(['start', '--port', 'abc']).kind).toBe('error');
  });
});
