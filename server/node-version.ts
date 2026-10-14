// This module is imported by the CLI entry before anything else, so it must parse on old Node.js.
export const MINIMUM_NODE_MAJOR = 24;

export type NodeVersionCheck = { ok: true } | { ok: false; message: string };

/** Checks a Node.js version string such as `v24.1.0` or `24.1.0` against the supported minimum. */
export function checkNodeVersion(version: string): NodeVersionCheck {
  const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] || '', 10);
  if (Number.isInteger(major) && major >= MINIMUM_NODE_MAJOR) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      'Jig UI needs Node.js ' + MINIMUM_NODE_MAJOR + ' or later, but this is ' + version +
      '. Install a newer Node.js and run it again.',
  };
}
