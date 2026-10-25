import type { Column, Task } from '../api';

/**
 * What a card shows of its task, and whether and on which level it is queued; not its position, which the order of
 * the column says (Jig respaces a whole level now and then), nor what it does not show, such as when housekeeping
 * last asked about the pull request.
 */
const facts = (t: Task): string =>
  JSON.stringify([
    t.class,
    t.goal,
    t.priority,
    t.status,
    t.gate,
    t.autopilot,
    t.paused,
    t.pauseRequest,
    t.pullRequest && [t.pullRequest.state, t.pullRequest.ci, t.pullRequest.url],
    t.queue && [t.queue.level],
  ]);

/**
 * The cards of `ids` (in their order now) that left the order `was` had them in: all but the longest run that kept
 * it — of the longest, the one keeping most cards whose place in the queue is `still` the same, so of two neighbours
 * swapped the one marked is the one Jig gave a new position.
 * ponytail: O(n²), fine for a column; a patience sort when columns hold thousands.
 */
function moved(ids: string[], was: string[], still: (id: string) => boolean): string[] {
  const at = ids.map((id) => was.indexOf(id));
  const own = ids.map((id): number => (still(id) ? 1 : 0));
  const run = at.map(() => 1);
  const kept = [...own];
  const from = at.map(() => -1);
  for (let i = 0; i < at.length; i++)
    for (let j = 0; j < i; j++) {
      const [r, k] = [run[j]! + 1, kept[j]! + own[i]!];
      if (at[j]! < at[i]! && (r > run[i]! || (r === run[i]! && k > kept[i]!))) {
        run[i] = r;
        kept[i] = k;
        from[i] = j;
      }
    }
  let end = -1;
  for (let i = 0; i < at.length; i++) if (end < 0 || run[i]! > run[end]! || (run[i] === run[end] && kept[i]! > kept[end]!)) end = i;
  const stay = new Set<number>();
  for (let i = end; i >= 0; i = from[i]!) stay.add(i);
  return ids.filter((_, i) => !stay.has(i));
}

/**
 * What changed on the board between the read a refused change was made on (`before`) and the read after it, for the
 * cards to mark and the line to say: the cards that are new, in another column, moved in theirs, or changed; and what
 * became of `task`, the card the person acted on.
 */
export function conflict(
  before: Column[],
  after: Column[],
  task: string,
): {
  changed: string[];
  said: string;
} {
  const was = new Map(
    before.flatMap((c) => c.cards.map((t) => [t.id, { column: c.id, facts: facts(t), place: JSON.stringify(t.queue) }] as const)),
  );
  const changed = new Set<string>();
  let mine: string | undefined;
  for (const column of after) {
    const stayed = column.cards.filter((t) => was.get(t.id)?.column === column.id).map((t) => t.id);
    const order = before.find((c) => c.id === column.id)?.cards.map((t) => t.id) ?? [];
    const now = new Map(column.cards.map((t) => [t.id, JSON.stringify(t.queue)]));
    const shifted = new Set(moved(stayed, order, (id) => was.get(id)?.place === now.get(id)));
    for (const card of column.cards) {
      const then = was.get(card.id);
      const what = !then
        ? 'is new'
        : then.column !== column.id
          ? `is now in ${column.title}`
          : shifted.has(card.id)
            ? `moved in ${column.title}`
            : then.facts !== facts(card)
              ? 'changed'
              : undefined;
      if (what) changed.add(card.id);
      if (card.id === task) mine = what ?? 'did not change';
    }
  }
  const live = new Set(after.flatMap((c) => c.cards.map((t) => t.id)));
  const gone = [...was.keys()].filter((id) => !live.has(id));
  const others = [...changed].filter((id) => id !== task).length;
  const left = gone.filter((id) => id !== task).length;
  const parts = [
    `${task} ${mine ?? 'is no longer on the board'}`,
    others > 0 && `${others} other ${others === 1 ? 'card' : 'cards'} changed`,
    left > 0 && `${left} other ${left === 1 ? 'card' : 'cards'} left the board`,
  ].filter(Boolean);
  const said = changed.size === 0 && gone.length === 0 ? 'nothing on the board changed' : parts.join(', ');
  return { changed: [...changed], said };
}
