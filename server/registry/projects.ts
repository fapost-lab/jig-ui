import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { writeConfigFile } from './instance.js';

/** A connected project: its id everywhere, the path of its main checkout only here and in the local source. */
export interface Project {
  id: string;
  path: string;
}

const FILE = 'projects.json';

/** The registry file exists but cannot be read; it is never overwritten then, so the list is not lost. */
export class RegistryUnreadable extends Error {
  constructor() {
    super(`${FILE} in Jig UI's config directory cannot be read; fix or remove it.`);
  }
}

// A row keeps the fields it does not know, so a later version's additions survive this one's writes.
const Registry = z.object({ projects: z.array(z.looseObject({ id: z.string(), path: z.string() })) });

/** The connected projects in the order they were connected; none when there is no registry yet. */
export async function readProjects(dir: string): Promise<Project[]> {
  let text: string;
  try {
    text = await readFile(join(dir, FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new RegistryUnreadable();
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RegistryUnreadable();
  }
  const registry = Registry.safeParse(json);
  if (!registry.success) throw new RegistryUnreadable();
  return registry.data.projects;
}

/** The id for a checkout: its directory name as a slug, with `-2`, `-3`… when that is taken. */
export function slugFor(root: string, taken: ReadonlySet<string>): string {
  const base =
    basename(root)
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// One instance is the only writer; this chain keeps its own requests from overlapping.
let writes: Promise<unknown> = Promise.resolve();
function serialized<T>(change: () => Promise<T>): Promise<T> {
  const next = writes.then(change, change);
  writes = next.catch(() => undefined);
  return next;
}

async function save(dir: string, projects: Project[]): Promise<void> {
  await writeConfigFile(dir, FILE, `${JSON.stringify({ projects }, null, 2)}\n`);
}

/** Connects the checkout at `root`; a checkout already connected keeps its id. */
export function addProject(
  dir: string,
  root: string,
): Promise<{
  project: Project;
  created: boolean;
}> {
  return serialized(async () => {
    const projects = await readProjects(dir);
    const existing = projects.find((p) => p.path === root);
    if (existing) return { project: existing, created: false };
    const project = { id: slugFor(root, new Set(projects.map((p) => p.id))), path: root };
    await save(dir, [...projects, project]);
    return { project, created: true };
  });
}

/** Disconnects a project; false when no project has that id. Nothing in the project is touched. */
export function removeProject(dir: string, id: string): Promise<boolean> {
  return serialized(async () => {
    const projects = await readProjects(dir);
    const rest = projects.filter((p) => p.id !== id);
    if (rest.length === projects.length) return false;
    await save(dir, rest);
    return true;
  });
}
