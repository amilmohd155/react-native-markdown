import { useCallback, useSyncExternalStore } from 'react';
import { Image } from 'react-native';

/**
 * Image size cache (basic version). Spec: docs/rewrite/03-architecture.md
 * (Default elements: Image), phase 3 adds the placeholder polish.
 *
 * - One `Image.getSize` request per URL, shared by every image using it;
 *   later renders and remounts read the size synchronously.
 * - Failed lookups are cached too, so a broken URL isn't retried on every
 *   render (it is retried after the entry is evicted).
 * - Bounded: the oldest entries are evicted past `MAX_ENTRIES`.
 * - A small external store: components subscribe per URL with
 *   `useSyncExternalStore` and re-render when that URL's size arrives.
 */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

type Entry = ImageSize | 'error';

const MAX_ENTRIES = 500;
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();
const listeners = new Map<string, Set<() => void>>();

function remember(src: string, entry: Entry): Entry {
  if (cache.size >= MAX_ENTRIES) {
    // Maps iterate in insertion order: drop the oldest.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(src, entry);
  listeners.get(src)?.forEach((notify) => notify());
  return entry;
}

function subscribe(src: string, onChange: () => void): () => void {
  let set = listeners.get(src);
  if (set === undefined) {
    set = new Set();
    listeners.set(src, set);
  }
  set.add(onChange);
  // Start the lookup on subscribe (after commit), not during render.
  if (!cache.has(src)) loadImageSize(src);
  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(src);
  };
}

/** The cached size of `src`: a size, `'error'`, or `undefined` if unknown. */
export function cachedImageSize(src: string): Entry | undefined {
  return cache.get(src);
}

/**
 * `Image.getSize` as a promise on every platform. react-native-web only has
 * the callback form (it returns nothing), so pass callbacks and also accept
 * a returned promise.
 */
function getSize(src: string): Promise<ImageSize> {
  return new Promise<ImageSize>((resolve, reject) => {
    const result: unknown = Image.getSize(
      src,
      (width, height) => resolve({ width, height }),
      reject
    );
    if (result instanceof Promise) result.then(resolve, reject);
  });
}

/** Looks up the size of `src`, at most one request per URL at a time. */
export function loadImageSize(src: string): Promise<Entry> {
  const cached = cache.get(src);
  if (cached !== undefined) return Promise.resolve(cached);
  let request = pending.get(src);
  if (request === undefined) {
    request = getSize(src).then(
      ({ width, height }) =>
        remember(
          src,
          width > 0 && height > 0 ? Object.freeze({ width, height }) : 'error'
        ),
      () => remember(src, 'error')
    );
    request.finally(() => pending.delete(src));
    pending.set(src, request);
  }
  return request;
}

/**
 * The size of `src` for rendering: known size, `'error'`, or `null` while
 * loading. Renders once more when the lookup finishes.
 */
export function useImageSize(src: string): Entry | null {
  const subscribeToSrc = useCallback(
    (onChange: () => void) => subscribe(src, onChange),
    [src]
  );
  // Cached entries are frozen objects or 'error': stable snapshots.
  const snapshot = () => cache.get(src) ?? null;
  return useSyncExternalStore(subscribeToSrc, snapshot, snapshot);
}

/** Test hook: empty the cache. */
export function clearImageSizeCache(): void {
  cache.clear();
  pending.clear();
  listeners.clear();
}
