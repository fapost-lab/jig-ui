import type { LandedAll, Machine, Project, UpgradePlan } from '../api';
import type { Tone } from './tones';

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

/** `a` is an older version than `b`, both as `0.38.0`. */
function older(a: string, b: string): boolean {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}

/**
 * Jig's line that a newer release than this machine's is out, as `jig v0.38.0 is out`: the project's upgrade waits for
 * `jig self-update`, which moves this machine's Jig. A project hears of a release only at its own housekeeping, so one
 * on a Jig older than `release` — the newest any connected project names — is behind it too, whatever it says itself.
 */
export function releaseOf(project: Project, release: string | null = null): string | undefined {
  if (project.state !== 'ready') return undefined;
  const said = project.attention.find((a) => a.kind === 'release-available')?.title;
  if (said !== undefined) return said;
  return release !== null && older(project.jigVersion, release) ? `jig v${release} is out` : undefined;
}

/** An upgrade of the project that waits for its pull request, as the server works it out (Jig 0.39.0 in the project). */
export type MergeWait = NonNullable<Project['mergeWait']>;

/** The project's upgrade that waits for its pull request — open, or merged and not here yet; none otherwise. */
export const mergeWaitOf = (project: Project): MergeWait | undefined => project.mergeWait;

/** The project has an upgrade to make: now, or once this machine's Jig is updated — not while one waits to be merged. */
export const needsUpgrade = (project: Project, release: string | null = null): boolean =>
  mergeWaitOf(project) === undefined && (upgradeOf(project) !== undefined || releaseOf(project, release) !== undefined);

/** What Upgrade all would do: update this machine's Jig first when a release is out, then upgrade these projects. */
export function upgradeAllPlan(
  projects: Project[],
  release: string | null = null,
): {
  selfUpdate: boolean;
  projects: string[];
} {
  return {
    selfUpdate: projects.some((p) => releaseOf(p, release) !== undefined),
    projects: projects.filter((p) => needsUpgrade(p, release)).map((p) => p.id),
  };
}

/** A run that changes this machine's Jig or every project is under way: no other upgrade starts meanwhile. */
export const machineBusy = (machine: Machine | undefined): boolean =>
  machine?.landingAll === true || machine?.selfUpdate?.state === 'running' || machine?.upgradeAll?.state === 'running';

/** What the page says of Upgrade all and of a self-update: under way, or what it came to; none when nothing ran. */
export function machineLine(
  machine: Machine | undefined,
  projects: Project[] = [],
):
  | {
      text: string;
      tone: Tone;
      reasons: string[];
      ended: boolean;
    }
  | undefined {
  const all = machine?.upgradeAll;
  const listed = (ids: string[]) => ids.join(', ');
  // A self-update from a card comes before what an earlier Upgrade all came to.
  if (machine?.selfUpdate?.state === 'running' && all?.state !== 'running') {
    return { text: 'Updating Jig on this machine…', tone: 'quiet', reasons: [], ended: false };
  }
  if (machine?.landingAll) return { text: 'Checking the merges of upgrade pull requests…', tone: 'quiet', reasons: [], ended: false };
  if (all?.state === 'running') {
    if (all.current === null) {
      const text =
        machine?.selfUpdate?.state === 'running' ? 'Upgrade all: updating Jig on this machine…' : 'Upgrade all: reading the projects…';
      return { text, tone: 'quiet', reasons: [], ended: false };
    }
    const after = all.upgraded.length ? ` (done: ${listed(all.upgraded)})` : '';
    return { text: `Upgrade all: upgrading ${all.current}…${after}`, tone: 'quiet', reasons: [], ended: false };
  }
  if (all?.state === 'done') {
    if (all.failed)
      return { text: 'Upgrade all stopped: Jig could not update itself on this machine.', tone: 'bad', reasons: all.failed, ended: true };
    const parts = [all.upgraded.length ? `ran the upgrade in ${listed(all.upgraded)}` : 'had no project to upgrade'];
    // Where the upgrade ended in a pull request, the project is not upgraded until it is merged and brought here.
    const waiting = projects.filter((p) => all.upgraded.includes(p.id) && mergeWaitOf(p) !== undefined).map((p) => p.id);
    if (waiting.length)
      parts.push(`${listed(waiting)} ${waiting.length === 1 ? 'waits' : 'wait'} for a pull request: Check merge once merged`);
    if (all.skipped.length) parts.push(`left ${listed(all.skipped)} alone`);
    return { text: `Upgrade all ${parts.join('; ')}. Each card says what its upgrade came to.`, tone: 'quiet', reasons: [], ended: true };
  }
  return undefined;
}

/** A card's mark of a project behind the machine's Jig, both versions; none when it is not behind. */
export function upgradeMark(project: Project): string | undefined {
  const versions = upgradeOf(project);
  return versions && `${versions.from} → ${versions.to} on this machine`;
}

/** The line above the projects when some run an older Jig than the machine's; none when no project does. */
export function upgradeLine(projects: Project[]): string | undefined {
  const n = projects.filter((p) => upgradeOf(p) !== undefined).length;
  if (n === 0) return undefined;
  return `${n} ${n === 1 ? 'project runs' : 'projects run'} an older Jig than this machine: run jig upgrade in ${n === 1 ? 'it' : 'each'}.`;
}

/** An upgrade started from the page: under way, what Jig did, or why it did not get there. */
export type UpgradeRun = NonNullable<Project['upgrade']>;

/**
 * The upgrade panel of a card before a run: asking to update this machine's Jig first, that update under way, Jig's dry
 * run being read, its plan, or why there is none.
 */
export type PlanState =
  | {
      state: 'confirm-self-update';
      release: string;
    }
  | { state: 'self-updating' }
  | { state: 'reading' }
  | {
      state: 'planned';
      plan: UpgradePlan;
    }
  | {
      state: 'refused';
      message: string;
    };

/** What a card says an upgrade came to: a line, how loud, its pull request, the steps left by hand, Jig's reasons. */
export interface UpgradeResult {
  text: string;
  tone: Tone;
  url: string | null;
  steps: string[];
  reasons: string[];
}

/** What the card says once an upgrade has ended, by what Jig answered. */
export function upgradeResult(run: Exclude<UpgradeRun, { state: 'running' }>): UpgradeResult {
  if (run.state === 'refused') {
    if (run.code === 'not-merged') {
      return {
        text: 'Not merged yet: the pull request is still open, and nothing changed here.',
        tone: 'attention',
        url: null,
        steps: [],
        reasons: [],
      };
    }
    if (run.code === 'upgrade-blocked') {
      return { text: 'Jig did not start the upgrade; nothing changed:', tone: 'attention', url: null, steps: [], reasons: run.reasons };
    }
    const text =
      'Jig could not finish the upgrade. If it got as far as a commit, the branch is there and the push or the pull request is left to you: run jig upgrade in the project to see why.';
    return { text, tone: 'bad', url: null, steps: [], reasons: [] };
  }
  const { outcome, git, manualSteps: steps } = run.upgrade;
  const to = run.upgrade.to ?? "this machine's Jig";
  const on = git?.branch ? `branch ${git.branch}` : "the project's branch";
  const said = (text: string, tone: Tone, url: string | null = null): UpgradeResult => ({ text, tone, url, steps, reasons: [] });
  switch (outcome) {
    case 'upgraded':
      if (git?.merged) return said(`Upgraded to ${to} and merged.`, 'good', git.pullRequest);
      if (git?.pullRequest) return said(`Upgraded to ${to} on ${on}: its pull request waits for review.`, 'attention', git.pullRequest);
      if (git?.pushed) return said(`Upgraded to ${to} and pushed ${on}; open a pull request from it.`, 'attention');
      return said(`Upgraded to ${to}, committed on ${on} in the project; push it when you are ready.`, 'attention');
    case 'staged': {
      const left = git?.branch ? ", and the project's main checkout is left on it" : '';
      return said(`Staged the upgrade to ${to} on ${on}${left}. Commit it there: git commit -F .ai/runtime/upgrade/message`, 'attention');
    }
    case 'nothing-to-do':
      return said(`Nothing to upgrade: the project already has ${to}.`, 'quiet');
    case 'incomplete':
      return said("Jig's check after placing the files failed, so nothing was committed. Run the upgrade again.", 'bad');
    case 'landed': {
      const base = run.upgrade.land?.base ?? "the project's base branch";
      return said(`Merged and brought here: ${base} now runs Jig ${to}.`, 'good', git?.pullRequest ?? null);
    }
    case 'linked':
      return said("Linked to Jig's source; nothing to commit.", 'good');
    default:
      return said(`Jig ended the upgrade: ${outcome}.`, 'quiet');
  }
}

/** What to ask an agent for, so that it upgrades the project and does the steps the release asks for by hand. */
export const agentRequest = (project: string): string => `Upgrade Jig in ${project}`;

/** What Check all merges came to, in a line: landed, still waiting for a merge, and stopped on their card. */
export function landedLine(all: LandedAll): string {
  const parts: string[] = [];
  if (all.landed.length) parts.push(`brought ${all.landed.join(', ')} up to date`);
  if (all.waiting.length) parts.push(`${all.waiting.join(', ')} still ${all.waiting.length === 1 ? 'waits' : 'wait'} for a merge`);
  if (all.stopped.length)
    parts.push(`${all.stopped.join(', ')} could not be brought here: see ${all.stopped.length === 1 ? 'its card' : 'their cards'}`);
  return parts.length ? `Check all merges ${parts.join('; ')}.` : 'Check all merges found no upgrade pull request to check.';
}
