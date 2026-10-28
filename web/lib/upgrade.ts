import type { Project, UpgradePlan } from '../api';
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

/** The upgrade panel of a card before a run: Jig's dry run being read, its plan, or why there is none. */
export type PlanState =
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
    case 'linked':
      return said("Linked to Jig's source; nothing to commit.", 'good');
    default:
      return said(`Jig ended the upgrade: ${outcome}.`, 'quiet');
  }
}

/** What to ask an agent for, so that it upgrades the project and does the steps the release asks for by hand. */
export const agentRequest = (project: string): string => `Upgrade Jig in ${project}`;
