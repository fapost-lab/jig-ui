import { ref } from 'vue';
import type { Place, Task } from '../api';
import { placement } from './placement';

/**
 * Dragging a card: within its list (a column), with the gap it would land in and the place Jig's queue would give it;
 * onto the Paused column, a pause asked of the task. A drop is allowed only where `placement` says one
 * `jig queue move` puts it, or on Paused when Jig offers the request; any other list allows none.
 */
export function useDrop(onMove: (task: string, place: Place) => void, onPause: (task: string) => void) {
  const dragged = ref<{
    task: string;
    list: string;
    pausable: boolean;
  }>();
  /** Where the card would land: a gap in its own list, or the Paused list as a whole (`index` -1, no place). */
  const gap = ref<{
    list: string;
    index: number;
    place?: Place;
  }>();

  function start(event: DragEvent, list: string, task: Task): void {
    dragged.value = { task: task.id, list, pausable: task.pauseRequestable };
    event.dataTransfer?.setData('text/plain', task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /** On `dragover` of the list's element; its cards are the children marked `data-card`, in `cards`' order. */
  function over(event: DragEvent, list: string, cards: Task[]): void {
    const d = dragged.value;
    if (!d) return;
    if (d.list !== list) {
      if (list !== 'paused' || !d.pausable) return;
      gap.value = { list, index: -1 };
      event.preventDefault(); // allows the drop here
      return;
    }
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-card]')];
    const below = items.findIndex((el) => {
      const box = el.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    const index = below < 0 ? items.length : below;
    const place = placement(cards, d.task, index);
    gap.value = place && { list, index, place };
    if (place) event.preventDefault(); // allows the drop here
  }

  function drop(list: string): void {
    const [d, g] = [dragged.value, gap.value];
    end();
    if (!d || g?.list !== list) return;
    if (g.place) onMove(d.task, g.place);
    else onPause(d.task);
  }

  function end(): void {
    dragged.value = undefined;
    gap.value = undefined;
  }

  return { dragged, gap, start, over, drop, end };
}
