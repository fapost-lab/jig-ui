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

/**
 * The line for a roadmap edit Jig refused: `agent.git: none`, where Jig commits nothing, sends the person to the
 * project's Settings; an item or phase the specs no longer show is said so; otherwise Jig's own reasons, paths already
 * cut out by the server — a checkout on the spec's branch, a base not on origin — or, without any, as `refusal` says it.
 */
export function roadmapRefusal(code: string, reasons: string[], doing: string, spec: string): string {
  if (code === 'git-not-allowed') return "Jig commits nothing in this clone (agent.git is none): choose a level in the project's Settings.";
  if (code === 'not-found') return `The roadmap of ${spec} no longer has what you were ${doing}: try again on the specs as they are now.`;
  if (reasons.length > 0) return `Jig did not change the roadmap of ${spec}: ${reasons.join(' ')}`;
  return refusal(code, doing, `the roadmap of ${spec}`);
}

/** The line for a task filed from an item that Jig then did not name on it: why, and that filing again names it. */
export function unnamedRefusal(code: string, reasons: string[], task: string): string {
  const why = code === 'git-not-allowed' ? 'agent.git is none in this clone' : reasons.length > 0 ? reasons.join(' ') : code;
  return `Filed ${task}, but Jig did not name it on the item (${why}). Once that is resolved, File task… again with ${task}.`;
}
