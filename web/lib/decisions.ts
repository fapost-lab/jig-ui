import { onScopeDispose, ref } from 'vue';
import type { Decision, DocumentDecision } from '@/api';

/**
 * Knowledge decisions in the background: a press queues its document at once, and whatever is queued goes as one write
 * as soon as none runs — what is pressed while one runs goes as the next. `send` makes the write and reads the knowledge
 * again, answering whether Jig wrote it; a refusal gives back everything, the write's and what waits behind it, since
 * Jig wrote none of them and most refusals would refuse the rest too — an answer this Jig UI cannot read may have written
 * the write's, and the knowledge read after it no longer offers those. `many` is false below Jig 0.44.0: one decision a
 * write. A queued document can be taken back until its write starts. The queue ends with the page that holds it: what
 * waits is dropped, never sent behind a page nobody sees.
 */
export function useDecisions(send: (decisions: DocumentDecision[]) => Promise<boolean>, many: () => boolean) {
  const queued = ref(new Map<string, Decision>());
  const sending = ref(new Map<string, Decision>());

  onScopeDispose(() => queued.value.clear(), true);

  let running = false;
  async function run(): Promise<void> {
    running = true;
    while (queued.value.size > 0) {
      const batch = [...queued.value].slice(0, many() ? undefined : 1);
      for (const [doc] of batch) queued.value.delete(doc);
      sending.value = new Map(batch);
      const written = await send(batch.map(([doc, decision]) => ({ doc, decision }))).catch(() => false);
      sending.value = new Map();
      if (!written) queued.value.clear();
    }
    running = false;
  }

  return {
    queued,
    sending,
    decide(doc: string, decision: Decision): void {
      if (queued.value.has(doc) || sending.value.has(doc)) return;
      queued.value.set(doc, decision);
      if (!running) void run();
    },
    takeBack(doc: string): void {
      queued.value.delete(doc);
    },
  };
}
