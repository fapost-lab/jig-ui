import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { type Answer, type InstanceInfo, readInstance, writeInstance } from './registry/instance.js';
import { type Child, instanceStatus, LOG_FILE, type ServiceDeps, startInstance, stopInstance } from './service.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-service-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const fresh = () => join(mkdtempSync(join(root, 'case-')), 'jig-ui');
const info: InstanceInfo = { port: 4871, token: 'tok', pid: 4242, version: '0.1.0' };
/** A child that never exits unless killed. */
const running = (): Child => ({ exit: new Promise(() => {}), unref: vi.fn(), kill: vi.fn() });
/** Answers `up` for the first `n` probes, then `then`. */
const upFor =
  (n: number, then: Answer = 'gone') =>
  async (): Promise<Answer> =>
    n-- > 0 ? 'up' : then;

/** Dependencies on a fake clock: a delay moves time, so a wait that never ends is quick. */
function fakeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  let time = 0;
  return {
    probe: vi.fn(async (): Promise<Answer> => 'gone'),
    requestStop: vi.fn(async () => 'stopping' as const),
    kill: vi.fn(),
    spawn: vi.fn(running),
    delay: async (ms) => {
      time += ms;
    },
    now: () => time,
    ...overrides,
  };
}

describe('instanceStatus', () => {
  it('is not-running without a file', async () => {
    expect(await instanceStatus(fresh(), fakeDeps())).toEqual({ kind: 'not-running' });
  });

  it('is running when the instance answers', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    expect(await instanceStatus(dir, fakeDeps({ probe: async () => 'up' as const }))).toEqual({ kind: 'running', info });
  });

  it('is stale, and keeps the file, when the port refuses', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    expect(await instanceStatus(dir, fakeDeps())).toEqual({ kind: 'stale', info });
    expect(await readInstance(dir)).toEqual(info);
  });

  it('is not-answering, never stale, when the port stays silent', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    expect(await instanceStatus(dir, fakeDeps({ probe: async () => 'silent' as const }))).toEqual({ kind: 'not-answering', info });
  });
});

describe('startInstance', () => {
  it('does not spawn, nor touch the log, when already running', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    writeFileSync(join(dir, LOG_FILE), 'earlier run');
    const deps = fakeDeps({ probe: async () => 'up' as const });
    expect(await startInstance(dir, 4871, deps)).toEqual({ kind: 'already-running', info });
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(readFileSync(join(dir, LOG_FILE), 'utf8')).toBe('earlier run');
  });

  it('spawns the serve command and waits for the instance', async () => {
    const dir = fresh();
    const unref = vi.fn();
    let spawned = false;
    const deps = fakeDeps({
      spawn: vi.fn((): Child => {
        spawned = true;
        void writeInstance(dir, info);
        return { ...running(), unref };
      }),
      probe: async () => (spawned ? 'up' : 'gone'),
    });
    const result = await startInstance(dir, 4871, deps);
    expect(result).toEqual({ kind: 'started', info, log: join(dir, LOG_FILE) });
    const [command, args, options] = vi.mocked(deps.spawn).mock.calls[0]!;
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual(['serve', '--port', '4871']);
    expect(args[0]).toMatch(/cli\.js$/);
    expect(options.cwd).toBe(dir);
    expect(unref).toHaveBeenCalled();
    if (process.platform !== 'win32') expect(statSync(join(dir, LOG_FILE)).mode & 0o777).toBe(0o600);
  });

  it('fails with the end of the log when the child exits with an error', async () => {
    const dir = fresh();
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const deps = fakeDeps({
      spawn: vi.fn((_command, _args, { cwd }): Child => {
        mkdirSync(cwd, { recursive: true });
        writeFileSync(join(cwd, LOG_FILE), `${lines.join('\n')}\n`);
        return { ...running(), exit: Promise.resolve({ code: 1 }) };
      }),
    });
    const result = await startInstance(dir, 4871, deps);
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.log).toBe(join(dir, LOG_FILE));
    expect(result.tail.split('\n')).toEqual(lines.slice(-20));
  });

  it('fails with the spawn error when the child never started', async () => {
    const deps = fakeDeps({ spawn: vi.fn(() => ({ ...running(), exit: Promise.resolve({ code: -1, error: 'spawn ENOENT' }) })) });
    expect(await startInstance(fresh(), 4871, deps)).toMatchObject({ kind: 'failed', tail: 'spawn ENOENT' });
  });

  it('fails, and ends its child, when the instance never answers', async () => {
    const child = running();
    const result = await startInstance(fresh(), 4871, fakeDeps({ spawn: vi.fn(() => child) }));
    expect(result.kind).toBe('failed');
    expect(child.kill).toHaveBeenCalled();
  });

  it('reports the winner when its child lost the race and exited with 0', async () => {
    const dir = fresh();
    const deps = fakeDeps({
      spawn: vi.fn((): Child => {
        void writeInstance(dir, info);
        return { ...running(), exit: Promise.resolve({ code: 0 }) };
      }),
      probe: vi.fn<ServiceDeps['probe']>().mockResolvedValueOnce('gone').mockResolvedValue('up'),
    });
    expect(await startInstance(dir, 4871, deps)).toEqual({ kind: 'started', info, log: join(dir, LOG_FILE) });
  });

  it('neither spawns nor touches the log when the instance is silent', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const deps = fakeDeps({ probe: async () => 'silent' as const });
    expect(await startInstance(dir, 4871, deps)).toEqual({ kind: 'not-answering', info });
    expect(deps.spawn).not.toHaveBeenCalled();
  });
});

describe('stopInstance', () => {
  it('is not-running without a file', async () => {
    const deps = fakeDeps();
    expect(await stopInstance(fresh(), deps)).toEqual({ kind: 'not-running' });
    expect(deps.requestStop).not.toHaveBeenCalled();
  });

  it('removes a stale file and signals nobody', async () => {
    const dir = fresh();
    await writeInstance(dir, { ...info, pid: process.pid });
    const deps = fakeDeps();
    expect(await stopInstance(dir, deps)).toEqual({ kind: 'stale', info: { ...info, pid: process.pid } });
    expect(deps.kill).not.toHaveBeenCalled();
    expect(deps.requestStop).not.toHaveBeenCalled();
    expect(await readInstance(dir)).toBeUndefined();
  });

  it('asks the instance to stop and waits until it is gone', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    // The status probe, one more while it shuts down, a silent one, then gone.
    const deps = fakeDeps({
      probe: vi
        .fn<ServiceDeps['probe']>()
        .mockResolvedValueOnce('up')
        .mockResolvedValueOnce('up')
        .mockResolvedValueOnce('silent')
        .mockResolvedValue('gone'),
    });
    expect(await stopInstance(dir, deps)).toEqual({ kind: 'stopped', info });
    expect(deps.requestStop).toHaveBeenCalledWith(info);
    expect(deps.kill).not.toHaveBeenCalled();
    expect(await readInstance(dir)).toBeUndefined();
  });

  it('falls back to SIGTERM for an instance without the endpoint', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const deps = fakeDeps({ probe: upFor(1), requestStop: async () => 'unsupported' as const });
    expect((await stopInstance(dir, deps)).kind).toBe('stopped');
    expect(deps.kill).toHaveBeenCalledWith(info.pid, 'SIGTERM');
  });

  it('is stopped when the old instance went before its signal', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const kill = vi.fn(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });
    const deps = fakeDeps({ probe: upFor(1), requestStop: async () => 'unsupported' as const, kill });
    expect(await stopInstance(dir, deps)).toEqual({ kind: 'stopped', info });
  });

  it('is stopped when the instance went before the request reached it', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const deps = fakeDeps({ probe: upFor(1), requestStop: async () => 'unreachable' as const });
    expect(await stopInstance(dir, deps)).toEqual({ kind: 'stopped', info });
    expect(deps.kill).not.toHaveBeenCalled();
  });

  it('leaves a silent instance and its file alone', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const deps = fakeDeps({ probe: async () => 'silent' as const });
    expect(await stopInstance(dir, deps)).toEqual({ kind: 'not-answering', info });
    expect(deps.requestStop).not.toHaveBeenCalled();
    expect(deps.kill).not.toHaveBeenCalled();
    expect(await readInstance(dir)).toEqual(info);
  });

  it('times out when the instance keeps answering', async () => {
    const dir = fresh();
    await writeInstance(dir, info);
    const deps = fakeDeps({ probe: async () => 'up' as const });
    expect(await stopInstance(dir, deps)).toEqual({ kind: 'timeout', info });
    expect(await readInstance(dir)).toEqual(info);
  });
});
