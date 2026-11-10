import { describe, expect, it } from 'vitest';
import type { Spec } from '../api';
import {
  agentRequests,
  filingGoal,
  itemStanding,
  itemTitle,
  itemWord,
  itemWords,
  laneOf,
  laneStep,
  openingPhase,
  shownFog,
  shownRoadmap,
  waitingItems,
  waitingState,
} from './specs';

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
  ] as const)(
    'moves the item at %i by %i to %o in a lane of its own, as Jig moves it: after another, or to the top',
    (index, by, place) => {
      expect(laneStep([at('a'), at('b'), at('c'), at('d')], index, by)).toEqual(place);
    },
  );

  // a and c to file, b done between them, d in work: a lane's moves skip the other lanes' cards and keep their places.
  const mixed = [at('a'), { ...at('b'), checked: true }, at('c'), at('d', 'd', 'task-d')];
  it.each([
    ['c up goes before a, the top', 2, -1, 'top'],
    ['a down goes after c, past b', 0, 1, { after: 'i-c' }],
    ['c is the last card to file', 2, 1, undefined],
    ['d is alone in work', 3, -1, undefined],
    ['b is alone done', 1, 1, undefined],
  ] as const)('moves an item among its lane only: %s', (_, index, by, place) => {
    expect(laneStep(mixed, index, by)).toEqual(place);
  });

  it("moves up before a card that stands after another lane's, after that card", () => {
    expect(laneStep([{ ...at('x'), checked: true }, at('a'), at('b')], 2, -1)).toEqual({ after: 'i-x' });
  });

  it('offers no step past an item without a handle, as from an older Jig', () => {
    expect(laneStep([item('a'), item('b')], 0, 1)).toBeUndefined();
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

describe('the roadmap board', () => {
  const words = (text: string) => [{ text, code: false }];

  it.each([
    ['done when checked, a task or none', { ...item('x', 'a'), checked: true }, 'done'],
    ['in work when it names a task', item('`a` — x', 'a'), 'in-work'],
    ['to file without one', item('x'), 'to-file'],
    ['to file for fog', item('fog: x', null, true), 'to-file'],
  ] as const)('puts an item in its lane: %s', (_, it_, lane) => {
    expect(laneOf(it_)).toBe(lane);
  });

  it.each([
    ['fog, italic, while it is to file', item('fog: x', null, true), 'Fog', true],
    ['its lane once a fog item names a task', item('`a` — fog: x', 'a', true), 'In work', false],
    ['its lane once a fog item is done', { ...item('fog: x', null, true), checked: true }, 'Done', false],
    ['its lane for any other', item('x'), 'To file', false],
  ] as const)('says what an item is before its title: %s', (_, it_, word, fog) => {
    expect([itemWord(it_), shownFog(it_)]).toEqual([word, fog]);
  });

  it.each([
    ['up to the first dash', item('Search — by name — and tag'), words('Search'), words('by name — and tag')],
    ['whole without a seam', item('Search products by name'), words('Search products by name'), []],
    ['without the task id, fog or dependencies', item('`a` — Search — by name (after: list)', 'a'), words('Search'), words('by name')],
    [
      'with its code runs',
      item('Run `jig init` — then `jig map`'),
      [
        { text: 'Run ', code: false },
        { text: 'jig init', code: true },
      ],
      [
        { text: 'then ', code: false },
        { text: 'jig map', code: true },
      ],
    ],
    ['whole when the text starts at the seam', item(' — by name'), words(' — by name'), []],
    [
      'up to its dependencies when words follow them',
      item('a consultation request (after: design direction — its looks) - Backend: a form'),
      words('a consultation request'),
      words('Backend: a form'),
    ],
    [
      'not at a dash in a code run',
      item('Run `a — b` — then c'),
      [
        { text: 'Run ', code: false },
        { text: 'a — b', code: true },
      ],
      words('then c'),
    ],
  ])('titles an item %s', (_, it_, title, rest) => {
    expect(itemTitle(it_)).toMatchObject({ title, rest });
  });

  it.each([
    ['at the end', item('Search — by name (after: list)'), words('list')],
    [
      'before more words, up to their closing parenthesis',
      item('Search (after: list (the old one)) - by name'),
      words('list (the old one)'),
    ],
    ['unclosed, to the end', item('Search (after: list'), words('list')],
    ['none', item('Search — by name'), null],
  ])('keeps the dependencies of a titled item apart: %s', (_, it_, after) => {
    expect(itemTitle(it_).after).toEqual(after);
  });

  const columns = new Map([['live', { id: 'in-progress', title: 'In progress' }]]);
  it.each([
    ['done, which its lane says', { ...item('x', 'live'), checked: true }, null, 'bg-emerald-500'],
    ['fog', item('fog: x', null, true), 'fog', 'bg-muted-foreground/30'],
    ['not filed', item('x'), 'not filed', 'border border-muted-foreground'],
    ["its live task's column", item('`live` — x', 'live'), 'In progress', 'bg-sky-500'],
    ['filed, a task the board does not show', item('`gone` — x', 'gone'), 'filed', 'bg-muted-foreground/60'],
  ] as const)('says where an item stands: %s', (_, it_, label, dot) => {
    expect(itemStanding(it_, columns)).toEqual({ label, dot });
  });

  it.each([
    ['the first phase with an item not done', [[{ ...item('a'), checked: true }], [item('b')], [item('c')]], 1],
    ['the last when all are done', [[{ ...item('a'), checked: true }], [{ ...item('b'), checked: true }]], 1],
    ['the first of none', [], 0],
  ] as const)('opens on %s', (_, phases, at) => {
    expect(openingPhase(phases.map((items) => ({ items: [...items] })))).toBe(at);
  });
});
