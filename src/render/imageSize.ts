import { useEffect, useState } from 'react';
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
 */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

type Entry = ImageSize | 'error';

const MAX_ENTRIES = 500;
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();

function remember(src: string, entry: Entry): Entry {
  if (cache.size >= MAX_ENTRIES) {
    // Maps iterate in insertion order: drop the oldest.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(src, entry);
  return entry;
}

/** The cached size of `src`: a size, `'error'`, or `undefined` if unknown. */
export function cachedImageSize(src: string): Entry | undefined {
  return cache.get(src);
}

/** Looks up the size of `src`, at most one request per URL at a time. */
export function loadImageSize(src: string): Promise<Entry> {
  const cached = cache.get(src);
  if (cached !== undefined) return Promise.resolve(cached);
  let request = pending.get(src);
  if (request === undefined) {
    request = Image.getSize(src).then(
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
  const [entry, setEntry] = useState<Entry | null>(
    () => cache.get(src) ?? null
  );

  useEffect(() => {
    const cached = cache.get(src);
    if (cached !== undefined) {
      setEntry(cached);
      return;
    }
    setEntry(null);
    let live = true;
    loadImageSize(src).then((next) => {
      if (live) setEntry(next);
    });
    return () => {
      live = false;
    };
  }, [src]);

  return entry;
}

/** Test hook: empty the cache. */
export function clearImageSizeCache(): void {
  cache.clear();
  pending.clear();
}
