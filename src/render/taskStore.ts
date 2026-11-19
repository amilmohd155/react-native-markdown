/**
 * Task toggle overrides (P3-19): global task index -> checked. Lives above
 * the rows (one per `<Markdown>`), so a virtualized row that unmounts keeps
 * its state. Each item subscribes to its own index only, so a tap re-renders
 * one item and `ctx` never changes.
 */
export interface TaskStore {
  /** The toggled state of task `index`, or `undefined` if never toggled. */
  get(index: number): boolean | undefined;
  /** Records a toggle and notifies that item only. */
  set(index: number, checked: boolean): void;
  /** Subscribes to one index; returns the unsubscribe function. */
  subscribe(index: number, listener: () => void): () => void;
}

export function createTaskStore(): TaskStore {
  const overrides = new Map<number, boolean>();
  const listeners = new Map<number, Set<() => void>>();

  const notify = (index: number) => {
    const set = listeners.get(index);
    if (set) for (const l of [...set]) l();
  };

  return {
    get: (index) => overrides.get(index),
    set(index, checked) {
      if (overrides.get(index) === checked) return;
      overrides.set(index, checked);
      notify(index);
    },
    subscribe(index, listener) {
      let set = listeners.get(index);
      if (!set) {
        set = new Set();
        listeners.set(index, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(index);
      };
    },
  };
}
