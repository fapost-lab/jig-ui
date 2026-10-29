import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

// Mintlify deploys `docs/` from `main` and keeps the old site when a page does not parse, with no
// failing check of ours to say so: a page that does not compile as MDX fails here instead.
const DOCS = resolve(import.meta.dirname, '..', 'docs');
const pages = readdirSync(DOCS).filter((name) => name.endsWith('.mdx'));

describe('docs', () => {
  it('has pages', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages)('%s compiles as MDX', async (name) => {
    // The parser's message names the line and the tag, as Mintlify's deployment log does.
    const error = await compile(readFileSync(join(DOCS, name), 'utf8')).then(
      () => undefined,
      (failure: Error & { line?: number }) => `${name}:${failure.line}: ${failure.message}`,
    );
    expect(error).toBeUndefined();
  });
});
