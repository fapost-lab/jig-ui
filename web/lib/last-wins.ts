/**
 * Runs `read` and hands its answer to `land` only when no later run started meanwhile: an older
 * answer never overwrites a newer one. `undefined` (the read failed) lands nowhere.
 */
export function lastWins<T>(read: () => Promise<T | undefined>, land: (value: T) => void): () => Promise<void> {
  let latest = 0;
  return async () => {
    const mine = ++latest;
    const value = await read();
    if (value !== undefined && mine === latest) land(value);
  };
}
