/** How loud a fact about a task is: it waits for the person, it went well, it went wrong, or neither. */
export type Tone = 'attention' | 'good' | 'bad' | 'quiet';

/** The colours that carry a meaning; nothing else on the page picks a colour of its own. */
export const toneText: Record<Tone, string> = {
  attention: 'text-amber-700 dark:text-amber-300',
  good: 'text-emerald-700 dark:text-emerald-300',
  bad: 'text-destructive',
  quiet: 'text-muted-foreground',
};

/** A tone as a rule on the left of its text, the way a card and an attention item show it. */
export const toneRule: Record<Tone, string> = {
  attention: 'border-l-2 border-amber-500 pl-2 text-amber-700 dark:text-amber-300',
  good: 'border-l-2 border-emerald-500 pl-2 text-emerald-700 dark:text-emerald-300',
  bad: 'border-l-2 border-destructive pl-2 text-destructive',
  quiet: 'border-l-2 border-border pl-2 text-muted-foreground',
};

/** Attention as a filled mark, the count on a project's tab. */
export const attentionFill = 'bg-amber-500 text-black';

/** Each column's accent, by the column ids the board API sends; an id this page does not know gets none. */
export const columnAccent: Record<string, string> = {
  'needs-you': 'bg-amber-500',
  'in-progress': 'bg-sky-500',
  ready: 'bg-emerald-500',
  backlog: 'bg-slate-400',
  paused: 'bg-zinc-400',
};
