import { describe, expect, it } from 'vitest';
import { closeRefusal, refusal } from './refusal';

describe('refusal', () => {
  it.each([
    ['wrong-checkout', 'a keeps its work in a stash: run jig task resume a in the project, on its branch.'],
    [
      'stash-conflict',
      "a's stash did not apply cleanly in the project's checkout: resolve the conflicts there, then run jig task resume a.",
    ],
    ['not-paused', 'a is not paused any more.'],
    ['upgrading', 'Jig is being upgraded in this project: try resuming a again once it has finished.'],
    ['already-exists', 'Jig refused resuming a (already-exists).'],
  ])('says %s in its own words', (code, line) => {
    expect(refusal(code, 'resuming', 'a')).toBe(line);
  });
});

describe('closeRefusal', () => {
  it.each([
    ['failed', ['its pull request is open;', 'merge it'], 'Jig did not close a: its pull request is open; merge it'],
    ['failed', [], 'Jig refused closing a (failed).'],
    ['not-found', [], 'a cannot be closed from the board any more: read it again.'],
    ['upgrading', [], 'Jig is being upgraded in this project: try closing a again once it has finished.'],
  ])('says %s with %j in its own words', (code, reasons, line) => {
    expect(closeRefusal(code, reasons, 'a')).toBe(line);
  });
});
