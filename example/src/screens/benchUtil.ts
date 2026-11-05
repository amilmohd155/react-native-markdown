import { Platform } from 'react-native';

/** Resolves after `n` animation frames. */
export const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
    step(n);
  });

export function deviceInfo() {
  // `Platform.constants` is undefined on web.
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  return {
    os: Platform.OS,
    osVersion: Platform.Version,
    model: c.Model ?? c.model ?? null,
    brand: c.Brand ?? null,
    userAgent:
      typeof navigator !== 'undefined' && Platform.OS === 'web'
        ? navigator.userAgent
        : null,
    hermes: (globalThis as { HermesInternal?: unknown }).HermesInternal != null,
    dev: __DEV__,
  };
}

/**
 * Logs `value` as JSON in lines under Android's ~4 KB logcat limit:
 * `[tag i/n] <chunk>`. Reassemble by joining the chunks in order:
 *   adb logcat -d -s ReactNativeJS -v raw | grep '^\[bench'
 */
export function logChunked(tag: string, value: unknown) {
  const json = JSON.stringify(value);
  const size = 3000;
  const n = Math.max(1, Math.ceil(json.length / size));
  for (let i = 0; i < n; i++) {
    console.log(
      `[${tag} ${i + 1}/${n}] ${json.slice(i * size, (i + 1) * size)}`
    );
  }
}

interface HermesStats {
  readonly js_heapSize?: number;
  readonly js_allocatedBytes?: number;
}

export interface HeapSample {
  /** Hermes heap capacity, bytes. */
  readonly heapSize: number | null;
  /** Bytes currently allocated (live, plus garbage if no GC ran). */
  readonly allocated: number | null;
}

/**
 * Forces a GC when the engine exposes `gc()`. Release Hermes builds usually
 * don't; the result says whether it ran, and `retainedHeap` is only
 * trustworthy when it did.
 */
export function forceGc(): boolean {
  const gc = (globalThis as { gc?: unknown }).gc;
  if (typeof gc === 'function') {
    gc();
    return true;
  }
  return false;
}

/** `HermesInternal.getInstrumentedStats()`, or nulls without Hermes. */
export function heapSample(): HeapSample {
  const hermes = (
    globalThis as {
      HermesInternal?: { getInstrumentedStats?: () => HermesStats };
    }
  ).HermesInternal;
  const stats = hermes?.getInstrumentedStats?.();
  return {
    heapSize: stats?.js_heapSize ?? null,
    allocated: stats?.js_allocatedBytes ?? null,
  };
}

/** `q`-quantile of an ascending-sorted list (nearest rank). */
export function quantile(sorted: readonly number[], q: number): number {
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, i)]!;
}
