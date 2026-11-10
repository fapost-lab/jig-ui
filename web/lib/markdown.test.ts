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
    // Raw HTML is shown as written: DOMPurify still cleans what marked gives.
    expect(given).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(given).not.toContain('<script>');
    expect(config).toEqual({ USE_PROFILES: { html: true }, FORBID_TAGS: expect.arrayContaining(['form', 'input', 'button', 'style']) });
  });

  it("shows a template's placeholders as written, and keeps a comment unseen", () => {
    expect(rendered('# <Title of the linked source>\n\nLinked source: [a](b) and <id>.\n\n<!-- for the agent -->\n')).toBe(
      'clean:<h1>&lt;Title of the linked source&gt;</h1>\n<p>Linked source: a and &lt;id&gt;.</p>\n<!-- for the agent -->\n',
    );
  });

  it('shows a placeholder after a comment on the same line as written', () => {
    expect(rendered('<!-- note --> <Title of the linked source>\n\nNext.\n')).toBe(
      'clean:&lt;!-- note --&gt; &lt;Title of the linked source&gt;<p>Next.</p>\n',
    );
  });

  it('keeps a link that leads away and shows a relative one as its text', () => {
    expect(
      rendered('[web](https://example.com/x) [mail](mailto:a@b.c) [host](//example.com) [up](../../../docs/x.md) [**here**](#top)'),
    ).toBe(
      'clean:<p><a href="https://example.com/x">web</a> <a href="mailto:a@b.c">mail</a> <a href="//example.com">host</a> up <strong>here</strong></p>\n',
    );
  });
});
