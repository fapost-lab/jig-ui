import type { TaskArtifacts } from '../api';
import { ago } from './ago';
import type { Tone } from './tones';

export type Listed = Extract<TaskArtifacts, { state: 'ready' }>['artifacts'][number];

/** A size as a person reads it: bytes below a kilobyte, else kilobytes with one decimal. */
export const size = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/** What a listed document's line says beside its kind, and how loud: when it was written and its size, that it is empty, or why Jig cannot read it. */
export function documentLine(
  artifact: Listed,
  now = Date.now(),
): {
  text: string;
  tone: Tone;
} {
  if (artifact.state === 'unavailable') return { text: `cannot be read: ${artifact.reason ?? 'unavailable'}`, tone: 'bad' };
  if (artifact.state === 'empty') return { text: 'empty', tone: 'quiet' };
  const written = artifact.updatedAt ? `written ${ago(artifact.updatedAt, now)}` : 'written';
  return { text: artifact.bytes === null ? written : `${written} · ${size(artifact.bytes)}`, tone: 'quiet' };
}

/** Why the project's Jig lists no documents, for a person; none when it listed them. */
export function noDocuments(answer: TaskArtifacts): string | undefined {
  if (answer.state === 'ready') return answer.artifacts.length === 0 ? 'No documents yet.' : undefined;
  if (answer.state === 'unsupported') return `Jig ${answer.minimum} or later in the project lists the task's documents.`;
  if (answer.state === 'incompatible') return `Jig ${answer.jigVersion} lists the documents in a form this Jig UI does not read.`;
  if (answer.state === 'unreadable') {
    if (answer.code === 'upgrading') return 'Jig is being upgraded in the project; the documents are listed again once it is done.';
    return answer.code === 'timeout' ? 'Jig did not answer in time.' : 'Jig could not list the documents.';
  }
  return 'The project cannot be read.';
}
