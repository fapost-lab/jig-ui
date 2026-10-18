import type { SpecItem } from '@/api';

/** A run of an item's words: plain, or `code` as the roadmap marks it. */
export type Words = { text: string; code: boolean }[];

/**
 * An item's words as a row shows them: without the leading `` `task-id` — `` or `fog:` the row
 * already shows, its dependencies (`(after: …)`) apart, and backticked runs marked as code.
 */
export function itemWords(item: SpecItem): { words: Words; after: Words | null } {
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
