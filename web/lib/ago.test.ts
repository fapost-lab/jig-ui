import { describe, expect, it } from 'vitest';
import { ago } from './ago';

describe('ago', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  it.each([
    ['2026-10-22T11:59:30Z', 'just now'],
    ['2026-10-22T11:48:00Z', '12 min ago'],
    ['2026-10-22T09:00:00Z', '3 h ago'],
    ['2026-10-20T12:00:01Z', '47 h ago'],
    ['2026-10-20T12:00:00Z', '2 days ago'],
    ['not a time', ''],
  ])('says %s as %s', (at, said) => {
    expect(ago(at, now)).toBe(said);
  });
});
