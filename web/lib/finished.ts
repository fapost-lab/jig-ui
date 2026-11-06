import { type Finished, link } from '../api';
import type { Tone } from './tones';

/** A closed or abandoned task as its list carries it, while Jig keeps its workspace. */
export type FinishedTask = Extract<Finished, { state: 'ready' }>['tasks'][number];

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

/** Why there is no list of finished tasks to show, for a person; none when there is one. The board's own read is apart from this. */
export function noFinished(read: Finished): string | undefined {
  if (read.state === 'ready') return read.tasks.length === 0 ? 'Jig keeps no finished tasks in this project now.' : undefined;
  if (read.state === 'unsupported') return `Jig ${read.minimum} or later in the project lists the finished tasks.`;
  if (read.state === 'incompatible') return `Jig ${read.jigVersion} lists the finished tasks in a form this Jig UI does not read.`;
  if (read.state === 'unreadable') {
    if (read.code === 'upgrading') return 'Jig is being upgraded in the project; the finished tasks are listed again once it is done.';
    return read.code === 'timeout' ? 'Jig did not answer in time with the finished tasks.' : 'Jig could not list the finished tasks.';
  }
  return 'The project cannot be read.';
}

/** The finished list as shown, and whether it is a good one kept over a torn read. */
export type Settled = {
  shown: Finished | undefined;
  held: boolean;
};

/** What the finished list shows once a read lands: one torn read over a good list is held, the next one in a row is believed. */
export function settleFinished(shown: Finished | undefined, read: Finished, held: boolean): Settled {
  const torn = read.state === 'unreadable' || read.state === 'incompatible';
  return torn && shown?.state === 'ready' && !held ? { shown, held: true } : { shown: read, held: false };
}
