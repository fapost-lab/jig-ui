import type { Place, Spec } from '../api';

/** A spec whose epic the person can order in Jig's queue: one with an open epic. */
export const movable = (spec: Spec): boolean => spec.epic?.state === 'open';

/**
 * One place up or down among the project's open epics, in the order the page shows them — the queued ones first — as
 * one `jig queue move`: before the epic above, or after the one below. An epic not queued that goes up joins the
 * queued ones at their end: after the last of them, or at the queue's bottom when none is queued. `undefined` at
 * either end, and down onto an epic not queued, which the queue cannot put anything below.
 */
export function epicStep(specs: Spec[], id: string, by: -1 | 1): Place | undefined {
  const epics = specs.filter(movable);
  const at = epics.findIndex((s) => s.id === id);
  const next = at < 0 ? undefined : epics[at + by];
  if (!next) return undefined;
  if (next.queue) return by < 0 ? { before: next.id } : { after: next.id };
  if (by > 0) return undefined;
  const last = epics.findLast((s) => s.queue !== null);
  return last ? { after: last.id } : 'bottom';
}
