import { describe, expect, it } from 'vitest';
import type { FoundProjects } from '../api';
import { foundLine, skippedLine, withConnected } from './scan';

const result = (more: Partial<FoundProjects> = {}): FoundProjects => ({
  folder: '~',
  found: [{ path: '~/code/a' }, { path: '~/code/b' }],
  connected: 0,
  skipped: [],
  stopped: false,
  ...more,
});

describe('foundLine', () => {
  it('counts the projects to connect where it looked, and the ones connected already', () => {
    expect(foundLine(result())).toBe('2 Jig projects to connect in ~.');
    expect(foundLine(result({ found: [{ path: '~/a' }], connected: 3 }))).toBe('1 Jig project to connect in ~, 3 already connected.');
  });

  it('says when there is nothing to connect', () => {
    expect(foundLine(result({ folder: '/srv', found: [] }))).toBe('No Jig projects to connect in /srv.');
    expect(foundLine(result({ found: [], connected: 2 }))).toBe('No Jig projects to connect in ~: 2 already connected.');
  });
});

describe('skippedLine', () => {
  it('names the folders macOS asks about, and how to look in one', () => {
    expect(skippedLine(result())).toBeUndefined();
    expect(skippedLine(result({ skipped: ['Desktop', 'Documents'] }))).toBe(
      'Skipped Desktop, Documents: macOS asks before an app reads them. To look in one, type its path — ~/Desktop — and choose Find projects.',
    );
    expect(skippedLine(result({ skipped: ['Documents'] }))).toContain('macOS asks before an app reads it.');
  });
});

describe('withConnected', () => {
  it('takes a connected project off the list and counts it', () => {
    expect(withConnected(result(), '~/code/a')).toEqual(result({ found: [{ path: '~/code/b' }], connected: 1 }));
  });
});
