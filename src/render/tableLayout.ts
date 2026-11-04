import type { ResolvedTheme } from '../theme';

/**
 * Column width cache for tables. Spec: docs/rewrite/03-architecture.md
 * (Default elements: Table): widths are computed once per table and cached
 * by block identity (P1-9: source text plus context, not a hash).
 *
 * Keyed per resolved theme, because fonts and sizes change the widths.
 */

/** Narrowest and widest a column gets; wider content wraps. */
export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 280;

const MAX_ENTRIES = 200;
const caches = new WeakMap<ResolvedTheme, Map<string, readonly number[]>>();

export function cachedColumnWidths(
  theme: ResolvedTheme,
  key: string
): readonly number[] | null {
  return caches.get(theme)?.get(key) ?? null;
}

export function storeColumnWidths(
  theme: ResolvedTheme,
  key: string,
  widths: readonly number[]
): void {
  let cache = caches.get(theme);
  if (cache === undefined) {
    cache = new Map();
    caches.set(theme, cache);
  }
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, widths);
}

/** Final column widths from the widest measured cell per column. */
export function columnWidths(
  measured: readonly (number | undefined)[]
): number[] {
  return Array.from(measured, (width) =>
    Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, Math.ceil(width ?? 0))
    )
  );
}
