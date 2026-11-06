import type { ItemPlace, Spec, SpecItem } from '@/api';

/** A run of an item's words: plain, or `code` as the roadmap marks it. */
export type Words = {
  text: string;
  code: boolean;
}[];

/**
 * An item's words as a row shows them: without the leading `` `task-id` — `` or `fog:` the row
 * already shows, its dependencies (`(after: …)`) apart, and backticked runs marked as code.
 */
export function itemWords(item: SpecItem): {
  words: Words;
  after: Words | null;
} {
  let text = item.text;
  // Jig takes an em dash, `-` or `--` after the id, with any spaces around it.
  if (item.task !== null) text = text.replace(new RegExp(`^\`${item.task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`\\s+(—|--|-)\\s+`), '');
  if (item.fog) text = text.replace(/^fog:\s*/, '');
  const after = /\s*\(after: (.*)\)$/.exec(text);
  if (after) text = text.slice(0, after.index);
  return { words: split(text), after: after?.[1] ? split(after[1]) : null };
}

function split(text: string): Words {
  return text
    .split('`')
    .map((run, i) => ({ text: run, code: i % 2 === 1 }))
    .filter((run) => run.text !== '');
}

/**
 * What to ask the person's agent for on a spec, in jig-idea's words: to file the tasks of the first
 * phase with an item that has none, and to continue the spec while it has fog. Items before the first
 * phase heading are left out: "phase N" cannot name them.
 */
export function agentRequests(spec: Spec, project: string): string[] {
  const unfiled = spec.phases.find((p) => p.phase !== null && p.items.some((i) => i.task === null && !i.fog && !i.checked));
  return [
    ...(unfiled ? [`File the tasks for phase ${unfiled.phase} of spec ${spec.id} in ${project}`] : []),
    ...(spec.progress && spec.progress.fog > 0 ? [`Continue spec ${spec.id} in ${project}: lift its fog items`] : []),
  ];
}

/**
 * The roadmap a spec's card shows: the one on the spec's branch while edits wait there — the one the next edit changes,
 * where Jig finds its items — else the one Jig read from the project.
 */
export const shownRoadmap = (spec: Spec): Pick<Spec, 'progress' | 'phases'> => spec.waiting ?? spec;

/** The items the edits waiting on the spec's branch changed: new there, in another phase than before, or filed there. */
export function waitingItems(spec: Spec): Set<string> {
  if (!spec.waiting) return new Set();
  const before = new Map(spec.phases.flatMap((p) => p.items.map((i) => [i.id, { phase: p.phase, task: i.task }] as const)));
  return new Set(
    spec.waiting.phases.flatMap((p) =>
      p.items.flatMap((i) => {
        const was = before.get(i.id);
        return i.id !== null && (!was || was.phase !== p.phase || was.task !== i.task) ? [i.id] : [];
      }),
    ),
  );
}

/** How far the edits waiting on a write branch of Jig's went — a spec's, the knowledge decisions' — when they have no pull request to link to. */
export function waitingState(waiting: Pick<NonNullable<Spec['waiting']>, 'pushed'>): string {
  return waiting.pushed ? 'pushed, no pull request yet' : 'committed in this clone, not pushed';
}

/**
 * Where Up and Down put the item at `index` of its phase's `items`, as Jig's move takes it: it has no "before", so Up is
 * after the item two above, or the top for the second; Down is after the next one. `undefined` at either end.
 */
export function itemStep(items: SpecItem[], index: number, by: -1 | 1): ItemPlace | undefined {
  if (by === -1 && index <= 1) return index === 1 ? 'top' : undefined;
  const anchor = items[by === -1 ? index - 2 : index + 1]?.id;
  return anchor ? { after: anchor } : undefined;
}

/** The goal a task filed from an item starts with: the item's words, without `fog:` and its dependencies, cut to Jig's 500. */
export function filingGoal(item: SpecItem): string {
  return itemWords(item)
    .words.map((run) => (run.code ? `\`${run.text}\`` : run.text))
    .join('')
    .trim()
    .slice(0, 500);
}
