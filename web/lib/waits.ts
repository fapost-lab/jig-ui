import { link, type Task } from '../api';
import { ago } from './ago';
import type { Tone } from './tones';

/**
 * What a card says about where its task waits — the gate, the autopilot run, a pause, the pull
 * request — how loud, and the pull request's link when the note is about it. The first rule that fits wins.
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
  if (pr) {
    const ci = pr.ci && pr.ci !== 'none' ? `, CI ${pr.ci}` : '';
    // Jig's CI is green, red, pending or none (its housekeeping); a merge is good whatever CI said.
    const tone: Tone = pr.ci === 'red' ? 'bad' : pr.ci === 'green' || pr.state === 'merged' ? 'good' : 'quiet';
    return { text: `Pull request ${pr.state ?? 'opened'}${ci}`, tone, url: link(pr.url) };
  }
  if (task.status === 'ready') return { text: 'No pull request yet', tone: 'quiet' };
  return task.autopilot === 'on' ? { text: 'On autopilot', tone: 'quiet' } : undefined;
}

/** What a card says of a pause asked of its task, with how long ago; shown beside any note `waits` gives. */
export function requested(task: Task, now = Date.now()): string | undefined {
  return task.pauseRequest ? `Pause requested ${ago(task.pauseRequest.requestedAt, now)}` : undefined;
}
