import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** What a document may not carry into the page, beyond what DOMPurify always takes out (scripts, event handlers, frames). */
const FORBID_TAGS = ['form', 'input', 'button', 'select', 'textarea', 'style'];

/**
 * A task's document, written in Markdown, as HTML the page may put in with `v-html`: marked renders it as GitHub does
 * (tables, lists, code), and DOMPurify takes out what could run or post anything — a document is text its authors wrote.
 */
export const rendered = (markdown: string): string =>
  DOMPurify.sanitize(marked.parse(markdown, { async: false, gfm: true }), { USE_PROFILES: { html: true }, FORBID_TAGS });
