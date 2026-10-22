import { ref } from 'vue';
import type { Place, Task } from '../api';
import { placement } from './placement';

/**
 * Dragging a card within one list (a column), with the gap it would land in and the place Jig's queue would give it.
 * A drop is allowed only where `placement` says one `jig queue move` puts it; another list allows none — a drop on
 * another column is a pause request, a later roadmap item.
 */
export function useDrop(onMove: (task: string, place: Place) => void) {
  const dragged = ref<{
    task: string;
    list: string;
  }>();
  const gap = ref<{
    list: string;
    index: number;
    place: Place;
  }>();

  function start(event: DragEvent, list: string, task: string): void {
    dragged.value = { task, list };
    event.dataTransfer?.setData('text/plain', task);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /** On `dragover` of the list's element; its cards are the children marked `data-card`, in `cards`' order. */
  function over(event: DragEvent, list: string, cards: Task[]): void {
    const d = dragged.value;
    if (d?.list !== list) return;
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
    if (d && g?.list === list) onMove(d.task, g.place);
  }

  function end(): void {
    dragged.value = undefined;
    gap.value = undefined;
  }

  return { dragged, gap, start, over, drop, end };
}
