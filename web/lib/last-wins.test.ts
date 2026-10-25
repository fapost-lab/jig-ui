import { describe, expect, it } from 'vitest';
import { lastWins } from './last-wins';

describe('lastWins', () => {
  it('lands only the answer of the last run, whatever order the answers come in', async () => {
    const answers: ((value: string | undefined) => void)[] = [];
    const landed: string[] = [];
    const load = lastWins(
      () => new Promise<string | undefined>((resolve) => answers.push(resolve)),
      (v) => landed.push(v),
    );

    const first = load();
    const second = load();
    answers[1]?.('new');
    answers[0]?.('old');
    expect(await Promise.all([first, second])).toEqual(['old', 'new']);
    expect(landed).toEqual(['new']);
  });

  it('lands nothing for a read that failed', async () => {
    const landed: string[] = [];
    await lastWins(
      async () => undefined,
      (v: string) => landed.push(v),
    )();
    expect(landed).toEqual([]);
  });
});
