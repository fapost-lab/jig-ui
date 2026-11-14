import { describe, expect, it } from 'vitest';
import { closeRefusal, fileItemRefusal, reasonsOf, refusal, roadmapRefusal, unnamedRefusal } from './refusal';

describe('reasonsOf', () => {
  it("reads Jig's reasons as lines, and none from an answer without them or with them in another shape", () => {
    expect(reasonsOf({ code: 'refused', reasons: ['not merged', 7] })).toEqual(['not merged', '7']);
    expect(reasonsOf({ code: 'refused' })).toEqual([]);
    expect(reasonsOf({ code: 'refused', reasons: 'not merged' })).toEqual([]);
  });
});

describe('refusal', () => {
  it.each([
    ['wrong-checkout', 'a keeps its work in a stash: run jig task resume a in the project, on its branch.'],
    [
      'stash-conflict',
      "a's stash did not apply cleanly in the project's checkout: resolve the conflicts there, then run jig task resume a.",
    ],
    ['not-paused', 'Somebody resumed a first.'],
    ['already-paused', 'Somebody paused a first.'],
    ['upgrading', 'Jig is being upgraded in this project: try resuming a again once it has finished.'],
    ['incompatible', 'Jig answered resuming a in a form this Jig UI does not read, and may have done it: update Jig UI.'],
    ['already-exists', 'Jig refused resuming a (already-exists).'],
  ])('says %s in its own words', (code, line) => {
    expect(refusal(code, 'resuming', 'a')).toBe(line);
  });
});

describe('closeRefusal', () => {
  it.each([
    ['failed', ['its pull request is open;', 'merge it'], 'Jig did not close a: its pull request is open; merge it'],
    ['failed', [], 'Jig refused closing a (failed).'],
    ['not-found', [], 'a cannot be closed from the page any more: read it again.'],
    ['stale-revision', ['written since'], 'The project changed while you were closing a. Try again on it as it is now.'],
    ['upgrading', [], 'Jig is being upgraded in this project: try closing a again once it has finished.'],
  ])('says %s with %j in its own words', (code, reasons, line) => {
    expect(closeRefusal(code, reasons, 'a')).toBe(line);
  });
});

describe('roadmapRefusal', () => {
  it.each([
    ['git-not-allowed', [], "Jig commits nothing in this clone (agent.git is none): choose a level in the project's Settings."],
    ['not-found', [], 'The roadmap of shop no longer has what you were moving: try again on the specs as they are now.'],
    ['branch-checked-out', ['spec/shop is checked out in …'], 'Jig did not change the roadmap of shop: spec/shop is checked out in …'],
    // Jig 0.41.0: an earlier edit still waits where this one cannot follow; Jig's line says what to do.
    [
      'write-still-waits',
      ['spec/shop has 1 edit(s) that never reached origin, …'],
      'Jig did not change the roadmap of shop: spec/shop has 1 edit(s) that never reached origin, …',
    ],
    ['write-busy', [], 'Jig refused moving the roadmap of shop (write-busy).'],
  ])('says %s', (code, reasons, line) => {
    expect(roadmapRefusal(code, reasons, 'moving', 'shop')).toBe(line);
  });
});

describe('unnamedRefusal', () => {
  it('says the task was filed, why it was not named, and how to name it', () => {
    expect(unnamedRefusal('branch-checked-out', ['spec/shop is checked out in …'], 'search')).toBe(
      'Filed search, but Jig did not name it on the item (spec/shop is checked out in …). Once that is resolved, File task… again with search.',
    );
    expect(unnamedRefusal('write-busy', [], 'search')).toContain('the item (write-busy).');
  });
});

describe('fileItemRefusal', () => {
  it.each([
    // Jig 0.40.0: the task was filed and Jig refused to name it.
    ['branch-checked-out', ['spec/shop is checked out in …'], true, false, 'Filed search, but Jig did not name it on the item'],
    // An id the server found among the finished tasks, whatever Jig's line.
    ['already-exists', ['task already exists: search'], false, true, 'The project has a finished task called search. Choose another id.'],
    // Any other `already-exists` of `--new` (Jig 0.41.0) in Jig's own line.
    [
      'already-exists',
      ['i-aaaaaaaaaaaa already names task other'],
      false,
      false,
      'Jig did not file search: i-aaaaaaaaaaaa already names task other',
    ],
    // Jig 0.42.0: an item that names a task already has a code of its own.
    [
      'already-filed',
      ['i-aaaaaaaaaaaa already names task other'],
      false,
      false,
      'The item names a task already, filed from another clone perhaps: the roadmap is shown as it is now.',
    ],
    ['usage', [], false, false, 'Jig does not take this id or goal: one line of goal, not starting with #.'],
  ])('says %s with %j', (code, reasons, filed, taken, line) => {
    expect(fileItemRefusal(code, reasons, 'search', filed, taken)).toContain(line);
  });

  it('leaves any other refusal to roadmapRefusal', () => {
    expect(fileItemRefusal('git-not-allowed', [], 'search', false, false)).toBeUndefined();
  });
});
