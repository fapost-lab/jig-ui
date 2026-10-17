import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { jigVersion, JigRefusal, JigShapeError, MIN_JIG_VERSION, readStatus, readTasks, supports } from './client.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-jig-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A checkout whose `.ai/scripts/jig` prints `output` for any command. */
function checkout(name: string, output: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\necho "${output}"\n`);
  return dir;
}

describe('jigVersion', () => {
  it("reads the project's own Jig", async () => {
    expect(await jigVersion(checkout('new', 'jig 0.29.0'))).toBe('0.29.0');
    expect(await jigVersion(checkout('old', 'jig 0.26.1'))).toBe('0.26.1');
  });

  it('is undefined without Jig', async () => {
    mkdirSync(join(root, 'bare'));
    expect(await jigVersion(join(root, 'bare'))).toBeUndefined();
  });

  it('throws when Jig names no version', async () => {
    await expect(jigVersion(checkout('odd', 'usage: jig'))).rejects.toThrow();
  });
});

describe('supports', () => {
  it.each([
    [MIN_JIG_VERSION, true],
    ['0.29.1', true],
    ['0.30.0', true],
    ['1.0.0', true],
    ['0.28.9', false],
    ['0.9.0', false],
  ])('%s → %s', (version, expected) => {
    expect(supports(version)).toBe(expected);
  });
});

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

/** A checkout whose Jig prints `json` (a fixture's name, or text) and exits with `status`, as a refusal does. */
function answering(name: string, json: string, status = 0): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.ai', 'scripts'), { recursive: true });
  if (json.endsWith('.json')) copyFileSync(fixture(json), join(dir, 'out.json'));
  else writeFileSync(join(dir, 'out.json'), json);
  writeFileSync(join(dir, '.ai', 'scripts', 'jig'), `#!/usr/bin/env bash\ncat out.json\nexit ${status}\n`);
  return dir;
}

/** The fixture with one change, to show what its contract refuses. */
function changed(name: string, change: (data: Record<string, any>) => void): string {
  const envelope = JSON.parse(readFileSync(fixture(name), 'utf8'));
  change(envelope.data);
  return JSON.stringify(envelope);
}

let cases = 0;
const refusal = (code: string) => expect.objectContaining({ code }) as unknown as JigRefusal;

// Contract tests: the fixtures are what Jig 0.29.0 printed (status-attention.json adds items in the
// documented shape, an unknown kind included); each read pins the fields Jig UI relies on.
describe('readStatus', () => {
  it('reads what needs the person, in Jig\'s order, an unknown kind included', async () => {
    const read = await readStatus(answering('status', 'status-attention.json'));
    expect(read.revision).toBe(1792229323);
    expect(read.housekeepingStale).toBe(true);
    expect(read.attention.map((a) => a.kind)).toEqual(['gate-waiting', 'pull-request-waiting', 'phase-stopped', 'something-new']);
    expect(read.attention[1]).toEqual({
      kind: 'pull-request-waiting',
      subject: { type: 'task', id: 'pr-template' },
      tasks: ['pr-template'],
      title: 'Pull request waits for review',
      detail: null,
      todo: 'Review and merge the pull request.',
      url: 'https://github.com/fapost-lab/jig-ui/pull/14',
    });
  });

  it('reads a project where nothing needs the person and housekeeping never ran', async () => {
    expect(await readStatus(answering('status-empty', 'status.json'))).toMatchObject({ attention: [], housekeepingStale: false });
  });

  it.each([
    ['an item without a title', (d: Record<string, any>) => delete d.attention[0].title],
    ['attention that is not a list', (d: Record<string, any>) => (d.attention = {})],
    ['housekeeping without stale', (d: Record<string, any>) => (d.housekeeping = { ran_at: 'x' })],
  ])('refuses %s', async (_, change) => {
    await expect(readStatus(answering(`case-${cases++}`, changed('status-attention.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('readTasks', () => {
  it('reads the live tasks', async () => {
    const read = await readTasks(answering('tasks', 'task-list.json'));
    expect(read.tasks.length).toBeGreaterThan(0);
    expect(read.tasks[0]).toEqual({ id: expect.any(String), status: expect.any(String), paused: expect.any(Boolean) });
  });

  it.each([
    ['without its status', (d: Record<string, any>) => delete d.tasks[0].status],
    ['with a status this Jig UI does not know', (d: Record<string, any>) => (d.tasks[0].status = 'parked')],
  ])('refuses a task %s', async (_, change) => {
    await expect(readTasks(answering(`case-${cases++}`, changed('task-list.json', change)))).rejects.toBeInstanceOf(JigShapeError);
  });
});

describe('a refused read', () => {
  it("carries Jig's failure code", async () => {
    await expect(readTasks(answering('refused', 'refusal.json', 1))).rejects.toEqual(refusal('usage'));
  });

  it.each([
    ['an unknown code', '{"schema":1,"revision":1,"generated_at":"x","error":{"code":"brand-new","message":"m"}}', 1],
    ['no JSON at all', 'jig: error: something', 1],
  ])('is failed for %s', async (_, out, status) => {
    await expect(readTasks(answering(`case-${cases++}`, out, status))).rejects.toEqual(refusal('failed'));
  });

  it('is a shape error for another schema', async () => {
    const out = '{"schema":2,"revision":1,"generated_at":"x","data":{"tasks":[]}}';
    await expect(readTasks(answering(`case-${cases++}`, out))).rejects.toBeInstanceOf(JigShapeError);
  });
});
