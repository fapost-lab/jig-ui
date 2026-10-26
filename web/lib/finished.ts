import { type Board, link } from '../api';
import type { Tone } from './tones';

/** A closed or abandoned task as a board carries it, while Jig keeps its workspace. */
export type FinishedTask = Extract<Board, { state: 'ready' }>['finished'][number];

/**
 * What a row of the finished list says of its task: closed or abandoned, how loud, and its pull request by number and
 * state, with the link when it is one the page opens.
 */
export function finished(task: FinishedTask): {
  word: string;
  tone: Tone;
  pr?: {
    text: string;
    url?: string;
  };
} {
  const pr = task.pullRequest;
  const number = pr && /\/(?:pull|merge_requests)\/(\d+)$/.exec(pr.url)?.[1];
  return {
    word: task.status === 'consolidated' ? 'closed' : 'abandoned',
    tone: task.status === 'consolidated' ? 'good' : 'quiet',
    pr: pr ? { text: `${number ? `#${number}` : 'Pull request'}${pr.state ? ` ${pr.state}` : ''}`, url: link(pr.url) } : undefined,
  };
}

/** The finished tasks, the latest first; of one day, in Jig's order. */
export const latestFirst = (tasks: FinishedTask[]): FinishedTask[] =>
  [...tasks].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
