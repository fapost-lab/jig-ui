import { describe, expect, it } from 'vitest';
import type { LinkedSource, Proposal, ReadyKnowledge } from '@/api';
import {
  bindsLine,
  body,
  diffLines,
  isMarkdown,
  knowledgeRefusal,
  newer,
  pendingLine,
  noKnowledge,
  readFirst,
  shownDiff,
  shownText,
  sourceActions,
  sourceLine,
  stubLine,
  landed,
  undecidable,
  waitingWord,
} from './knowledge';

const proposal = (more: Partial<Proposal> = {}): Proposal => ({
  id: 'feature-checkout',
  type: 'feature',
  domains: [],
  path: '.ai/knowledge/features/checkout.md',
  paths: ['src/checkout/**'],
  summary: 'How checkout takes a card payment',
  source: null,
  bytes: null,
  waiting: null,
  decidable: null,
  reason: null,
  lossy: null,
  ...more,
});
const linked = (state: LinkedSource['state'], more: Partial<LinkedSource> = {}): LinkedSource => ({
  id: 'convention-rules',
  state,
  source: 'docs/rules.md',
  bytes: 106,
  waiting: null,
  decidable: null,
  reason: null,
  lossy: null,
  ...more,
});

describe('a proposal', () => {
  it('says what accepting it makes agents read it for', () => {
    expect(bindsLine(proposal())).toBe('Paths: src/checkout/** · Domains: none');
    expect(bindsLine(proposal({ paths: ['a/**', 'b/**'], domains: ['shop'] }))).toBe('Paths: a/**, b/** · Domains: shop');
  });

  it("names a stub's linked file, its size, or that it is gone", () => {
    expect(stubLine(proposal())).toBeUndefined();
    expect(stubLine(proposal({ source: 'docs/style.md', bytes: 43 }))).toBe('Links docs/style.md, 43 B.');
    expect(stubLine(proposal({ source: 'docs/empty.md', bytes: 0 }))).toBe('Links docs/empty.md, 0 B.');
    expect(stubLine(proposal({ source: 'docs/ops.md', bytes: null }))).toBe('Links docs/ops.md, which is missing.');
  });

  it("sends the person to the document's file, or a stub's linked one, until Jig gives its text", () => {
    expect(readFirst(proposal())).toContain('read .ai/knowledge/features/checkout.md before you decide');
    expect(readFirst(proposal({ source: 'docs/style.md' }))).toContain('read docs/style.md before you decide');
  });

  it('says a decision waits on its branch', () => {
    expect(waitingWord({ decision: 'accepted', pr: null })).toBe('Accepted, waiting');
    expect(waitingWord({ decision: 'rejected', pr: null })).toBe('Rejected, waiting');
    expect(waitingWord({ decision: 'reviewed', pr: null })).toBe('Kept, waiting');
    expect(waitingWord({ decision: 'rejected', pr: null }, 'source')).toBe('Dropped, waiting');
    expect(waitingWord({ decision: 'reviewed', pr: null }, 'source')).toBe('Kept, waiting');
  });

  it('says why a decision sent now would be refused, and nothing for one that would be judged as shown', () => {
    expect(undecidable(proposal())).toBeUndefined();
    expect(undecidable(proposal({ decidable: true }))).toBeUndefined();
    expect(undecidable(proposal({ decidable: false, reason: 'not-on-base' }))).toBe(
      "Not on origin's default branch as this checkout has it: commit and push it, then decide.",
    );
    expect(undecidable(linked('changed', { decidable: false, reason: 'not-on-branch' }))).toContain(
      'decide it once the decisions waiting there have landed',
    );
    expect(undecidable(proposal({ decidable: false, reason: 'later' }))).toBe('Jig cannot decide it yet.');
  });

  it("says a record origin decided already is decided, and that it is not the person's to decide", () => {
    const decided = proposal({ decidable: false, reason: 'landed' });
    expect(undecidable(decided)).toBe(
      "Decided on origin already, so no decision is owed: it leaves this list once this checkout has origin's default branch.",
    );
    expect(landed(decided)).toBe(true);
    expect(landed(linked('changed', { decidable: false, reason: 'landed' }))).toBe(true);
    expect(landed(proposal({ decidable: false, reason: 'not-on-base' }))).toBe(false);
    expect(landed(proposal())).toBe(false);
  });
});

describe("a document's text", () => {
  it('cuts the frontmatter, and only a frontmatter that opens the file', () => {
    expect(body('---\nid: x\npaths:\n  - "a/**"\n---\n# X\n\nText.\n')).toBe('# X\n\nText.\n');
    expect(body('---\r\nid: x\r\n---\r\n# X\r\n')).toBe('# X\r\n');
    expect(body('# X\n\n---\n\nmore\n---\n')).toBe('# X\n\n---\n\nmore\n---\n');
    expect(body('---\nid: x\n---')).toBe('');
    expect(body('---\n---\n# X\n')).toBe('# X\n');
  });

  it('renders a Markdown file, and shows any other as it is', () => {
    expect(['a.md', 'docs/B.MDX', 'c.markdown'].map(isMarkdown)).toEqual([true, true, true]);
    expect(['a.txt', 'Makefile', 'a.md.bak', 'md'].map(isMarkdown)).toEqual([false, false, false, false]);
  });

  it("shows a document being read, gone, unreadable, or its text and a stub's linked file", () => {
    const stub = proposal({ path: '.ai/knowledge/sources/style.md', source: 'docs/style.txt', bytes: 9 });
    expect(shownText(stub, 'reading')).toEqual({ kind: 'reading' });
    expect(shownText(stub, 'not-found')).toEqual({ kind: 'gone' });
    expect(shownText(stub, { id: 'x', state: 'unreadable', code: 'timeout' })).toEqual({ kind: 'failed' });
    const read = {
      state: 'ready' as const,
      content: '---\nid: s\n---\n# Style\n',
      lossy: false,
      source: { content: 'Use tabs.\n', lossy: true },
    };
    expect(shownText(stub, read)).toEqual({
      kind: 'text',
      parts: [
        { path: '.ai/knowledge/sources/style.md', text: '# Style\n', markdown: true, lossy: false },
        { path: 'docs/style.txt', text: 'Use tabs.\n', markdown: false, lossy: true },
      ],
    });
    // A stub whose file is gone reads no linked file.
    expect(shownText(stub, { ...read, source: null })).toMatchObject({ parts: [{ path: '.ai/knowledge/sources/style.md' }] });
  });
});

describe('sourceLine', () => {
  it('says what became of a linked file, the gone one as wrong', () => {
    expect(sourceLine(linked('changed'))).toEqual({ text: 'docs/rules.md changed since it was approved.', tone: 'attention' });
    expect(sourceLine(linked('unrecorded')).text).toContain('read it whole before you keep it');
    expect(sourceLine(linked('missing'))).toEqual({
      text: 'docs/rules.md is gone: move the link in the project (jig-accept).',
      tone: 'bad',
    });
    expect(sourceLine(linked('missing'), true).text).toBe('docs/rules.md is gone: drop the link, or move it in the project (jig-accept).');
  });
});

describe('sourceActions', () => {
  it('offers Keep unless the file is gone, and Drop only from Jig 0.41.0', () => {
    expect(sourceActions(linked('changed'), false)).toEqual({ keep: true, drop: false });
    expect(sourceActions(linked('unrecorded'), true)).toEqual({ keep: true, drop: true });
    expect(sourceActions(linked('missing'), false)).toEqual({ keep: false, drop: false });
    expect(sourceActions(linked('missing'), true)).toEqual({ keep: false, drop: true });
  });
});

describe('noKnowledge', () => {
  const ready: ReadyKnowledge = {
    state: 'ready',
    revision: 1,
    proposals: [],
    sources: [],
    waiting: null,
    canRead: false,
    canDrop: false,
    canDecideMany: false,
  };

  it('says nothing waits, and nothing while something does', () => {
    expect(noKnowledge(ready)).toBe('Nothing waits for your decision.');
    expect(noKnowledge({ ...ready, sources: [linked('changed')] })).toBeUndefined();
  });

  it('says which Jig a project runs that cannot list the knowledge, or why Jig could not', () => {
    expect(noKnowledge({ id: 'x', state: 'unsupported', jigVersion: '0.39.0', minimum: '0.40.0' })).toBe(
      'This project runs Jig 0.39.0; deciding knowledge here needs Jig 0.40.0 — run jig upgrade in the project.',
    );
    expect(noKnowledge({ id: 'x', state: 'unreadable', code: 'upgrading' })).toContain('being upgraded');
    expect(noKnowledge({ id: 'x', state: 'unreadable', code: 'timeout' })).toBe('Jig did not answer in time.');
    expect(noKnowledge({ id: 'x', state: 'unreadable', code: 'failed' })).toBe('Jig could not list the knowledge.');
  });
});

describe('diffLines', () => {
  it('tones what a unified diff adds and removes, its headers and hunks quiet', () => {
    expect(
      diffLines(
        '--- docs/rules.md (approved)\n+++ docs/rules.md\n@@ -1,2 +1,2 @@\n # Rules\n-- Ship on green.\n+- Ship on green, after CI.\n',
      ),
    ).toEqual([
      { text: '--- docs/rules.md (approved)', tone: 'quiet' },
      { text: '+++ docs/rules.md', tone: 'quiet' },
      { text: '@@ -1,2 +1,2 @@', tone: 'quiet' },
      { text: ' # Rules', tone: null },
      { text: '-- Ship on green.', tone: 'bad' },
      { text: '+- Ship on green, after CI.', tone: 'good' },
    ]);
  });
});

describe('shownDiff', () => {
  it('says an open diff is being read, gone, unreadable, or has no approved text to compare with', () => {
    expect(shownDiff('reading')).toEqual({ kind: 'reading' });
    expect(shownDiff('not-found')).toEqual({ kind: 'gone' });
    expect(shownDiff({ id: 'x', state: 'unreadable', code: 'failed' })).toEqual({ kind: 'failed' });
    expect(shownDiff({ state: 'ready', diff: null, lossy: false })).toEqual({ kind: 'whole' });
    expect(shownDiff({ state: 'ready', diff: '+a\n', lossy: true })).toEqual({
      kind: 'lines',
      lines: [{ text: '+a', tone: 'good' }],
      lossy: true,
    });
  });
});

describe('knowledgeRefusal', () => {
  it.each([
    ['git-not-allowed', [], "Jig commits nothing in this clone (agent.git is none): choose a level in the project's Settings."],
    ['not-found', [], 'feature-checkout no longer waits for that decision: the knowledge is shown as it is now.'],
    [
      'not-on-branch',
      [],
      "Jig did not find feature-checkout on knowledge/decisions, which starts from origin's default branch: push the commit that proposed it, or let the decisions waiting there land first.",
    ],
    [
      'branch-checked-out',
      ['knowledge/decisions is checked out in … and Jig never moves a checkout.'],
      'Jig did not decide feature-checkout: knowledge/decisions is checked out in … and Jig never moves a checkout.',
    ],
    ['upgrading', [], 'Jig is being upgraded in this project: try deciding feature-checkout again once it has finished.'],
    // Jig 0.41.0 says itself why a document is not where the decision is judged.
    [
      'not-on-branch',
      ['feature-checkout, as this checkout has it, reached main after knowledge/decisions was cut'],
      'Jig did not decide feature-checkout: feature-checkout, as this checkout has it, reached main after knowledge/decisions was cut',
    ],
    ['not-on-base', ['commit and push it, then decide'], 'Jig did not decide feature-checkout: commit and push it, then decide'],
    ['write-still-waits', ['Move them to a branch of your own'], 'Jig did not decide feature-checkout: Move them to a branch of your own'],
  ])('says %s, and that every decision is back', (code, reasons, text) => {
    expect(knowledgeRefusal(code, reasons, 'feature-checkout')).toBe(
      `${/[.!?]$/.test(text) ? text : `${text}.`} Nothing was written: your decisions are back for you to decide.`,
    );
  });

  it('says a stale read as the knowledge having changed, and a refusal that names no document as about them all', () => {
    expect(knowledgeRefusal('stale-revision', ['the clone changed since revision 1'], null)).toBe(
      'The knowledge changed since it was shown: your decisions are back, decide them on it as it is now.',
    );
    expect(knowledgeRefusal('write-still-waits', ['Move them to a branch of your own'], null)).toBe(
      'Jig did not decide them: Move them to a branch of your own. Nothing was written: your decisions are back for you to decide.',
    );
  });
});

describe('pendingLine', () => {
  it.each([
    ['accept', 'proposal', false, 'Accepted, queued'],
    ['reject', 'proposal', true, 'Rejected, sending…'],
    ['reviewed', 'source', false, 'Kept, queued'],
    ['reject', 'source', true, 'Dropped, sending…'],
  ] as const)('says %s of a %s, sending %s, as %s', (decision, of, sending, line) => {
    expect(pendingLine(decision, of, sending)).toBe(line);
  });
});

describe('newer', () => {
  const at = (revision: number): ReadyKnowledge => ({
    state: 'ready',
    revision,
    proposals: [],
    sources: [],
    waiting: null,
    canRead: false,
    canDrop: false,
    canDecideMany: false,
  });

  it('is a ready read past the revision shown, or over nothing ready', () => {
    expect(newer(at(8), at(7))).toBe(true);
    expect(newer(at(7), at(7))).toBe(false);
    expect(newer(at(7), at(8))).toBe(false);
    expect(newer(at(7), undefined)).toBe(true);
    expect(newer(at(7), { id: 'x', state: 'unreadable', code: 'failed' })).toBe(true);
    expect(newer({ id: 'x', state: 'unreadable', code: 'failed' }, at(7))).toBe(false);
    expect(newer('not-connected', undefined)).toBe(false);
  });
});
