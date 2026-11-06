import { describe, expect, it } from 'vitest';
import type { Spec } from '../api';
import { agentRequests, filingGoal, itemStep, itemWords, shownRoadmap, waitingItems, waitingState } from './specs';

const item = (text: string, task: string | null = null, fog = false, id: string | null = null) => ({ id, text, checked: false, task, fog });

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
    waiting: null,
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

describe('editing a roadmap', () => {
  const at = (id: string, text = id, task: string | null = null) => item(text, task, false, `i-${id}`);
  const phase = (n: number, items: ReturnType<typeof item>[]) => ({
    phase: n,
    title: null,
    done: 0,
    total: items.length,
    filed: 0,
    fog: 0,
    items,
  });
  const progress = { done: 0, total: 3, filed: 0, fog: 0 };
  const spec = (waiting: Spec['waiting']): Spec =>
    ({
      id: 'shop',
      title: null,
      missingFiles: [],
      release: null,
      epic: null,
      progress,
      phases: [phase(1, [at('a'), at('b')]), phase(2, [at('c')])],
      waiting,
      queue: null,
    }) as Spec;
  const waiting = (phases: Spec['phases']): NonNullable<Spec['waiting']> => ({
    branch: 'spec/shop',
    base: 'main',
    commits: 2,
    pushed: false,
    pr: null,
    progress: { ...progress, total: 4 },
    phases,
  });

  it("shows the roadmap on the spec's branch while edits wait there, else the one read", () => {
    const branch = waiting([phase(1, [at('a')]), phase(2, [at('c'), at('b')])]);
    expect(shownRoadmap(spec(branch))).toBe(branch);
    expect(shownRoadmap(spec(null)).phases.map((p) => p.items.map((i) => i.id))).toEqual([['i-a', 'i-b'], ['i-c']]);
  });

  it('marks the items an edit waiting changed: new, in another phase, or filed; a move within a phase is not', () => {
    const branch = waiting([phase(1, [at('b'), at('a', '`t` — a', 't')]), phase(2, [at('c'), at('d')])]);
    expect(waitingItems(spec(branch))).toEqual(new Set(['i-a', 'i-d']));
    expect(waitingItems(spec(waiting([phase(1, [at('a')]), phase(2, [at('c'), at('b')])])))).toEqual(new Set(['i-b']));
    expect(waitingItems(spec(null))).toEqual(new Set());
  });

  it('says how far the waiting edits went without a pull request', () => {
    expect(waitingState(waiting([]))).toBe('committed in this clone, not pushed');
    expect(waitingState({ ...waiting([]), pushed: true })).toBe('pushed, no pull request yet');
  });

  it.each([
    [0, -1, undefined],
    [1, -1, 'top'],
    [2, -1, { after: 'i-a' }],
    [3, -1, { after: 'i-b' }],
    [0, 1, { after: 'i-b' }],
    [2, 1, { after: 'i-d' }],
    [3, 1, undefined],
  ] as const)('moves the item at %i by %i to %o, as Jig moves it: after another, or to the top', (index, by, place) => {
    expect(itemStep([at('a'), at('b'), at('c'), at('d')], index, by)).toEqual(place);
  });

  it('offers no step past an item without a handle, as from an older Jig', () => {
    expect(itemStep([item('a'), item('b')], 0, 1)).toBeUndefined();
  });

  it.each([
    ['its words', item('Search products — by name'), 'Search products — by name'],
    ['without its dependencies', item('Search — by name (after: list — it searches them)'), 'Search — by name'],
    ['without fog', item('fog: recommendations — `ml` maybe', null, true), 'recommendations — `ml` maybe'],
    ["cut to Jig's 500", item('x'.repeat(600)), 'x'.repeat(500)],
  ])('starts a filed goal with %s', (_, it_, goal) => {
    expect(filingGoal(it_)).toBe(goal);
  });
});
