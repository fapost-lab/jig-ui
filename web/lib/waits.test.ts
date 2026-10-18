import { describe, expect, it } from 'vitest';
import type { Task } from '../api';
import { waits } from './waits';

const task = (more: Partial<Task> = {}): Task => ({
  id: 't',
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  ...more,
});

const pr = (state: string | null, ci: string | null, url = 'https://github.com/o/r/pull/7') => ({ url, state, ci, fetchedAt: null });

describe('waits', () => {
  it.each([
    ['nothing to say', {}, undefined],
    ['a design waiting at its gate', { gate: 'waiting' }, { text: 'Design waits at its gate', tone: 'attention' }],
    ['a design changed after approval', { gate: 'changed' }, { text: 'Design changed after approval', tone: 'attention' }],
    ['a stopped autopilot run', { autopilot: 'stopped' }, { text: 'Autopilot stopped with a question', tone: 'attention' }],
    ['the gate before the autopilot', { gate: 'waiting', autopilot: 'stopped' }, { text: 'Design waits at its gate', tone: 'attention' }],
    [
      'a stopped run on a paused task',
      { paused: true, autopilot: 'stopped' },
      { text: 'Autopilot stopped with a question', tone: 'attention' },
    ],
    ['a paused task with a pull request', { paused: true, pullRequest: pr('open', 'green') }, undefined],
    [
      'a pull request with CI green',
      { pullRequest: pr('open', 'green') },
      { text: 'Pull request open, CI green', tone: 'good', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'a pull request with CI red',
      { pullRequest: pr('open', 'red') },
      { text: 'Pull request open, CI red', tone: 'bad', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'a pull request with CI pending',
      { pullRequest: pr('open', 'pending') },
      { text: 'Pull request open, CI pending', tone: 'quiet', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'a merged pull request without CI',
      { pullRequest: pr('merged', 'none') },
      { text: 'Pull request merged', tone: 'good', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'a pull request Jig has not looked at yet',
      { pullRequest: pr(null, null) },
      { text: 'Pull request opened', tone: 'quiet', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'a pull request whose url is not a web address',
      { pullRequest: pr('open', 'green', 'file:///etc') },
      { text: 'Pull request open, CI green', tone: 'good', url: undefined },
    ],
    [
      'the gate before the pull request',
      { gate: 'changed', pullRequest: pr('open', 'red') },
      { text: 'Design changed after approval', tone: 'attention' },
    ],
    ['a ready task without a pull request', { status: 'ready' as const }, { text: 'No pull request yet', tone: 'quiet' }],
    ['a running autopilot', { autopilot: 'on' }, { text: 'On autopilot', tone: 'quiet' }],
  ])('%s', (_, more, expected) => {
    expect(waits(task(more))).toEqual(expected);
  });
});
