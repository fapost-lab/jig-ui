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

/** `agent.git: none`: Jig commits nothing, so a write it makes on a branch of its own is refused; the level is a setting. */
export const NO_COMMITS = "Jig commits nothing in this clone (agent.git is none): choose a level in the project's Settings.";

/**
 * The line for a roadmap edit Jig refused: `agent.git: none`, where Jig commits nothing, sends the person to the
 * project's Settings; an item or phase the specs no longer show is said so; otherwise Jig's own reasons, paths already
 * cut out by the server — a checkout on the spec's branch, a base not on origin — or, without any, as `refusal` says it.
 */
export function roadmapRefusal(code: string, reasons: string[], doing: string, spec: string): string {
  if (code === 'git-not-allowed') return NO_COMMITS;
  if (code === 'not-found') return `The roadmap of ${spec} no longer has what you were ${doing}: try again on the specs as they are now.`;
  if (reasons.length > 0) return `Jig did not change the roadmap of ${spec}: ${reasons.join(' ')}`;
  return refusal(code, doing, `the roadmap of ${spec}`);
}

/** The line for a task filed from an item that Jig then did not name on it: why, and that filing again names it. */
export function unnamedRefusal(code: string, reasons: string[], task: string): string {
  const why = code === 'git-not-allowed' ? 'agent.git is none in this clone' : reasons.length > 0 ? reasons.join(' ') : code;
  return `Filed ${task}, but Jig did not name it on the item (${why}). Once that is resolved, File task… again with ${task}.`;
}

/**
 * The line for filing an item's task that Jig refused: filed and not named (Jig 0.40.0) as `unnamedRefusal` says it;
 * an id a finished task has (`taken`); any other `already-exists` in Jig's own words, since from Jig 0.41.0 it is also
 * an item that names a task already on its branch; an id or a goal Jig does not take; `undefined` for anything else,
 * which `roadmapRefusal` says.
 */
export function fileItemRefusal(code: string, reasons: string[], task: string, filed: boolean, taken: boolean): string | undefined {
  if (filed) return unnamedRefusal(code, reasons, task);
  if (taken) return `The project has a finished task called ${task}. Choose another id.`;
  if (code === 'already-exists' && reasons.length > 0) return `Jig did not file ${task}: ${reasons.join(' ')}`;
  return code === 'usage' ? 'Jig does not take this id or goal: one line of goal, not starting with #.' : undefined;
}
