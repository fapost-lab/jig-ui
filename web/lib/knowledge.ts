import type { Knowledge, LinkedSource, Proposal, SourceDiff } from '@/api';
import { size } from './artifacts';
import { NO_COMMITS, refusal } from './refusal';
import type { Tone } from './tones';

/** A decision taken that waits on `knowledge/decisions` until it lands, for a person. */
export function waitingWord(waiting: NonNullable<Proposal['waiting']>): string {
  return { accepted: 'Accepted', rejected: 'Rejected', reviewed: 'Kept' }[waiting.decision] + ', waiting';
}

/** What accepting a proposal makes agents read it for: the paths and domains Jig lists, each as Jig wrote it. */
export function bindsLine(proposal: Proposal): string {
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : 'none');
  return `Paths: ${list(proposal.paths)} · Domains: ${list(proposal.domains)}`;
}

/** The file a stub links, its size, or that it is gone; `undefined` for a document that links none. */
export function stubLine(proposal: Proposal): string | undefined {
  if (proposal.source === null) return undefined;
  return proposal.bytes === null ? `Links ${proposal.source}, which is missing.` : `Links ${proposal.source}, ${size(proposal.bytes)}.`;
}

/** Jig 0.40.0 gives no document's text (fapost-lab/jig#391): the file the person reads before deciding. */
export const readFirst = (proposal: Proposal): string =>
  `Jig cannot give Jig UI a document's text yet (fapost-lab/jig#391): read ${proposal.source ?? proposal.path} before you decide.`;

/** What became of an approved stub's linked file, and what a person can do about it here. */
export function sourceLine(source: LinkedSource): {
  text: string;
  tone: Tone;
} {
  if (source.state === 'changed') return { text: `${source.source} changed since it was approved.`, tone: 'attention' };
  if (source.state === 'unrecorded') {
    return { text: `${source.source}: no approved text is kept to compare with — read it whole before you keep it.`, tone: 'attention' };
  }
  return { text: `${source.source} is gone: move the link in the project (jig-accept).`, tone: 'bad' };
}

/** Jig 0.40.0 cannot drop the link of an approved stub: its `reject` takes only a proposal (fapost-lab/jig#392). */
export const NO_DROP = 'Dropping the link has no Jig command yet (fapost-lab/jig#392).';

/** The knowledge view's line when there is nothing to show as a list: nothing waits, or why Jig cannot list it. */
export function noKnowledge(answer: Knowledge): string | undefined {
  if (answer.state === 'ready')
    return answer.proposals.length + answer.sources.length === 0 ? 'Nothing waits for your decision.' : undefined;
  if (answer.state === 'unsupported') {
    return `This project runs Jig ${answer.jigVersion ?? 'of an unknown version'}; deciding knowledge here needs Jig ${answer.minimum} — run jig upgrade in the project.`;
  }
  if (answer.state === 'incompatible') return `Jig ${answer.jigVersion} lists the knowledge in a form this Jig UI does not read.`;
  if (answer.state === 'unreadable') {
    if (answer.code === 'upgrading') return 'Jig is being upgraded in the project; the knowledge is listed again once it is done.';
    return answer.code === 'timeout' ? 'Jig did not answer in time.' : 'Jig could not list the knowledge.';
  }
  return 'The project cannot be read.';
}

/** A line of a unified diff with the tone of what it says: added, removed, a hunk's place, or unchanged. */
export function diffLines(diff: string): {
  text: string;
  tone: Tone | null;
}[] {
  return diff
    .replace(/\n$/, '')
    .split('\n')
    .map((text) => ({
      text,
      tone:
        /^(\+\+\+|---) /.test(text) || text.startsWith('@@')
          ? 'quiet'
          : text.startsWith('+')
            ? 'good'
            : text.startsWith('-')
              ? 'bad'
              : null,
    }));
}

/** An open diff as the view shows it: being read, gone from Jig's list, unreadable, no approved text to compare, or its lines. */
export type ShownDiff =
  | { kind: 'reading' | 'gone' | 'failed' | 'whole' }
  | {
      kind: 'lines';
      lines: ReturnType<typeof diffLines>;
      lossy: boolean;
    };

export function shownDiff(read: SourceDiff | 'reading' | 'not-found'): ShownDiff {
  if (read === 'reading') return { kind: 'reading' };
  if (read === 'not-found') return { kind: 'gone' };
  if (read.state !== 'ready') return { kind: 'failed' };
  return read.diff === null ? { kind: 'whole' } : { kind: 'lines', lines: diffLines(read.diff), lossy: read.lossy };
}

/**
 * The line for a decision Jig refused, other than a stale revision: `agent.git: none` sends the person to Settings; a
 * document no longer open to it, or one Jig did not find on its branch, is said so; otherwise Jig's own reasons, paths
 * already cut out by the server, or the code.
 */
export function knowledgeRefusal(code: string, reasons: string[], doc: string): string {
  if (code === 'git-not-allowed') return NO_COMMITS;
  if (code === 'not-found') return `${doc} no longer waits for that decision: the knowledge is shown as it is now.`;
  if (code === 'not-on-branch') {
    return `Jig did not find ${doc} on knowledge/decisions, which starts from origin's default branch: push the commit that proposed it, or let the decisions waiting there land first.`;
  }
  if (reasons.length > 0) return `Jig did not decide ${doc}: ${reasons.join(' ')}`;
  return refusal(code, 'deciding', doc);
}
