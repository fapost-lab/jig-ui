import type { ReadyDetails } from '../api';

const ordinal = new Intl.PluralRules('en', { type: 'ordinal' });
const suffix: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

/** A task's priority as its facts say it: `P0`…`P5`, or `none`. */
export const priorityLabel = (priority: number | null): string => (priority === null ? 'none' : `P${priority}`);

/** Where a task stands in Jig's queue: `2nd of 5 at the top`, `1st of 3 in epic booking`, or `not queued`. */
export function placeLine({ place, queue }: Pick<ReadyDetails, 'place' | 'queue'>): string {
  if (!place || !queue) return 'not queued';
  const where = queue.level === null ? 'at the top' : `in epic ${queue.level.replace(/^epic:/, '')}`;
  return `${place.rank}${suffix[ordinal.select(place.rank)]} of ${place.of} ${where}`;
}

/** An item of the queue by its name: a task's id, or `epic <spec>`. */
const itemName = (ref: string): string => (ref.startsWith('epic:') ? `epic ${ref.slice(5)}` : ref.replace(/^task:/, ''));

/** One thing a task waits for: `beta — Quotes the form`, and where its epic's, `… (through epic booking)`. */
export const waitLine = ({ on, reason, through }: ReadyDetails['dependsOn'][number]): string =>
  `${itemName(on)} — ${reason}${through ? ` (through ${itemName(through)})` : ''}`;
