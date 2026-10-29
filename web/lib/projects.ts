import type { Project } from '../api';

/** The projects whose id holds what was typed, whatever its case; every project when nothing is. */
export function matching(projects: Project[], query: string): Project[] {
  const typed = query.trim().toLowerCase();
  return typed ? projects.filter((p) => p.id.toLowerCase().includes(typed)) : projects;
}

/** Something to do there, or not readable. */
const needsYou = (p: Project): boolean => p.state !== 'ready' || p.attention.length > 0;

/** The project whose card the workspace shows: the one asked for, if connected; else the first that needs the person; else the first. */
export const chosen = (projects: Project[], wanted: string | undefined): Project | undefined =>
  projects.find((p) => p.id === wanted) ?? projects.find(needsYou) ?? projects[0];
