import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import type { DocumentDecision } from '@/api';
import { useDecisions } from './decisions';

/** A write the test lets end when it says: each send is held until `end(written)`. */
function writes() {
  const sent: DocumentDecision[][] = [];
  const ends: ((written: boolean) => void)[] = [];
  const send = (decisions: DocumentDecision[]) => {
    sent.push(decisions);
    return new Promise<boolean>((resolve) => ends.push(resolve));
  };
  const end = async (written = true) => {
    ends.shift()!(written);
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { sent, send, end };
}

describe('useDecisions', () => {
  it('sends a press at once, and the presses made while it runs together, as the next write', async () => {
    const { sent, send, end } = writes();
    const d = useDecisions(send, () => true);
    d.decide('a', 'accept');
    expect(sent).toEqual([[{ doc: 'a', decision: 'accept' }]]);
    d.decide('b', 'reject');
    d.decide('c', 'reviewed');
    expect([...d.sending.value]).toEqual([['a', 'accept']]);
    expect([...d.queued.value]).toEqual([
      ['b', 'reject'],
      ['c', 'reviewed'],
    ]);
    await end();
    expect(sent[1]).toEqual([
      { doc: 'b', decision: 'reject' },
      { doc: 'c', decision: 'reviewed' },
    ]);
    expect(d.queued.value.size).toBe(0);
    await end();
    expect(d.sending.value.size).toBe(0);
    d.decide('e', 'accept');
    expect(sent).toHaveLength(3);
  });

  it('takes back a queued document before its write, and none being sent, nor one pressed twice', async () => {
    const { sent, send, end } = writes();
    const d = useDecisions(send, () => true);
    d.decide('a', 'accept');
    d.decide('b', 'reject');
    d.decide('c', 'accept');
    d.takeBack('b');
    d.takeBack('a');
    d.decide('a', 'reject');
    d.decide('c', 'reject');
    expect([...d.sending.value]).toEqual([['a', 'accept']]);
    await end();
    expect(sent[1]).toEqual([{ doc: 'c', decision: 'accept' }]);
  });

  it('gives back the refused write and what waits behind it', async () => {
    const { sent, send, end } = writes();
    const d = useDecisions(send, () => true);
    d.decide('a', 'accept');
    d.decide('b', 'reject');
    await end(false);
    expect([d.sending.value.size, d.queued.value.size, sent.length]).toEqual([0, 0, 1]);
    d.decide('a', 'accept');
    expect(sent).toHaveLength(2);
  });

  it('gives back a write that failed outright', async () => {
    const d = useDecisions(
      () => Promise.reject(new Error('gone')),
      () => true,
    );
    d.decide('a', 'accept');
    await new Promise((resolve) => setTimeout(resolve));
    expect([d.sending.value.size, d.queued.value.size]).toEqual([0, 0]);
  });

  it('drops what waits when the page that holds it goes, sending nothing more', async () => {
    const { sent, send, end } = writes();
    const page = effectScope();
    const d = page.run(() => useDecisions(send, () => true))!;
    d.decide('a', 'accept');
    d.decide('b', 'reject');
    page.stop();
    await end();
    expect(sent).toEqual([[{ doc: 'a', decision: 'accept' }]]);
    expect(d.queued.value.size).toBe(0);
  });

  it('sends one decision a write below Jig 0.44.0, one after another', async () => {
    const { sent, send, end } = writes();
    const d = useDecisions(send, () => false);
    d.decide('a', 'accept');
    d.decide('b', 'reject');
    d.decide('c', 'reviewed');
    await end();
    await end();
    expect(sent).toEqual([[{ doc: 'a', decision: 'accept' }], [{ doc: 'b', decision: 'reject' }], [{ doc: 'c', decision: 'reviewed' }]]);
  });
});
