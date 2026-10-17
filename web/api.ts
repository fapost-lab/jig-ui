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
  pullRequest: { url: string; state: string | null; ci: string | null } | null;
};

export type Board =
  | { id: string; state: 'ready'; columns: { id: string; title: string; cards: Task[] }[]; finished: number }
  | NotReady;

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
  if (project.state === 'unreadable') return `Jig could not be read (${project.code}). It is tried again on the next load.`;
  return project.reason === 'missing' ? 'The project directory is not there any more.' : 'There is no Jig in the project any more.';
}

/** A link only for a web address: the url comes from the project's files. */
export const link = (url: string | null): string | undefined => (url?.startsWith('https://') ? url : undefined);
