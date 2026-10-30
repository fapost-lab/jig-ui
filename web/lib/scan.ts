import type { FoundProjects } from '../api';

const jigProjects = (n: number) => (n === 1 ? '1 Jig project' : `${n} Jig projects`);

/** What Find projects says it found: how many there are to connect, where, and how many are connected already. */
export function foundLine({ folder, found, connected }: FoundProjects): string {
  const already = connected > 0 ? `${connected} already connected` : '';
  if (found.length === 0) return `No Jig projects to connect in ${folder}${already && `: ${already}`}.`;
  return `${jigProjects(found.length)} to connect in ${folder}${already && `, ${already}`}.`;
}

/** The home folder's folders passed over because macOS asks first, and how to look in one; `undefined` when none were. */
export function skippedLine({ skipped }: FoundProjects): string | undefined {
  const [first] = skipped;
  if (first === undefined) return undefined;
  const them = skipped.length === 1 ? 'it' : 'them';
  return `Skipped ${skipped.join(', ')}: macOS asks before an app reads ${them}. To look in one, type its path — ~/${first} — and choose Find projects.`;
}

/** What Find projects found once one of them is connected: it leaves the list and counts as connected. */
export const withConnected = (result: FoundProjects, path: string): FoundProjects => ({
  ...result,
  found: result.found.filter((p) => p.path !== path),
  connected: result.connected + 1,
});
