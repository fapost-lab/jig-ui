import { describe, expect, it, vi } from 'vitest';

// No DOM here for DOMPurify to clean in: the test pins that every rendering goes through it, with forms forbidden; the
// page's own check (a script and an `onerror` in a document) is the browser evidence of task-artifacts.
const sanitize = vi.hoisted(() => vi.fn((html: string) => `clean:${html}`));
vi.mock('dompurify', () => ({ default: { sanitize } }));

const { rendered } = await import('./markdown');

describe('rendered', () => {
  it('renders Markdown as GitHub does and hands the HTML to DOMPurify, forms forbidden', () => {
    const html = rendered('# Plan\n\n| step | done |\n| --- | --- |\n| one | yes |\n\n<script>alert(1)</script>');
    expect(html.startsWith('clean:<h1>Plan</h1>')).toBe(true);
    const [given, config] = sanitize.mock.calls[0] as unknown as [
      string,
      {
        USE_PROFILES: unknown;
        FORBID_TAGS: string[];
      },
    ];
    expect(given).toContain('<table>');
    expect(given).toContain('<script>');
    expect(config).toEqual({ USE_PROFILES: { html: true }, FORBID_TAGS: expect.arrayContaining(['form', 'input', 'button', 'style']) });
  });
});
