import type { ItemPlace, Spec, SpecItem } from '@/api';
import { columnAccent, doneFill } from './tones';

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
  let text = own(item);
  const after = /\s*\(after: (.*)\)$/.exec(text);
  if (after) text = text.slice(0, after.index);
  return { words: split(text), after: after?.[1] ? split(after[1]) : null };
}

/** An item's text without the leading `` `task-id` — `` or `fog:` its row or card already shows. */
function own(item: SpecItem): string {
  let text = item.text;
  // Jig takes an em dash, `-` or `--` after the id, with any spaces around it.
  if (item.task !== null) text = text.replace(new RegExp(`^\`${item.task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`\\s+(—|--|-)\\s+`), '');
  if (item.fog) text = text.replace(/^fog:\s*/, '');
  return text;
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

/** The lanes of a phase on the roadmap board, in the order they stand. */
export const LANES = [
  { id: 'to-file', title: 'To file' },
  { id: 'in-work', title: 'In work' },
  { id: 'done', title: 'Done' },
] as const;

export type Lane = (typeof LANES)[number]['id'];

/** An item's lane: done when checked, in work when it names a task, else to file — fog too, which has nothing to file yet. */
export const laneOf = (item: SpecItem): Lane => (item.checked ? 'done' : item.task !== null ? 'in-work' : 'to-file');

/**
 * An item's words as its card shows them: the title, up to the first " — " or `(after: …)` outside a code run; the
 * dependencies, up to the parenthesis that closes them, wherever they stand; and the rest, opened under the title. No
 * seam: the whole text is the title.
 */
export function itemTitle(item: SpecItem): {
  title: Words;
  rest: Words;
  after: Words | null;
} {
  let text = own(item);
  const after = dependency(text);
  // The dependencies give way to a seam when words follow them, so the title ends where they began.
  if (after) text = `${text.slice(0, after.at)}${after.end < text.length ? ' — ' : ''}${text.slice(after.end)}`;
  const seam = [...text.matchAll(/ — /g)].find((m) => m.index > 0 && outsideCode(text, m.index));
  return {
    title: split(seam ? text.slice(0, seam.index) : text),
    rest: split(seam ? text.slice(seam.index + 3).replace(/^\s*(—|--|-)\s+/, '') : ''),
    after: after ? split(after.words) : null,
  };
}

const outsideCode = (text: string, at: number): boolean => text.slice(0, at).split('`').length % 2 === 1;

/** The first `(after: …)` outside a code run: where it starts, where the parenthesis closing it ends — or the text does — and its words. */
function dependency(text: string):
  | {
      at: number;
      end: number;
      words: string;
    }
  | undefined {
  const open = [...text.matchAll(/\s*\(after: /g)].find((m) => outsideCode(text, m.index));
  if (!open) return undefined;
  const from = open.index + open[0].length;
  let depth = 1;
  let end = from;
  for (; end < text.length && depth > 0; end++) {
    if (text[end] === '(') depth++;
    else if (text[end] === ')') depth--;
  }
  return { at: open.index, end, words: text.slice(from, depth === 0 ? end - 1 : end) };
}

/**
 * Where an item stands, as its card says it — fog, not filed, its task's board column while the task is live, or filed,
 * a task the board does not show; nothing for a done one, which its lane says — and its dot: done's colour, the column's
 * accent, or a grey that means nothing more.
 */
export function itemStanding(
  item: SpecItem,
  columns: ReadonlyMap<
    string,
    {
      id: string;
      title: string;
    }
  >,
): {
  label: string | null;
  dot: string;
} {
  if (item.checked) return { label: null, dot: doneFill };
  if (item.task === null)
    return item.fog ? { label: 'fog', dot: 'bg-muted-foreground/30' } : { label: 'not filed', dot: 'border border-muted-foreground' };
  const column = columns.get(item.task);
  return column ? { label: column.title, dot: columnAccent[column.id] ?? 'bg-border' } : { label: 'filed', dot: 'bg-muted-foreground/60' };
}

/** The phase a roadmap board opens on: the first with an item not done, else the last. */
export function openingPhase(phases: { items: SpecItem[] }[]): number {
  const at = phases.findIndex((p) => p.items.some((item) => !item.checked));
  return at < 0 ? Math.max(phases.length - 1, 0) : at;
}

/**
 * Where Up and Down put the item at `index` of its phase's `items` among the cards of its lane, as one move of Jig's —
 * the board's filter rule, anchoring on the nearest card shown: Down after the lane's next card; Up before the card
 * above, which is after the item standing before it in the phase, since Jig has no "before", or the top. Items of other
 * lanes keep their places. `undefined` at either end of the lane, and next to an item without a handle, as from an
 * older Jig.
 */
export function laneStep(items: SpecItem[], index: number, by: -1 | 1): ItemPlace | undefined {
  const lane = laneOf(items[index]!);
  const near =
    by === -1
      ? items.findLastIndex((item, i) => i < index && laneOf(item) === lane)
      : items.findIndex((item, i) => i > index && laneOf(item) === lane);
  if (near < 0) return undefined;
  if (by === -1 && near === 0) return 'top';
  const anchor = items[by === -1 ? near - 1 : near]!.id;
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
