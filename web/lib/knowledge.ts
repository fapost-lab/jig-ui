import type { DocumentText, Knowledge, LinkedSource, Proposal, SourceDiff } from '@/api';
import { size } from './artifacts';
import { NO_COMMITS, refusal } from './refusal';
import type { Tone } from './tones';

/** A decision taken that waits on `knowledge/decisions` until it lands, for a person: a linked file's rejection drops its link. */
export function waitingWord(waiting: NonNullable<Proposal['waiting']>, of: 'proposal' | 'source' = 'proposal'): string {
  if (of === 'source' && waiting.decision === 'rejected') return 'Dropped, waiting';
  return { accepted: 'Accepted', rejected: 'Rejected', reviewed: 'Kept' }[waiting.decision] + ', waiting';
}

/**
 * Why Jig 0.41.0 reads a record as not decidable as of the last fetch: what it is judged on does not have it yet. The
 * decision can still be sent — Jig fetches before it judges, so a push since makes it decidable, and a refusal says why.
 * `undefined` for a decidable record, and for every record of Jig 0.40.0.
 */
export function undecidable(record: Proposal | LinkedSource): string | undefined {
  if (record.decidable !== false) return undefined;
  if (record.reason === 'not-on-base') return "Not on origin's default branch as this checkout has it: commit and push it, then decide.";
  if (record.reason === 'not-on-branch') {
    return "It reached origin's default branch after knowledge/decisions was cut: decide it once the decisions waiting there have landed.";
  }
  if (landed(record))
    return "Decided on origin already, so no decision is owed: it leaves this list once this checkout has origin's default branch.";
  return 'Jig cannot decide it yet.';
}

/** Jig 0.45.0: origin's base decided the record already and this checkout is only behind — no decision is owed, none is offered. */
export const landed = (record: Proposal | LinkedSource): boolean => record.decidable === false && record.reason === 'landed';

/** A record whose file name lost bytes that are not UTF-8: the name shown may be another file's. */
export const LOSSY_NAME = "Jig dropped bytes of a file's name here that are not UTF-8: the name shown may be another file's.";

/** A text Jig read with bytes dropped that are not UTF-8. */
export const LOSSY = 'Jig dropped bytes of it that are not UTF-8.';

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

/** What became of an approved stub's linked file, and what a person can do about it here — from Jig 0.41.0 drop the link too. */
export function sourceLine(
  source: LinkedSource,
  canDrop = false,
): {
  text: string;
  tone: Tone;
} {
  if (source.state === 'changed') return { text: `${source.source} changed since it was approved.`, tone: 'attention' };
  if (source.state === 'unrecorded') {
    return { text: `${source.source}: no approved text is kept to compare with — read it whole before you keep it.`, tone: 'attention' };
  }
  if (canDrop) return { text: `${source.source} is gone: drop the link, or move it in the project (jig-accept).`, tone: 'bad' };
  return { text: `${source.source} is gone: move the link in the project (jig-accept).`, tone: 'bad' };
}

/** Which buttons a linked file offers: Keep unless it is gone, Drop from Jig 0.41.0 — on Jig 0.40.0 the NO_DROP line in its place. */
export const sourceActions = (
  source: LinkedSource,
  canDrop: boolean,
): {
  keep: boolean;
  drop: boolean;
} => ({ keep: source.state !== 'missing', drop: canDrop });

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

/** A document's text without its frontmatter, whose fields the view shows above it. */
export const body = (content: string): string => content.replace(/^---\r?\n(?:[^]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, '');

/** A file the view renders as Markdown; any other is shown as it is. */
export const isMarkdown = (path: string): boolean => /\.(md|mdx|markdown)$/i.test(path);

/** A file of an open document as the view shows it: its path, its text, whether it is Markdown, whether bytes were dropped. */
export interface TextPart {
  path: string;
  text: string;
  markdown: boolean;
  lossy: boolean;
}

/**
 * An open document as the view shows it: being read, no longer proposed, unreadable, or its text without the frontmatter
 * and, for a stub, the file it links as it is now.
 */
export type ShownText =
  | { kind: 'reading' | 'gone' | 'failed' }
  | {
      kind: 'text';
      parts: TextPart[];
    };

export function shownText(proposal: Proposal, read: DocumentText | 'reading' | 'not-found'): ShownText {
  if (read === 'reading') return { kind: 'reading' };
  if (read === 'not-found') return { kind: 'gone' };
  if (read.state !== 'ready') return { kind: 'failed' };
  const parts = [{ path: proposal.path, text: body(read.content), markdown: isMarkdown(proposal.path), lossy: read.lossy }];
  if (read.source && proposal.source !== null) {
    parts.push({ path: proposal.source, text: read.source.content, markdown: isMarkdown(proposal.source), lossy: read.source.lossy });
  }
  return { kind: 'text', parts };
}

/**
 * The line for a decision Jig refused, other than a stale revision: `agent.git: none` sends the person to Settings; a
 * document no longer open to it, or one Jig 0.40.0 did not find on its branch, is said so; otherwise Jig's own reasons —
 * Jig 0.41.0 says itself why a document is not where the decision is judged —, paths already cut out by the server, or
 * the code.
 */
export function knowledgeRefusal(code: string, reasons: string[], doc: string): string {
  if (code === 'git-not-allowed') return NO_COMMITS;
  if (code === 'not-found') return `${doc} no longer waits for that decision: the knowledge is shown as it is now.`;
  if (code === 'not-on-branch' && reasons.length === 0) {
    return `Jig did not find ${doc} on knowledge/decisions, which starts from origin's default branch: push the commit that proposed it, or let the decisions waiting there land first.`;
  }
  if (reasons.length > 0) return `Jig did not decide ${doc}: ${reasons.join(' ')}`;
  return refusal(code, 'deciding', doc);
}
