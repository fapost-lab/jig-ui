import { link, type Task } from '../api';
import type { Tone } from './tones';

/**
 * What a card says about where its task waits — the gate, the autopilot run, the pull request —
 * how loud, and the pull request's link when the note is about it. The first rule that fits wins.
 */
export function waits(task: Task): { text: string; tone: Tone; url?: string } | undefined {
  if (task.gate === 'waiting') return { text: 'Design waits at its gate', tone: 'attention' };
  if (task.gate === 'changed') return { text: 'Design changed after approval', tone: 'attention' };
  if (task.autopilot === 'stopped') return { text: 'Autopilot stopped with a question', tone: 'attention' };
  if (task.paused) return undefined;
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
