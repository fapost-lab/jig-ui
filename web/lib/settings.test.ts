import { describe, expect, it } from 'vitest';
import type { Setting } from '@/api';
import { control, noSettings, parts, settingRefusal, shownValue, sourceLine } from './settings';

const key = (more: Partial<Setting>): Setting => ({
  key: 'agent.git',
  value: 'pr',
  set: true,
  source: 'local',
  scope: 'local only',
  kind: 'choice',
  allowed: ['none', 'commit', 'push', 'pr', 'merge'],
  default: 'none',
  description: 'How far the agent goes in git.',
  secret: false,
  ...more,
});

describe('parts', () => {
  it("splits the project's keys from the person's own, each in Jig's order", () => {
    const keys = [
      key({ key: 'a', scope: 'project' }),
      key({ key: 'b', scope: 'local' }),
      key({ key: 'c', scope: 'project' }),
      key({ key: 'd' }),
    ];
    const { project, own } = parts(keys);
    expect(project.map((k) => k.key)).toEqual(['a', 'c']);
    expect(own.map((k) => k.key)).toEqual(['b', 'd']);
  });
});

describe('control', () => {
  it.each([
    [key({ kind: 'boolean', allowed: ['true', 'false'] }), 'checkbox'],
    [key({}), 'choice'],
    [key({ kind: 'choice', allowed: null }), 'field'],
    [key({ kind: 'duration', allowed: null }), 'field'],
    [key({ kind: 'number', allowed: null }), 'field'],
    [key({ kind: 'text', allowed: null }), 'field'],
    [key({ kind: 'list', allowed: null }), 'shown'],
    [key({ kind: 'text', allowed: null, secret: true, value: null }), 'shown'],
  ] as const)('gives %o a %s', (setting, expected) => {
    expect(control(setting)).toBe(expected);
  });
});

describe('shownValue', () => {
  it('shows a secret only as set or not, and a key with no value as not set', () => {
    expect(shownValue(key({ secret: true, value: null, set: true }))).toBe('set');
    expect(shownValue(key({ secret: true, value: null, set: false }))).toBe('not set');
    expect(shownValue(key({ value: null, set: false }))).toBe('not set');
    expect(shownValue(key({}))).toBe('pr');
  });
});

describe('sourceLine', () => {
  it('names where the value comes from', () => {
    expect(sourceLine(key({}))).toBe('Your setting in this clone');
    expect(sourceLine(key({ source: 'project' }))).toBe("From the project's settings");
    expect(sourceLine(key({ source: 'default' }))).toBe("Jig's default");
    expect(sourceLine(key({ source: 'default', default: null, value: null }))).toBe('Not set');
  });
});

describe('noSettings', () => {
  it('says why the settings are not shown', () => {
    expect(noSettings({ state: 'ready', keys: [key({})], revision: 1 })).toBeUndefined();
    expect(noSettings({ id: 'p', state: 'unsupported', jigVersion: '0.39.0', minimum: '0.40.0' })).toBe(
      'Jig 0.40.0 or later in the project shows its settings here; it runs 0.39.0.',
    );
    expect(noSettings({ id: 'p', state: 'unreadable', code: 'upgrading' })).toMatch(/being upgraded/);
    expect(noSettings({ id: 'p', state: 'unreadable', code: 'timeout' })).toBe('Jig did not answer in time.');
    expect(noSettings({ id: 'p', state: 'unreadable', code: 'failed' })).toBe('Jig could not list the settings.');
  });
});

describe('settingRefusal', () => {
  it("says Jig's reasons where it gave them, and the code otherwise", () => {
    expect(settingRefusal('invalid-value', ["agent.git: invalid value 'x': not a level"], 'agent.git')).toBe(
      "Jig did not change agent.git: invalid value 'x': not a level",
    );
    expect(settingRefusal('upgrading', [], 'agent.git')).toMatch(/being upgraded/);
    expect(settingRefusal('failed', [], 'agent.git')).toBe('Jig refused changing agent.git (failed).');
  });
});
