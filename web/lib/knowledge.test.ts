import { describe, expect, it } from 'vitest';
import type { LinkedSource, Proposal, ReadyKnowledge } from '@/api';
import { bindsLine, diffLines, knowledgeRefusal, noKnowledge, readFirst, shownDiff, sourceLine, stubLine, waitingWord } from './knowledge';

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
  ...more,
});
const linked = (state: LinkedSource['state']): LinkedSource => ({
  id: 'convention-rules',
  state,
  source: 'docs/rules.md',
  bytes: 106,
  waiting: null,
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
  });
});

describe('noKnowledge', () => {
  const ready: ReadyKnowledge = { state: 'ready', revision: 1, proposals: [], sources: [], waiting: null };

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
  ])('says %s', (code, reasons, text) => {
    expect(knowledgeRefusal(code, reasons, 'feature-checkout')).toBe(text);
  });
});
