import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts, whose root is web/: the tests live in server/.
// On Windows each Jig stand-in starts through Git Bash: a test that runs Jig takes 2–3 s on CI there,
// and a slow runner passes the default 5 s.
export default defineConfig({ test: { testTimeout: process.platform === 'win32' ? 20_000 : 5_000 } });
