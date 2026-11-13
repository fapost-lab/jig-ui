import type { Origin, Refreshed } from '../api';
import { ago } from './ago';
import type { Tone } from './tones';

/** Why Jig closed one of its own writes, as `jig refresh` says it: a decision or an edit that no longer waits. */
const CLOSED: Record<Refreshed['writes'][number]['reason'], string> = {
  merged: 'their pull request merged',
  landed: 'the base holds them',
  closed: 'their pull request was closed unmerged',
  dropped: 'origin dropped their branch',
};

/**
 * What a refresh did, in the page's words, a line each: the fetch when it did not reach origin, the base, then Jig's own
 * writes it closed. Never a git command or a path; `attention` when something stayed as it was.
 */
export function refreshReport(r: Refreshed): {
  tone: Tone;
  lines: string[];
} {
  const { name, outcome, from, to } = r.base;
  const fetched = r.fetch === 'done';
  const lines: string[] = [];
  if (r.fetch === 'failed') lines.push('Jig could not reach origin: the page shows the clone as of its last fetch.');
  if (r.fetch === 'skipped') lines.push('This clone has no origin to fetch from.');
  lines.push(
    {
      'fast-forwarded': `${name} brought up to origin: ${from?.slice(0, 7)} → ${to?.slice(0, 7)}.`,
      'up-to-date': `${name} is up to date with origin${fetched ? '' : ' as of the last fetch'}.`,
      'blocked-by-changes': `${name} is checked out here, and moving it would overwrite changes in this checkout: commit them or set them aside, then refresh again.`,
      'checked-out-elsewhere': `${name} is checked out in another worktree of this clone; Jig moves it only from there.`,
      diverged: `${name} here has commits origin's does not, so Jig leaves it as it is.`,
      missing: `There is no ${name} here, or none on origin.`,
    }[outcome],
  );
  for (const w of r.writes) {
    const what = w.target === 'knowledge' ? 'Knowledge decisions' : `Roadmap edits of ${w.target.replace(/^spec:/, '')}`;
    lines.push(`${what} no longer wait: ${CLOSED[w.reason]}.`);
  }
  const moved = outcome === 'fast-forwarded' || outcome === 'up-to-date';
  return { tone: fetched && moved ? 'quiet' : 'attention', lines };
}

const DAY_MS = 24 * 60 * 60_000;

/** The card's line for a clone that last fetched more than a day ago: Jig's reads never fetch, so the page is that old. */
export function staleFetch(origin: Origin, now = Date.now()): string | undefined {
  if (!origin?.fetchedAt || now - Date.parse(origin.fetchedAt) <= DAY_MS) return undefined;
  return `Last fetched from origin ${ago(origin.fetchedAt, now)}: what landed there since is not shown here.`;
}
