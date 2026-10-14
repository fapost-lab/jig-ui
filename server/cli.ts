#!/usr/bin/env node
// Entry point. It must parse and run on any Node.js, so that an old one gets a clear message
// instead of a syntax error: no dependencies are imported here, and the real program is loaded
// only after the version check.
import { checkNodeVersion } from './node-version.js';

const nodeCheck = checkNodeVersion(process.versions.node);
if (!nodeCheck.ok) {
  console.error(nodeCheck.message);
  process.exit(1);
} else {
  import('./main.js')
    .then((m) => m.main())
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
