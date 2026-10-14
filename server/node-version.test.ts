import { describe, expect, it } from 'vitest';
import { checkNodeVersion } from './node-version.js';

describe('checkNodeVersion', () => {
  it.each(['v24.0.0', '24.1.0', 'v25.2.1', 'v26.9.0'])('accepts %s', (version) => {
    expect(checkNodeVersion(version)).toEqual({ ok: true });
  });

  it.each(['v23.11.1', '22.2.0', 'v18.17.1', 'v9.0.0'])('rejects %s with a message', (version) => {
    const result = checkNodeVersion(version);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Node.js 24');
      expect(result.message).toContain(version);
    }
  });

  it.each(['', 'nonsense'])('rejects the unparsable %j', (version) => {
    expect(checkNodeVersion(version).ok).toBe(false);
  });
});
