import { describe, expect, it } from 'vitest';
import type { Task } from '../api';
import { requested, waits } from './waits';

const task = (more: Partial<Task> = {}): Task => ({
  id: 't',
  class: 'T2',
  status: 'active',
  goal: null,
  paused: false,
  pauseRequest: null,
  pauseRequestable: true,
  pausable: false,
  resumable: false,
  closable: false,
  staging: null,
  parked: null,
  resumesTo: null,
  started: true,
  gate: null,
  autopilot: null,
  pullRequest: null,
  priority: null,
  queue: null,
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
    [
      'a paused task with a pull request',
      { paused: true, pullRequest: pr('open', 'green') },
      { text: 'Paused — jig task resume t', tone: 'quiet' },
    ],
    [
      'a paused task the page resumes',
      { paused: true, resumable: true, resumesTo: 'in-progress' as const },
      { text: 'Paused', tone: 'quiet' },
    ],
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
    // On Jig's staging flow the pull request is the one into staging: merged, the task is still not in the base.
    [
      'a pull request into staging waiting for review',
      { status: 'ready' as const, staging: null, parked: { reason: 'review' as const, hint: null }, pullRequest: pr('open', 'green') },
      { text: 'Pull request into staging waits for review', tone: 'quiet', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'a pull request into staging the person lands',
      {
        status: 'ready' as const,
        staging: null,
        parked: { reason: 'review' as const, hint: 'landing' as const },
        pullRequest: pr('open', 'green'),
      },
      { text: 'Pull request into staging — yours to land', tone: 'attention', url: 'https://github.com/o/r/pull/7' },
    ],
    [
      'work on staging waiting for prepare for prod',
      {
        status: 'ready' as const,
        staging: 'on' as const,
        parked: { reason: 'signal' as const, hint: null },
        pullRequest: pr('merged', 'none'),
      },
      { text: 'On staging, waits for prepare for prod', tone: 'quiet' },
    ],
    [
      'a fix not on staging yet',
      { staging: 'behind' as const, pullRequest: pr('merged', 'none') },
      { text: 'Fix not on staging yet', tone: 'quiet' },
    ],
    [
      'work on staging, not parked',
      { status: 'ready' as const, staging: 'on' as const, pullRequest: pr(null, null) },
      { text: 'On staging', tone: 'quiet' },
    ],
    // Jig reads the state and CI for the branch into the base: once there is a promotion they are its, the url is not.
    [
      'a promotion with CI red',
      { status: 'ready' as const, staging: 'on' as const, pullRequest: pr('open', 'red') },
      { text: 'Promotion open, CI red', tone: 'bad' },
    ],
    [
      'a merged promotion',
      { status: 'ready' as const, staging: 'on' as const, pullRequest: pr('merged', 'none') },
      { text: 'Promotion merged', tone: 'good' },
    ],
    [
      'a paused task parked at staging',
      { paused: true, resumable: true, parked: { reason: 'signal' as const, hint: null } },
      { text: 'Paused', tone: 'quiet' },
    ],
    ['a running autopilot', { autopilot: 'on' }, { text: 'On autopilot', tone: 'quiet' }],
  ])('%s', (_, more, expected) => {
    expect(waits(task(more))).toEqual(expected);
  });
});

describe('requested', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  it('says nothing without a pause asked', () => {
    expect(requested(task(), now)).toBeUndefined();
  });
  it('says how long ago a pause was asked, whatever else the card says', () => {
    const asked = { pauseRequest: { requestedAt: '2026-10-22T11:48:00Z' } };
    expect(requested(task({ ...asked, gate: 'waiting' }), now)).toBe('Pause requested 12 min ago');
    expect(requested(task({ ...asked, gate: 'waiting' }), now + 60 * 60_000)).toBe('Pause requested 1 h ago');
  });
});
