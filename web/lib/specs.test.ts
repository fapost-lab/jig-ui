import { describe, expect, it } from 'vitest';
import { itemWords } from './specs';

const item = (text: string, task: string | null = null, fog = false) => ({ text, checked: false, task, fog });

describe('itemWords', () => {
  it.each([
    ['plain words', item('invoices from orders'), [{ text: 'invoices from orders', code: false }], null],
    [
      'the task id the row already shows',
      item('`specs-and-epics` — specs and epics', 'specs-and-epics'),
      [{ text: 'specs and epics', code: false }],
      null,
    ],
    ['the task id before a hyphen', item('`refunds` -  refunds', 'refunds'), [{ text: 'refunds', code: false }], null],
    ['the task id before a double hyphen', item('`a.b` -- words', 'a.b'), [{ text: 'words', code: false }], null],
    [
      'an id that is not the task',
      item('`other` — words', 'specs-and-epics'),
      [
        { text: 'other', code: true },
        { text: ' — words', code: false },
      ],
      null,
    ],
    [
      'the fog prefix',
      item('fog: registration by `jig init`', null, true),
      [
        { text: 'registration by ', code: false },
        { text: 'jig init', code: true },
      ],
      null,
    ],
    [
      'dependencies apart',
      item('`a` — reorder (after: project board — `jig` queue)', 'a'),
      [{ text: 'reorder', code: false }],
      [
        { text: 'project board — ', code: false },
        { text: 'jig', code: true },
        { text: ' queue', code: false },
      ],
    ],
  ])('%s', (_, given, words, after) => {
    expect(itemWords(given)).toEqual({ words, after });
  });
});
