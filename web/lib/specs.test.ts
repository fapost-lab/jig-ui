import { describe, expect, it } from 'vitest';
import type { Spec } from '../api';
import { agentRequests, itemWords } from './specs';

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

describe('agentRequests', () => {
  const phase = (n: number | null, ...items: ReturnType<typeof item>[]) => ({
    phase: n,
    title: null,
    done: 0,
    total: items.length,
    filed: 0,
    fog: items.filter((i) => i.fog).length,
    items,
  });
  const spec = (fog: number, ...phases: ReturnType<typeof phase>[]): Spec => ({
    id: 'shop',
    title: null,
    missingFiles: [],
    release: null,
    epic: null,
    progress: { done: 0, total: 0, filed: 0, fog },
    phases,
    queue: null,
  });
  const done = { ...item('refunds', 'refunds'), checked: true };

  it('asks to file the tasks of the first phase with an item that has none', () => {
    const shop = spec(
      0,
      phase(null, item('before any phase')),
      phase(1, done),
      phase(2, item('refunds', 'refunds'), item('invoices')),
      phase(3, item('exports')),
    );
    expect(agentRequests(shop, 'acme')).toEqual(['File the tasks for phase 2 of spec shop in acme']);
  });

  it('asks to continue the spec while it has fog, and nothing for a fog item to file', () => {
    expect(agentRequests(spec(1, phase(1, item('fog: hosting', null, true))), 'acme')).toEqual([
      'Continue spec shop in acme: lift its fog items',
    ]);
  });

  it('asks nothing of a spec whose items all have tasks, or whose roadmap cannot be read', () => {
    expect(agentRequests(spec(0, phase(1, done, item('refunds', 'refunds'))), 'acme')).toEqual([]);
    expect(agentRequests({ ...spec(0), progress: null }, 'acme')).toEqual([]);
  });
});
