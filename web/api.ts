import { hc, type InferRequestType, type InferResponseType } from 'hono/client';
import { ref } from 'vue';
import type { AppType } from '../server/http/app';
/** The server's API, typed by its own routes (`AppType`); only its type crosses into the page. */
export const client = hc<AppType>('/');
type Api = typeof client.api;
type Ok<R> = InferResponseType<R, 200>;

export type Project = Ok<Api['workspace']['$get']>['projects'][number];
export type Attention = Extract<Project, { state: 'ready' }>['attention'][number];
export type Board = Ok<Api['projects'][':id']['board']['$get']>['board'];
export type Column = Extract<Board, { state: 'ready' }>['columns'][number];
export type Task = Column['cards'][number];
export type TaskDetails = Ok<Api['projects'][':id']['tasks'][':task']['$get']>['task'];
/** A task's details when its project could be read. */
export type ReadyDetails = Extract<TaskDetails, { state: 'ready' }>;
export type Specs = Ok<Api['projects'][':id']['specs']['$get']>['specs'];
export type Spec = Extract<Specs, { state: 'ready' }>['specs'][number];
export type SpecItem = Spec['phases'][number]['items'][number];
export type Failure = InferResponseType<Api['projects']['$post'], 422>;
type Queue = Api['projects'][':id']['queue'];
/** Where a move puts a task, as the move route takes it. */
export type Place = NonNullable<InferRequestType<Queue['move']['$post']>['json']['place']>;
/** The answer to a write of the queue. */
export type Written = Awaited<ReturnType<Queue['move']['$post'] | Queue['priority']['$post']>>;

/** Why the page cannot show anything: the session or the server ended, the registry cannot be read, or the server failed. */
export const failure = ref<
  | {
      kind: 'registry-unreadable';
      message: string;
    }
  | { kind: 'session-ended' }
  | { kind: 'not-running' }
  | { kind: 'internal' }
  | undefined
>();

/** A call that turns the end of the session or of the server, or a failure of the server, into `failure`. */
export async function call<
  R extends {
    status: number;
    json(): Promise<unknown>;
  },
>(request: () => Promise<R>): Promise<R | undefined> {
  let res: R;
  try {
    res = await request();
  } catch {
    failure.value = { kind: 'not-running' };
    return undefined;
  }
  if (res.status === 401) failure.value = { kind: 'session-ended' };
  else if (res.status === 500) {
    const body = (await res.json().catch(() => undefined)) as Partial<Failure> | undefined;
    failure.value =
      body?.error?.code === 'registry-unreadable' ? { kind: 'registry-unreadable', message: body.error.message } : { kind: 'internal' };
  } else return res;
  return undefined;
}

/** One task in full, or why there is none: no such project, no such live task; undefined when `call` failed. */
export async function readTask(project: string, task: string): Promise<TaskDetails | 'not-connected' | 'not-found' | undefined> {
  const res = await call(() =>
    client.api.projects[':id'].tasks[':task'].$get({ param: { id: encodeURIComponent(project), task: encodeURIComponent(task) } }),
  );
  if (!res) return undefined;
  if (res.status === 200) return (await res.json()).task;
  return (await res.json()).error.code === 'not-found' ? 'not-found' : 'not-connected';
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

/**
 * Follows the server's change signals; one stream for the whole page. Returns the unsubscribe.
 * It is also the first read: `listener` runs once the stream is open — at once if it already is —
 * because a read made before the server follows the project is read again when it starts to.
 */
export function onChange(listener: Listener): () => void {
  if (listeners.size === 0) document.addEventListener('visibilitychange', follow); // added once: same function
  listeners.add(listener);
  follow();
  if (events?.readyState === EventSource.OPEN) listener();
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
  events.addEventListener('error', () => void call(() => client.api.instance.$get()));
}
