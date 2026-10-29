import type { Project } from '../api';

/** A connected project whose read has not landed yet: the Projects page lists it at once. */
export interface Reading {
  id: string;
  state: 'reading';
}

/** A project in the Projects page's list: read, or still being read. */
export type Listed = Project | Reading;

const isRead = (p: Listed): p is Project => p.state !== 'reading';

/** The projects whose id holds what was typed, whatever its case; every project when nothing is. */
export function matching<P extends { id: string }>(projects: P[], query: string): P[] {
  const typed = query.trim().toLowerCase();
  return typed ? projects.filter((p) => p.id.toLowerCase().includes(typed)) : projects;
}

/** Something to do there, or not readable. */
const needsYou = (p: Project): boolean => p.state !== 'ready' || p.attention.length > 0;

/**
 * The project whose card the workspace shows: the one asked for, if connected, even while it is read; else, once every
 * read has landed, the first that needs the person; else the first. Waiting keeps the card from jumping as reads land.
 */
export function chosen(projects: Listed[], wanted: string | undefined): Listed | undefined {
  const asked = projects.find((p) => p.id === wanted);
  if (asked || !projects.every(isRead)) return asked;
  return projects.find((p) => isRead(p) && needsYou(p)) ?? projects[0];
}

/** How far the first read of the projects has come; `undefined` once every one has landed. */
export function readProgress(projects: Listed[]):
  | {
      read: number;
      of: number;
    }
  | undefined {
  const read = projects.filter(isRead).length;
  return read < projects.length ? { read, of: projects.length } : undefined;
}

/**
 * The list with a project's own read in its place, while that place still waits for it. The first load's reads do not
 * go through `lastWins`: each answers for one project, and a project already there came from a workspace read, which
 * is as new or newer, so it stays.
 */
export const landed = (projects: Listed[], project: Project): Listed[] =>
  projects.map((p) => (p.id === project.id && !isRead(p) ? project : p));

/** The projects read so far, for what is worked out over read projects only (the upgrade lines, Upgrade all). */
export const readOnes = (projects: Listed[]): Project[] => projects.filter(isRead);
