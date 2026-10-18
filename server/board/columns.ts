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

/** The board: every column, in a fixed order, its cards in the order Jig listed them. Computed on every read, never stored. */
export function columns(tasks: Task[]): Column[] {
  return COLUMNS.map((c) => ({ ...c, cards: tasks.filter((t) => columnOf(t) === c.id) }));
}
