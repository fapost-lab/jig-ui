import { link, type Task } from '../api';
import { ago } from './ago';
import type { Tone } from './tones';

/**
 * What a card says about where its task waits — the gate, the autopilot run, a pause, where it stands on Jig's
 * staging flow, the pull request — how loud, and the pull request's link when the note is about it. The first rule
 * that fits wins.
 */
export function waits(task: Omit<Task, 'resumesTo'>):
  | {
      text: string;
      tone: Tone;
      url?: string;
    }
  | undefined {
  if (task.gate === 'waiting') return { text: 'Design waits at its gate', tone: 'attention' };
  if (task.gate === 'changed') return { text: 'Design changed after approval', tone: 'attention' };
  if (task.autopilot === 'stopped') return { text: 'Autopilot stopped with a question', tone: 'attention' };
  // Below Jig 0.35.0 `jig task resume` takes no revision to write against (fapost-lab/jig#295): the page names the command.
  if (task.paused) return { text: task.resumable ? 'Paused' : `Paused — jig task resume ${task.id}`, tone: 'quiet' };
  const pr = task.pullRequest;
  // On Jig's staging flow the pull request is the one into staging: merged, the work is still not in the base.
  if (task.parked?.reason === 'review') {
    const landing = task.parked.hint === 'landing';
    return {
      text: landing ? 'Pull request into staging — yours to land' : 'Pull request into staging waits for review',
      tone: landing ? 'attention' : 'quiet',
      url: link(pr?.url ?? null),
    };
  }
  if (task.parked?.reason === 'signal') return { text: 'On staging, waits for prepare for prod', tone: 'quiet' };
  if (task.staging === 'behind') return { text: 'Fix not on staging yet', tone: 'quiet' };
  const ci = pr?.ci && pr.ci !== 'none' ? `, CI ${pr.ci}` : '';
  // Jig's CI is green, red, pending or none (its housekeeping); a merge is good whatever CI said.
  const tone: Tone = pr?.ci === 'red' ? 'bad' : pr?.ci === 'green' || pr?.state === 'merged' ? 'good' : 'quiet';
  // Jig reads the state and CI for the branch into the base, so on staging they are the promotion's; the url is not.
  if (task.staging === 'on') return pr?.state ? { text: `Promotion ${pr.state}${ci}`, tone } : { text: 'On staging', tone: 'quiet' };
  if (pr) return { text: `Pull request ${pr.state ?? 'opened'}${ci}`, tone, url: link(pr.url) };
  if (task.status === 'ready') return { text: 'No pull request yet', tone: 'quiet' };
  return task.autopilot === 'on' ? { text: 'On autopilot', tone: 'quiet' } : undefined;
}

/**
 * A task's pull request as its details show it. On Jig's staging flow, once the task waits at the staging branch or its
 * work went there, Jig's link is the pull request into staging while its state and CI are the promotion's into the base
 * (as `waits` reads them), so the two are shown apart: the promotion only while its work is on staging, as on the card.
 * Elsewhere, one pull request.
 */
export function pullRequests(task: Pick<Task, 'pullRequest' | 'staging' | 'parked'>): {
  title: string;
  text: string | null;
  url: string | null;
}[] {
  const pr = task.pullRequest;
  if (!pr) return [];
  const ci = pr.ci && pr.ci !== 'none' ? `, CI ${pr.ci}` : '';
  if (task.staging === null && task.parked === null) {
    return [{ title: 'Pull request', text: `${pr.state ?? 'state not known yet'}${ci}`, url: pr.url }];
  }
  const into = { title: 'Pull request into staging', text: null, url: pr.url };
  return task.staging === 'on' && pr.state ? [into, { title: 'Promotion', text: `${pr.state}${ci}`, url: null }] : [into];
}

/** What a card says of a pause asked of its task, with how long ago; shown beside any note `waits` gives. */
export function requested(task: Task, now = Date.now()): string | undefined {
  return task.pauseRequest ? `Pause requested ${ago(task.pauseRequest.requestedAt, now)}` : undefined;
}
