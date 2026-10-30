import { describe, expect, it } from 'vitest';
import { documentLine, noDocuments, size } from './artifacts';

const now = Date.parse('2026-10-30T09:00:00Z');
const at = '2026-10-30T07:00:00Z';

describe('documentLine', () => {
  it('says when a document was written and its size', () => {
    expect(documentLine({ kind: 'plan', state: 'present', reason: null, updatedAt: at, bytes: 1993 }, now)).toEqual({
      text: 'written 2 h ago · 1.9 KB',
      tone: 'quiet',
    });
    expect(size(512)).toBe('512 B');
  });

  it('says a document is empty, or why Jig cannot read it', () => {
    expect(documentLine({ kind: 'verification', state: 'empty', reason: null, updatedAt: at, bytes: 0 }, now).text).toBe('empty');
    expect(documentLine({ kind: 'handoff', state: 'unavailable', reason: 'outside workspace', updatedAt: null, bytes: null }, now)).toEqual(
      {
        text: 'cannot be read: outside workspace',
        tone: 'bad',
      },
    );
  });
});

describe('noDocuments', () => {
  it('says why there is no list, and nothing when there is one', () => {
    expect(noDocuments({ state: 'ready', artifacts: [] })).toBe('No documents yet.');
    expect(
      noDocuments({ state: 'ready', artifacts: [{ kind: 'task', state: 'present', reason: null, updatedAt: at, bytes: 9 }] }),
    ).toBeUndefined();
    expect(noDocuments({ id: 'x', state: 'unsupported', jigVersion: '0.38.1', minimum: '0.39.0' })).toBe(
      "Jig 0.39.0 or later in the project lists the task's documents.",
    );
    expect(noDocuments({ id: 'x', state: 'unreadable', code: 'timeout' })).toBe('Jig did not answer in time.');
    expect(noDocuments({ id: 'x', state: 'unreadable', code: 'upgrading' })).toContain('being upgraded');
  });
});
