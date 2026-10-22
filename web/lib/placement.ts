import type { Place, Task } from '../api';

/** True when level `a` comes before level `b` in Jig's queue: the top level (`null`) first, then each epic's by name. */
const earlier = (a: string | null, b: string | null): boolean => a !== b && (a === null || (b !== null && a < b));

/**
 * Where Jig's queue puts a task dropped into `gap` of its column (0 above the first card, `cards.length` below the
 * last), as one `jig queue move`: after the nearest card above it that is queued on its level, else to the top of
 * that level — or to its bottom when the gap is among the cards not queued, which follow the queued ones.
 * `undefined` when the drop changes nothing, or lands inside another level's run of cards, where Jig's order cannot
 * put it: right below a later level's card or right above an earlier level's.
 */
export function placement(cards: Task[], task: string, gap: number): Place | undefined {
  const from = cards.findIndex((t) => t.id === task);
  if (from < 0 || gap === from || gap === from + 1) return undefined;
  const level = cards[from]?.queue?.level ?? null; // ponytail: a task not queued is taken for the top level's; Jig refuses one on an epic
  const rest = cards.filter((t) => t.id !== task);
  const at = gap > from ? gap - 1 : gap;
  const [above, below] = [rest[at - 1]?.queue, rest[at]?.queue];
  if ((above && earlier(level, above.level)) || (below && earlier(below.level, level))) return undefined;
  const higher = rest.slice(0, at);
  const anchor = higher.findLast((t) => t.queue !== null && t.queue.level === level);
  if (anchor) return { after: anchor.id };
  return higher.some((t) => t.queue === null) ? 'bottom' : 'top';
}

/** One place up or down the column, as a drop just above the card before it or just below the card after it would be. */
export function step(cards: Task[], task: string, by: -1 | 1): Place | undefined {
  const from = cards.findIndex((t) => t.id === task);
  if (from < 0) return undefined;
  const gap = by < 0 ? from - 1 : from + 2;
  return gap < 0 || gap > cards.length ? undefined : placement(cards, task, gap);
}
