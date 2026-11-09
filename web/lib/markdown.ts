import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/** What a document may not carry into the page, beyond what DOMPurify always takes out (scripts, event handlers, frames). */
const FORBID_TAGS = ['form', 'input', 'button', 'select', 'textarea', 'style'];

const escaped = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Raw HTML that is nothing but comments: the one kind passed on as it is, unseen. */
const comments = /^\s*(?:<!--[^]*?-->\s*)+$/;

/** A link that leads somewhere from this page: one with a scheme, or to another host. */
const away = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * GitHub-flavoured Markdown whose raw HTML is shown as written rather than put in the page: Jig's templates hold
 * placeholders such as `<Title of the linked source>`, which a browser reads as a `<title>` that hides all that follows.
 * Raw HTML made only of comments stays as it is, unseen. A relative link — `../../docs/rules.md`, from the file the document sits in — would lead
 * to this page's own address, which has no such file: it shows as its text.
 */
const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => (comments.test(text) ? text : escaped(text)),
    link(token) {
      return away.test(token.href) ? false : this.parser.parseInline(token.tokens);
    },
  },
});

/**
 * A document written in Markdown — a task's, a knowledge document, a file a stub links — as HTML the page may put in
 * with `v-html`: marked renders it as GitHub does (tables, lists, code), its raw HTML as text, and DOMPurify takes out
 * what could run or post anything all the same — a document is text its authors wrote.
 */
export const rendered = (text: string): string =>
  DOMPurify.sanitize(markdown.parse(text, { async: false }), { USE_PROFILES: { html: true }, FORBID_TAGS });

/** Markdown's elements, which Tailwind's reset leaves bare, styled on the theme's tokens: the classes of what `rendered()` gives. */
export const prose = [
  'min-w-0 leading-relaxed break-words',
  '[&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-semibold',
  '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_a]:underline [&_a]:underline-offset-2 [&_hr]:my-3',
].join(' ');
