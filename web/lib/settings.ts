import type { Setting, Settings } from '@/api';
import { refusal } from './refusal';

/** How the dialog answers a key: a checkbox for yes or no, a choice for a fixed set of values, a field, or its value shown. */
export type Control = 'checkbox' | 'choice' | 'field' | 'shown';

/**
 * The dialog's two parts, each in Jig's order: the project's settings, which only `.ai/config.yaml` answers and git
 * shares, and the person's own in this clone, which `.ai/config.local.yaml` answers — first, or only.
 */
export function parts(keys: Setting[]): {
  project: Setting[];
  own: Setting[];
} {
  return { project: keys.filter((k) => k.scope === 'project'), own: keys.filter((k) => k.scope !== 'project') };
}

/**
 * How one of the person's own keys is changed. The Telegram token is only cleared: Jig takes it in a terminal, never
 * on a command line. A list is shown: no key of the person's own takes one (Jig 0.40.0).
 */
export function control(setting: Setting): Control {
  if (setting.secret || setting.kind === 'list') return 'shown';
  if (setting.kind === 'boolean') return 'checkbox';
  if (setting.kind === 'choice' && setting.allowed) return 'choice';
  return 'field';
}

/** A key's value as the dialog shows it: a secret only as set or not, a key with none as `not set`. */
export function shownValue(setting: Setting): string {
  if (setting.secret) return setting.set ? 'set' : 'not set';
  return setting.value ?? 'not set';
}

/** Where a key's value comes from. */
export function sourceLine(setting: Setting): string {
  if (setting.source === 'local') return 'Your setting in this clone';
  if (setting.source === 'project') return "From the project's settings";
  return setting.default === null ? 'Not set' : "Jig's default";
}

/** Why the settings are not shown, `undefined` when they are. */
export function noSettings(answer: Settings): string | undefined {
  if (answer.state === 'ready') return answer.keys.length === 0 ? 'Jig lists no settings.' : undefined;
  if (answer.state === 'unsupported')
    return `Jig ${answer.minimum} or later in the project shows its settings here; it runs ${answer.jigVersion ?? 'an unknown version'}.`;
  if (answer.state === 'incompatible') return `Jig ${answer.jigVersion} lists its settings in a form this Jig UI does not read.`;
  if (answer.state === 'unreadable') {
    if (answer.code === 'upgrading') return 'Jig is being upgraded in the project; open the settings again once it is done.';
    return answer.code === 'timeout' ? 'Jig did not answer in time.' : 'Jig could not list the settings.';
  }
  return 'The project cannot be read.';
}

/** The line for a change of a setting Jig refused: its own reasons where it gave them, the key named once, as for any other change otherwise. */
export function settingRefusal(code: string, reasons: string[], key: string): string {
  const said = reasons.map((r) => (r.startsWith(`${key}: `) ? r.slice(key.length + 2) : r));
  if (said.length > 0) return `Jig did not change ${key}: ${said.join(' ')}`;
  return refusal(code, 'changing', key);
}
