import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addProject, readProjects, RegistryUnreadable, removeProject, slugFor } from './projects.js';

const root = mkdtempSync(join(tmpdir(), 'jig-ui-projects-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const fresh = () => join(mkdtempSync(join(root, 'case-')), 'jig-ui');

describe('slugFor', () => {
  it.each([
    ['/w/jig-ui', 'jig-ui'],
    ['/w/My Project', 'my-project'],
    ['/w/Café_Ünïcode', 'cafe-unicode'],
    ['/w/--x--', 'x'],
    ['/w/Проєкт', 'project'],
  ])('%s → %s', (path, id) => {
    expect(slugFor(path, new Set())).toBe(id);
  });

  it('adds a number when the id is taken', () => {
    expect(slugFor('/a/api', new Set(['api']))).toBe('api-2');
    expect(slugFor('/a/api', new Set(['api', 'api-2']))).toBe('api-3');
  });
});

describe('registry', () => {
  it('is empty before the first connect', async () => {
    expect(await readProjects(fresh())).toEqual([]);
  });

  it('keeps projects in the order they were connected, and one id per checkout', async () => {
    const dir = fresh();
    expect(await addProject(dir, '/a/api')).toEqual({ project: { id: 'api', path: '/a/api' }, created: true });
    expect((await addProject(dir, '/b/api')).project.id).toBe('api-2');
    expect(await addProject(dir, '/a/api')).toEqual({ project: { id: 'api', path: '/a/api' }, created: false });
    expect((await readProjects(dir)).map((p) => p.id)).toEqual(['api', 'api-2']);
  });

  it('does not lose a connect made at the same time as another', async () => {
    const dir = fresh();
    await Promise.all(['/a', '/b', '/c'].map((p) => addProject(dir, p)));
    expect(await readProjects(dir)).toHaveLength(3);
  });

  it('disconnects by id', async () => {
    const dir = fresh();
    await addProject(dir, '/a/api');
    expect(await removeProject(dir, 'nope')).toBe(false);
    expect(await removeProject(dir, 'api')).toBe(true);
    expect(await readProjects(dir)).toEqual([]);
  });

  it('keeps the fields of a row it does not know through a write', async () => {
    const dir = fresh();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'projects.json'), '{"projects":[{"id":"api","path":"/a/api","later":1}]}');
    await addProject(dir, '/b');
    expect((await readProjects(dir))[0]).toEqual({ id: 'api', path: '/a/api', later: 1 });
  });

  it.each(['{"projects":', '{"projects":[{"id":1}]}', '[]'])('never overwrites an unreadable file: %s', async (text) => {
    const dir = fresh();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'projects.json'), text);
    await expect(readProjects(dir)).rejects.toBeInstanceOf(RegistryUnreadable);
    await expect(addProject(dir, '/a')).rejects.toBeInstanceOf(RegistryUnreadable);
    await expect(removeProject(dir, 'a')).rejects.toBeInstanceOf(RegistryUnreadable);
    expect(readFileSync(join(dir, 'projects.json'), 'utf8')).toBe(text);
  });

  it.skipIf(process.platform === 'win32')('is readable only by the user', async () => {
    const dir = fresh();
    await addProject(dir, '/a');
    expect(statSync(join(dir, 'projects.json')).mode & 0o777).toBe(0o600);
  });
});
