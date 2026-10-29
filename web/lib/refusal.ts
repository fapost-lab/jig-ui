/**
 * The line above the board for a change Jig refused, other than a stale revision (that one shows the conflict) —
 * never Jig's message, which may name a path.
 */
export function refusal(code: string, doing: string, task: string): string {
  if (code === 'wrong-checkout') return `${task} keeps its work in a stash: run jig task resume ${task} in the project, on its branch.`;
  if (code === 'stash-conflict') {
    return `${task}'s stash did not apply cleanly in the project's checkout: resolve the conflicts there, then run jig task resume ${task}.`;
  }
  if (code === 'not-paused') return `${task} is not paused any more.`;
  if (code === 'upgrading') return `Jig is being upgraded in this project: try ${doing} ${task} again once it has finished.`;
  return `Jig refused ${doing} ${task} (${code}).`;
}

/**
 * The line for a close Jig refused: its own reasons, paths already cut out by the server, where it gave them — the pull
 * request not merged, the knowledge decision not recorded; a task no longer closable is said so; anything else as
 * `refusal` says it.
 */
export function closeRefusal(code: string, reasons: string[], task: string): string {
  if (reasons.length > 0) return `Jig did not close ${task}: ${reasons.join(' ')}`;
  if (code === 'not-found') return `${task} cannot be closed from the board any more: read it again.`;
  return refusal(code, 'closing', task);
}
