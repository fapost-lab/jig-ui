import type { Task } from '../source/project-source.js';

export type ColumnId = 'backlog' | 'in-progress' | 'needs-you' | 'paused' | 'ready';

export interface Column {
  id: ColumnId;
  title: string;
  cards: Task[];
}

/** The board's order: what waits for the person first, then what moves, what is done, what is not begun, what is set aside. */
const COLUMNS: {
  id: ColumnId;
  title: string;
}[] = [
  { id: 'needs-you', title: 'Needs you' },
  { id: 'in-progress', title: 'In progress' },
  { id: 'ready', title: 'Ready' },
  { id: 'backlog', title: 'Backlog' },
  { id: 'paused', title: 'Paused' },
];

/** Where a task stands, from Jig's state alone; the first rule that fits wins. */
export function columnOf(task: Task): ColumnId {
  if (task.paused) return 'paused';
  if (!task.started) return 'backlog';
  if (task.gate === 'waiting' || task.gate === 'changed' || task.autopilot === 'stopped') return 'needs-you';
  if (task.status === 'ready') return 'ready';
  return 'in-progress';
}

/** The column a task sits in, with its title. */
export function placeOf(task: Task): {
  id: ColumnId;
  title: string;
} {
  const id = columnOf(task);
  return { id, title: COLUMNS.find((c) => c.id === id)?.title ?? id };
}

/** Jig's queue order: the top level first, then each open epic's by its name, by position there; a task not queued after them all. */
function byQueue(a: Task, b: Task): number {
  if (!a.queue || !b.queue) return a.queue ? -1 : b.queue ? 1 : 0;
  const [x, y] = [a.queue.level, b.queue.level];
  if (x !== y) return x === null ? -1 : y === null ? 1 : x < y ? -1 : 1;
  return a.queue.position - b.queue.position;
}

/**
 * The board: every column, in a fixed order, its cards in Jig's queue order and the tasks not queued after them in the
 * order Jig listed them (the sort is stable). Computed on every read, never stored.
 */
export function columns(tasks: Task[]): Column[] {
  return COLUMNS.map((c) => ({ ...c, cards: tasks.filter((t) => columnOf(t) === c.id).sort(byQueue) }));
}
