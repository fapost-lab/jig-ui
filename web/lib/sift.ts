import type { LocationQuery } from 'vue-router';
import type { Column, Task } from '../api';
import { priorityLabel } from './queue';

export const SORTS = ['queue', 'priority', 'class'] as const;
/** A task's class as the filter names it; `none` for an unclassified task. */
export const CLASSES = ['T0', 'T1', 'T2', 'T3', 'T4', 'none'] as const;
/** A task's priority as the filter names it, as `priorityLabel` says it. */
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'none'] as const;

/** How the board is looked at — its order and the cards it keeps; held in the page's address, never stored. */
export interface Sift {
  /** `queue` is Jig's order, the one agents follow; `priority` and `class` keep it among equals. */
  sort: (typeof SORTS)[number];
  /** The classes shown; none chosen shows every one. */
  classes: string[];
  /** The priorities shown; none chosen shows every one. */
  priorities: string[];
  /** Text a task's id or goal holds, in any case. */
  text: string;
}

const first = (value: LocationQuery[string] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';

/** The listed values of a comma-separated parameter, in the order of `known`; anything else is dropped. */
const listed = (value: LocationQuery[string] | undefined, known: readonly string[]): string[] => {
  const given = new Set(first(value).split(','));
  return known.filter((k) => given.has(k));
};

/** The view an address asks for; what it does not say, or says wrongly, is the default. */
export function fromQuery(query: LocationQuery): Sift {
  const sort = first(query.sort);
  return {
    sort: SORTS.find((s) => s === sort) ?? 'queue',
    classes: listed(query.class, CLASSES),
    priorities: listed(query.priority, PRIORITIES),
    text: first(query.q),
  };
}

/** The address's parameters for a view, its defaults left out. */
export function toQuery({ sort, classes, priorities, text }: Sift): Record<string, string> {
  const query = { sort: sort === 'queue' ? '' : sort, class: classes.join(','), priority: priorities.join(','), q: text };
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''));
}

/** The board offers a move within a column: it shows the queue's order, where "after the card above" means a place. */
export const reorders = ({ sort }: Sift): boolean => sort === 'queue';

/** A filter is on: the board shows fewer cards than Jig gave. */
export const filtered = ({ classes, priorities, text }: Sift): boolean => classes.length + priorities.length > 0 || text.trim() !== '';

/** Where a label stands in its order; one the order does not know goes last. */
const rank = (order: readonly string[], label: string): number => {
  const at = order.indexOf(label);
  return at < 0 ? order.length : at;
};

/**
 * The columns as the view shows them: each keeps the cards that pass every filter, sorted — stably, so equals keep
 * Jig's order — by priority (P0 first) or class (T0 first), unset ones last.
 */
export function sift(columns: Column[], view: Sift): Column[] {
  const text = view.text.trim().toLowerCase();
  const kept = (t: Task): boolean =>
    (view.classes.length === 0 || view.classes.includes(t.class ?? 'none')) &&
    (view.priorities.length === 0 || view.priorities.includes(priorityLabel(t.priority))) &&
    (text === '' || t.id.toLowerCase().includes(text) || (t.goal ?? '').toLowerCase().includes(text));
  const key =
    view.sort === 'priority'
      ? (t: Task) => rank(PRIORITIES, priorityLabel(t.priority))
      : view.sort === 'class'
        ? (t: Task) => rank(CLASSES, t.class ?? 'none')
        : undefined;
  return columns.map((c) => {
    const cards = c.cards.filter(kept);
    return { ...c, cards: key ? cards.sort((a, b) => key(a) - key(b)) : cards };
  });
}
