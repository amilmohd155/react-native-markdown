import type { ResolvedTheme } from '../theme';
import type { TableCellSize } from './contexts';
import { createLru, type Lru } from './lru';

/**
 * Column width cache for tables. Spec: docs/rewrite/03-architecture.md
 * (Default elements: Table): widths are computed once per table and cached
 * by table content (P1-9, amended by P3-37: the table's own source slice).
 *
 * Keyed per resolved theme, because fonts and sizes change the widths.
 * LRU: a store refreshes an entry (reads are `peek`, safe in render); the
 * oldest is evicted at `MAX_ENTRIES` (P3-37).
 */

/** Column width bounds in points (`theme.tableColumns`, or with a ceiling as `max`). */
type TableColumns = ResolvedTheme['tableColumns'];

const MAX_ENTRIES = 200;
const caches = new WeakMap<ResolvedTheme, Lru<readonly number[]>>();

export function cachedColumnWidths(
  theme: ResolvedTheme,
  key: string
): readonly number[] | null {
  return caches.get(theme)?.peek(key) ?? null;
}

export function storeColumnWidths(
  theme: ResolvedTheme,
  key: string,
  widths: readonly number[]
): void {
  let cache = caches.get(theme);
  if (cache === undefined) {
    cache = createLru(MAX_ENTRIES);
    caches.set(theme, cache);
  }
  cache.set(key, widths);
}

/** `width` clamped to `[min, max]`; a `max` below `min` gives `min`. */
export function clampWidth(width: number, { min, max }: TableColumns): number {
  return Math.min(Math.max(min, max), Math.max(min, width));
}

/**
 * Natural column widths from the widest measured cell per column, clamped to
 * `[min, max]`. Pass the measuring ceiling (about twice the window) as `max`;
 * the visible cap is applied at render by `capColumnWidths` (P3-37).
 */
export function columnWidths(
  measured: readonly (number | undefined)[],
  bounds: TableColumns
): number[] {
  return Array.from(measured, (width) =>
    clampWidth(Math.ceil(width ?? 0), bounds)
  );
}

/** Column widths used to render: natural widths capped to `[min, max]`. */
export function capColumnWidths(
  natural: readonly number[],
  bounds: TableColumns
): number[] {
  return natural.map((width) => clampWidth(width, bounds));
}

/** Size of a cell that is measuring: its natural width, within `bounds`. */
export function measuringSize({ min, max }: TableColumns): TableCellSize {
  return { minWidth: min, maxWidth: max };
}

/**
 * What a table remembers between renders (P3-37). `widths` are natural
 * widths: `null` while a hidden measuring pass runs; while the table is
 * `open` (its block is still streaming) they are a grow-only seed, applied
 * as `minWidth` and never stored.
 */
export interface TableState {
  readonly theme: ResolvedTheme;
  readonly key: string;
  readonly open: boolean;
  readonly columns: number;
  readonly widths: readonly number[] | null;
  /** Remounts the cells, so native reports `onLayout` again. */
  readonly pass: number;
  /** Measuring ceiling, fixed when a pass starts. */
  readonly ceiling: number;
}

type TableInputs = Pick<
  TableState,
  'theme' | 'key' | 'open' | 'columns' | 'ceiling'
>;

/** Cached widths, if their column count matches. */
export function seedFor(
  theme: ResolvedTheme,
  key: string,
  columns: number
): readonly number[] | null {
  const widths = cachedColumnWidths(theme, key);
  return widths !== null && widths.length === columns ? widths : null;
}

/**
 * The state for new inputs (`prev` itself when nothing but the ceiling changed). A new theme or a closed table's new key re-reads
 * the cache; an open table keeps its seed across keys (its content changes
 * every flush). At the close of an open table its seed is adopted as the
 * final widths (no hidden pass). No widths left starts a hidden measuring
 * pass; a column count change drops the seed. `pass` (the cell remount)
 * bumps only when a pass starts, never while one is already running.
 */
export function advanceTableState(
  prev: TableState,
  next: TableInputs
): TableState {
  if (
    prev.theme === next.theme &&
    prev.key === next.key &&
    prev.open === next.open &&
    prev.columns === next.columns
  ) {
    return prev; // `ceiling` only matters when a pass starts
  }
  const closing = prev.open && !next.open;
  const themed = prev.theme !== next.theme;
  const rekeyed = !next.open && prev.key !== next.key;
  const adopt = closing && !themed && prev.widths?.length === next.columns;
  let widths = prev.widths;
  if (!adopt && (themed || closing || rekeyed)) {
    widths = seedFor(next.theme, next.key, next.columns);
  }
  if (widths !== null && widths.length !== next.columns) widths = null;
  const starts =
    widths === null &&
    (prev.widths !== null ||
      themed ||
      closing ||
      rekeyed ||
      prev.columns !== next.columns);
  return {
    ...next,
    widths,
    pass: starts ? prev.pass + 1 : prev.pass,
    ceiling: starts ? next.ceiling : prev.ceiling,
  };
}
