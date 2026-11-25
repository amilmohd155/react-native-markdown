import { useCallback, useSyncExternalStore } from 'react';
import { Image } from 'react-native';
import { createLru } from './lru';

/**
 * Image size cache. Spec: docs/rewrite/phase-3/image-cache.md (Design > Cache).
 *
 * - One `Image.getSize` request per URL, shared by every image using it;
 *   later renders and remounts read the size synchronously.
 * - Failed lookups are cached too, with their time, so a broken URL isn't
 *   retried on every render. An error entry expires after `ERROR_TTL_MS`:
 *   the next subscribe (or `loadImageSize`) looks it up again.
 *   `retryImageSize` clears it on demand.
 * - Bounded LRU: a read refreshes recency; the least recently used entries
 *   are evicted past `MAX_ENTRIES`.
 * - A small external store: components subscribe per URL with
 *   `useSyncExternalStore` and re-render when that URL's size arrives.
 * - A size provided by the caller (`imageSizes`) wins over the cache and
 *   is never looked up.
 */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

interface ErrorEntry {
  readonly status: 'error';
  readonly at: number;
}

type Entry = ImageSize | ErrorEntry;
type Result = ImageSize | 'error';

const MAX_ENTRIES = 500;
const ERROR_TTL_MS = 60_000;
const cache = createLru<Entry>(MAX_ENTRIES);
const pending = new Map<string, Promise<Result>>();
const listeners = new Map<string, Set<() => void>>();

const isError = (entry: Entry): entry is ErrorEntry => 'status' in entry;

const publicEntry = (entry: Entry): Result =>
  isError(entry) ? 'error' : entry;

const isExpired = (entry: Entry | undefined): boolean =>
  entry !== undefined &&
  isError(entry) &&
  Date.now() - entry.at >= ERROR_TTL_MS;

const errorEntry = (): ErrorEntry =>
  Object.freeze({ status: 'error', at: Date.now() });

function notify(src: string): void {
  listeners.get(src)?.forEach((onChange) => onChange());
}

function remember(src: string, entry: Entry): Result {
  cache.set(src, entry);
  notify(src);
  return publicEntry(entry);
}

/**
 * Reads an entry and refreshes its recency. The entry object is unchanged,
 * so snapshots stay stable. Expiry is not checked here: that would change
 * the snapshot during render.
 */
const read = (src: string): Entry | undefined => cache.get(src);

function subscribe(src: string, onChange: () => void): () => void {
  let set = listeners.get(src);
  if (set === undefined) {
    set = new Set();
    listeners.set(src, set);
  }
  set.add(onChange);
  // Start the lookup on subscribe (after commit), not during render. An
  // expired error entry is looked up again.
  const entry = cache.peek(src);
  if (entry === undefined || isExpired(entry)) loadImageSize(src);
  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(src);
  };
}

/**
 * The cached size of `src`: a size, `'error'`, or `undefined` if unknown.
 * A provided size wins.
 */
export function cachedImageSize(
  src: string,
  provided?: ImageSize
): Result | undefined {
  if (provided !== undefined) return provided;
  const entry = read(src);
  return entry === undefined ? undefined : publicEntry(entry);
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

/** Stores a result unless the request was superseded by a retry. */
function settle(src: string, request: Promise<Result>, entry: Entry): Result {
  if (pending.get(src) !== request) return publicEntry(entry);
  pending.delete(src);
  return remember(src, entry);
}

/** Looks up the size of `src`, at most one request per URL at a time. */
export function loadImageSize(src: string): Promise<Result> {
  const cached = cache.peek(src);
  if (cached !== undefined) {
    if (!isExpired(cached)) return Promise.resolve(publicEntry(cached));
    // Expired error: forget it and look up again.
    cache.delete(src);
    notify(src);
  }
  let request = pending.get(src);
  if (request === undefined) {
    const started: Promise<Result> = getSize(src).then(
      ({ width, height }) =>
        settle(
          src,
          started,
          width > 0 && height > 0
            ? Object.freeze({ width, height })
            : errorEntry()
        ),
      () => settle(src, started, errorEntry())
    );
    request = started;
    pending.set(src, started);
  }
  return request;
}

/** Clears the entry (and any pending lookup) of `src` and looks it up again. */
export function retryImageSize(src: string): void {
  cache.delete(src);
  pending.delete(src);
  notify(src);
  loadImageSize(src);
}

/**
 * Warms the cache for `urls`. Resolves when every lookup has settled; a
 * failure is cached as an error entry, never thrown.
 */
export async function prefetchImageSizes(
  urls: readonly string[]
): Promise<void> {
  await Promise.all(
    urls.map((url) => loadImageSize(url).catch((): Result => 'error'))
  );
}

/**
 * The size of `src` for rendering: known size, `'error'`, or `null` while
 * loading. Renders once more when the lookup finishes. A `provided` size is
 * returned as is, with no lookup.
 */
export function useImageSize(src: string, provided?: ImageSize): Result | null {
  const hasProvided = provided !== undefined;
  const subscribeToSrc = useCallback(
    (onChange: () => void) =>
      hasProvided ? () => {} : subscribe(src, onChange),
    [src, hasProvided]
  );
  // Cached entries are frozen objects or 'error': stable snapshots.
  const snapshot = () => cachedImageSize(src, provided) ?? null;
  return useSyncExternalStore(subscribeToSrc, snapshot, snapshot);
}

/** Test hook: empty the cache. */
export function clearImageSizeCache(): void {
  cache.clear();
  pending.clear();
  listeners.clear();
}
