import { ref } from 'vue';

export type Attention = {
  kind: string;
  subject: { type: string; id: string | null };
  title: string;
  detail: string | null;
  todo: string;
  url: string | null;
};

/** A project that cannot be read, and why. */
export type NotReady =
  | { id: string; state: 'unsupported'; jigVersion: string | null; minimum: string }
  | { id: string; state: 'incompatible'; jigVersion: string }
  | { id: string; state: 'unavailable'; reason: 'missing' | 'no-jig' }
  | { id: string; state: 'unreadable'; code: string };

export type Project =
  | {
      id: string;
      state: 'ready';
      jigVersion: string;
      counts: { active: number; paused: number; ready: number };
      attention: Attention[];
      housekeepingStale: boolean;
    }
  | NotReady;

export type Task = {
  id: string;
  class: string | null;
  status: 'active' | 'ready';
  goal: string | null;
  paused: boolean;
  started: boolean;
  gate: string | null;
  autopilot: string | null;
  pullRequest: { url: string; state: string | null; ci: string | null; fetchedAt: string | null } | null;
};

export type TaskDetails =
  | (Task & {
      state: 'ready';
      issue: string | null;
      branch: string | null;
      baseBranch: string;
      createdAt: string | null;
      updatedAt: string | null;
      knowledgeConsolidated: boolean;
      worktree: { uncommitted: number } | null;
      gateBy: string | null;
      run: {
        mode: string | null;
        stage: string | null;
        stageAt: string | null;
        stopReason: string | null;
        stopAt: string | null;
        phase: string | null;
      } | null;
      housekeepingFlags: string[];
      actions: { id: string; command: string }[];
      attention: Attention[];
      column: { id: string; title: string };
    })
  | NotReady;

/** A task's details when its project could be read. */
export type ReadyDetails = Extract<TaskDetails, { state: 'ready' }>;

export type Board = { id: string; state: 'ready'; columns: { id: string; title: string; cards: Task[] }[]; finished: number } | NotReady;

export type Failure = { error: { code: string; message: string } };

/** Why the page cannot show anything: the session or the server ended, or the registry cannot be read. */
export const failure = ref<
  { kind: 'registry-unreadable'; message: string } | { kind: 'session-ended' } | { kind: 'not-running' } | undefined
>();

/** A fetch that turns the end of the session or of the server into `failure`. */
export async function api(input: string, init?: RequestInit): Promise<Response | undefined> {
  try {
    const res = await fetch(input, init);
    if (res.status === 401) failure.value = { kind: 'session-ended' };
    else if (res.status === 500) {
      const { error } = (await res.json()) as Failure;
      failure.value = { kind: 'registry-unreadable', message: error.message };
    } else return res;
  } catch {
    failure.value = { kind: 'not-running' };
  }
  return undefined;
}

/** One task in full, or why there is none: no such project, no such live task; undefined when `api` failed. */
export async function readTask(project: string, task: string): Promise<TaskDetails | 'not-connected' | 'not-found' | undefined> {
  const res = await api(`/api/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(task)}`);
  if (!res) return undefined;
  if (res.ok) return ((await res.json()) as { task: TaskDetails }).task;
  return ((await res.json()) as Failure).error.code === 'not-found' ? 'not-found' : 'not-connected';
}

/** What a project's state means, for a person. */
export function describe(project: Project): string {
  if (project.state === 'ready') return `Jig ${project.jigVersion}`;
  if (project.state === 'unsupported') {
    const found = project.jigVersion ? `Jig ${project.jigVersion}` : 'A Jig of unknown version';
    return `${found} — Jig UI needs ${project.minimum} or later. Run jig upgrade in the project.`;
  }
  if (project.state === 'incompatible') {
    return `Jig ${project.jigVersion} answers in a form this Jig UI does not read. Update Jig UI: npx @fapost/jig-ui@latest.`;
  }
  if (project.state === 'unreadable') return `Jig could not be read (${project.code}). It is tried again on the next change.`;
  return project.reason === 'missing' ? 'The project directory is not there any more.' : 'There is no Jig in the project any more.';
}

/** A link only for a web address: the url comes from the project's files. */
export const link = (url: string | null): string | undefined => (url?.startsWith('https://') ? url : undefined);

/** Told a project's id when it changed, or nothing when anything may have: the stream came back after a gap. */
type Listener = (project?: string) => void;
const listeners = new Set<Listener>();
let events: EventSource | undefined;

/** Follows the server's change signals; one stream for the whole page. Returns the unsubscribe. */
export function onChange(listener: Listener): () => void {
  if (listeners.size === 0) document.addEventListener('visibilitychange', follow); // added once: same function
  listeners.add(listener);
  follow();
  return () => listeners.delete(listener);
}

/**
 * Opens the stream while the tab is visible and closes it while hidden: a browser gives one site
 * six connections over HTTP/1.1, and a stream per open tab would use them up.
 */
function follow(): void {
  if (document.hidden) {
    events?.close();
    events = undefined;
    return;
  }
  if (events) return;
  events = new EventSource('/api/events');
  // Signals sent while no stream was open are lost — before the first open too, when the tab
  // loaded hidden: everything is fetched again on every open.
  events.addEventListener('open', () => {
    for (const listener of listeners) listener();
  });
  events.addEventListener('changed', (event) => {
    const { project } = JSON.parse((event as MessageEvent<string>).data) as { project: string };
    for (const listener of listeners) listener(project);
  });
  // The browser retries on its own; asking the server says whether it ended or the session did.
  events.addEventListener('error', () => void api('/api/instance'));
}
