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
});
