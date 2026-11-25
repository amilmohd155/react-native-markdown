/**
 * Small Map-based LRU shared by the image size cache and the table width
 * cache. A Map iterates in insertion order, so the first key is the least
 * recently used one.
 */
export interface Lru<V> {
  /** The value, or `undefined`. Refreshes recency. */
  get(key: string): V | undefined;
  /** The value, or `undefined`, without refreshing recency. */
  peek(key: string): V | undefined;
  /** Stores a value as the most recent; evicts the oldest at capacity. */
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
}

export function createLru<V>(capacity: number): Lru<V> {
  const map = new Map<string, V>();
  return {
    get(key) {
      const value = map.get(key);
      if (value !== undefined) {
        map.delete(key);
        map.set(key, value);
      }
      return value;
    },
    peek: (key) => map.get(key),
    set(key, value) {
      // Re-inserting moves an existing key to the newest position.
      map.delete(key);
      if (map.size >= capacity) {
        const oldest = map.keys().next();
        if (!oldest.done) map.delete(oldest.value);
      }
      map.set(key, value);
    },
    delete(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}
