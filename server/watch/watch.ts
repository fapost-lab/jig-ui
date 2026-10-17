import { existsSync, type FSWatcher, watch } from 'node:fs';

export interface Watch {
  /** False once the system watcher failed to start or failed later; the owner may start another. */
  readonly open: boolean;
  close(): void;
}

export interface WatchOptions {
  /** True for a path, relative to the watched directory with `/` separators, whose change means nothing. */
  ignore: (path: string) => boolean;
  onChange: () => void;
  /** Quiet time after the last event before `onChange`. */
  quietMs?: number;
  /** Longest wait after the first event of a run that never goes quiet. */
  maxWaitMs?: number;
}

/**
 * Calls `onChange`, debounced, when anything under `dir` changes. It says only that something
 * changed: an event is never read as data. A system watcher that fails becomes one change.
 */
export function watchTree(dir: string, { ignore, onChange, quietMs = 1_000, maxWaitMs = 2_000 }: WatchOptions): Watch {
  let quiet: NodeJS.Timeout | undefined;
  let first: NodeJS.Timeout | undefined;
  let watcher: FSWatcher | undefined;

  const settle = (): void => {
    clearTimeout(quiet);
    clearTimeout(first);
    quiet = first = undefined;
  };
  const fire = (): void => {
    settle();
    onChange();
  };
  const close = (): void => {
    settle();
    watcher?.close();
    watcher = undefined;
  };

  // Linux's recursive watch does not throw for a missing directory, macOS's does: ask first.
  if (!existsSync(dir)) return { open: false, close };
  try {
    watcher = watch(dir, { recursive: true }, (_event, file) => {
      // Some systems name no file; that is still a change.
      if (file !== null && ignore(file.replaceAll('\\', '/'))) return;
      clearTimeout(quiet);
      quiet = setTimeout(fire, quietMs);
      first ??= setTimeout(fire, maxWaitMs);
    });
    watcher.on('error', () => {
      close();
      onChange();
    });
  } catch {
    watcher = undefined; // the directory is not there: the owner's next read says so
  }

  return {
    get open() {
      return watcher !== undefined;
    },
    close,
  };
}
