/**
 * Task toggle overrides (P3-19): global task index -> checked. Lives above
 * the rows (one per `<Markdown>`), so a virtualized row that unmounts keeps
 * its state. Each item subscribes to its own index only, so a tap re-renders
 * one item and `ctx` never changes.
 *
 * The store is a stable object: a source change must not change `ctx`
 * (every block would re-render). Reset is key-based instead: an override is
 * tagged with the `expectedKey` it was set under and is only visible while
 * that is still the expected key.
 */
export interface TaskStore {
  /**
   * The current reset key (the source, or a stream's prefix). Assigned
   * during render by `useRenderCtx`, before any item reads the store, so a
   * newly mounted item never sees an override from the previous key.
   */
  readonly expectedKey: unknown;
  /** Assigns `expectedKey`: a plain, idempotent write, safe during render. */
  expect(key: unknown): void;
  /** The toggled state of task `index`, or `undefined` if never toggled. */
  get(index: number): boolean | undefined;
  /** Records a toggle and notifies that item only. */
  set(index: number, checked: boolean): void;
  /** Subscribes to one index; returns the unsubscribe function. */
  subscribe(index: number, listener: () => void): () => void;
  /** Drops overrides of an old key and notifies their items. */
  purge(): void;
}

interface Entry {
  readonly checked: boolean;
  readonly key: unknown;
}

export function createTaskStore(): TaskStore {
  const overrides = new Map<number, Entry>();
  const listeners = new Map<number, Set<() => void>>();

  const notify = (index: number) => {
    const set = listeners.get(index);
    if (set) for (const l of [...set]) l();
  };

  const store: TaskStore = {
    expectedKey: undefined,
    expect(key) {
      (store as { expectedKey: unknown }).expectedKey = key;
    },
    get(index) {
      const entry = overrides.get(index);
      return entry !== undefined && Object.is(entry.key, store.expectedKey)
        ? entry.checked
        : undefined;
    },
    set(index, checked) {
      if (store.get(index) === checked) return;
      overrides.set(index, { checked, key: store.expectedKey });
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
    purge() {
      const stale: number[] = [];
      for (const [index, entry] of overrides) {
        if (!Object.is(entry.key, store.expectedKey)) stale.push(index);
      }
      for (const index of stale) overrides.delete(index);
      for (const index of stale) notify(index);
    },
  };
  return store;
}
