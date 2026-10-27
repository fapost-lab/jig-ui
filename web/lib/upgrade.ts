import type { Project } from '../api';

/**
 * The project's Jig and the machine's, when Jig says the project's is older — its `upgrade-available` item, which a
 * project's Jig reports from 0.34.0; an older Jig, or a project that cannot be read, has none.
 */
export function upgradeOf(project: Project):
  | {
      from: string;
      to: string;
    }
  | undefined {
  if (project.state !== 'ready') return undefined;
  return project.attention.find((a) => a.kind === 'upgrade-available')?.versions ?? undefined;
}

/** The line above the projects when some run an older Jig than the machine's; none when no project does. */
export function upgradeLine(projects: Project[]): string | undefined {
  const n = projects.filter((p) => upgradeOf(p) !== undefined).length;
  if (n === 0) return undefined;
  return `${n} ${n === 1 ? 'project runs' : 'projects run'} an older Jig than this machine: run jig upgrade in ${n === 1 ? 'it' : 'each'}.`;
}
