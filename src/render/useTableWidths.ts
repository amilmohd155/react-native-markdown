import { useContext, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  TableKeyContext,
  useIsOpenBlock,
  useRenderContext,
  type TableCellSize,
  type TableLayout,
} from './contexts';
import {
  advanceTableState,
  capColumnWidths,
  clampWidth,
  columnWidths,
  measuringSize,
  seedFor,
  storeColumnWidths,
  type TableState,
} from './tableLayout';

/**
 * react-native-web reports `onLayout` sizes from `offsetWidth`, which rounds
 * to whole pixels: a cell whose natural width is 67.17 reports 67, so its
 * text (53.17 wide, plus padding and border) wraps mid-word at the fixed
 * width. One pixel of slack covers the rounding; native reports exact floats.
 */
const webLayoutSlack = () => (Platform.OS === 'web' ? 1 : 0);

/**
 * The width state machine of the default `Table` (P3-37): theme and stream
 * state, seeding from the cache, growth while open, the render-time cap, the
 * container measure, the measuring scan and the store of closed widths. See
 * `Table` for the behavior.
 */
export function useTableWidths(columns: number) {
  const { theme } = useRenderContext();
  const key = useContext(TableKeyContext);
  const open = useIsOpenBlock();
  const { min, max } = theme.tableColumns;
  // Never below the token max: cached widths carry no window size in the key.
  const windowCeiling = Math.max(2 * useWindowDimensions().width, max);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [state, setState] = useState<TableState>(() => ({
    theme,
    key,
    open,
    columns,
    widths: seedFor(theme, key, columns), // '' (no cache) is never stored
    pass: 0,
    ceiling: windowCeiling,
  }));
  // Derived during render: see `advanceTableState`. A new measuring pass
  // remounts the cells: native reports `onLayout` only for new or resized
  // views, and unchanged sizes would never reveal it.
  const current = advanceTableState(state, {
    theme,
    key,
    open,
    columns,
    ceiling: windowCeiling,
  });
  if (current !== state) setState(current);
  const { widths: natural, pass, ceiling } = current;
  const grow = open && natural !== null;

  // One measuring pass per scan object: a new theme, table, pass or widths
  // makes a new one, which starts again with no measurements.
  const scan = useMemo(() => {
    const ceilingBounds = { min, max: ceiling };
    const measured = {
      widths: [] as number[],
      enrolled: new Set<object>(),
      reported: new Set<object>(),
      scheduled: false,
      disposed: false,
    };
    // Web reports `onLayout` a frame or more apart under load, so committing
    // on the first frame fixes only the columns measured so far (the rest
    // keep their natural width, ragged). Commit when every cell has reported.
    const commitWhenComplete = () => {
      if (
        measured.disposed ||
        measured.scheduled ||
        measured.enrolled.size === 0
      ) {
        return;
      }
      for (const cell of measured.enrolled) {
        if (!measured.reported.has(cell)) return;
      }
      // Cells lay out in the same frame; collect them all, then commit.
      measured.scheduled = true;
      requestAnimationFrame(() => {
        if (measured.disposed) return;
        const final = columnWidths(measured.widths, ceilingBounds);
        setState((prev) =>
          prev.pass === pass ? { ...prev, widths: final } : prev
        );
      });
    };
    return {
      measureSize: measuringSize(ceilingBounds),
      enroll(cell: object) {
        if (natural !== null) return () => {};
        measured.enrolled.add(cell);
        return () => {
          measured.enrolled.delete(cell);
          commitWhenComplete();
        };
      },
      report(cell: object, column: number, width: number) {
        if (natural === null) {
          measured.widths[column] = Math.max(
            measured.widths[column] ?? 0,
            width + webLayoutSlack()
          );
          measured.reported.add(cell);
          commitWhenComplete();
          return;
        }
        // Seeded: a column only grows, and only past what it already has.
        const seen = natural[column];
        if (!grow || seen === undefined || width <= seen) return;
        const wider = clampWidth(
          Math.ceil(width) + webLayoutSlack(),
          ceilingBounds
        );
        setState((prev) =>
          prev.pass === pass &&
          prev.widths !== null &&
          (prev.widths[column] ?? 0) < wider
            ? {
                ...prev,
                widths: prev.widths.map((w, i) => (i === column ? wider : w)),
              }
            : prev
        );
      },
      // Strict mode runs effects twice: re-arm on every attach.
      attach: () => {
        measured.disposed = false;
        return () => {
          measured.disposed = true;
        };
      },
    };
  }, [natural, grow, pass, min, ceiling]);
  // A replaced scan (new pass or widths) drops its pending commit.
  useEffect(() => scan.attach(), [scan]);
  // Closed widths are stored (and refreshed) here, never in render. An empty
  // key means no cache.
  useEffect(() => {
    if (!open && natural !== null && key !== '') {
      storeColumnWidths(theme, key, natural);
    }
  }, [open, natural, theme, key]);

  // The cap: tokens.max, or the container if narrower (the scroll view is
  // `bleed` wider than the table on each side).
  const { bleed } = theme.tableFrame;
  const cap =
    containerWidth === null || containerWidth <= 0
      ? max
      : Math.min(max, Math.max(0, containerWidth - 2 * bleed));
  const sizes = useMemo(
    () =>
      natural === null
        ? null
        : capColumnWidths(natural, { min, max: cap }).map(
            (width): TableCellSize =>
              grow && width < cap
                ? // Bounded by the token max, not the ceiling: a long cell never
                  // paints wider than the cap for a frame.
                  { minWidth: width, maxWidth: max }
                : { width }
          ),
    [natural, grow, min, cap, max]
  );
  const { enroll, report, measureSize } = scan;
  const layout = useMemo<TableLayout>(
    () => ({ sizes, measureSize, grow, enroll, report }),
    [sizes, measureSize, grow, enroll, report]
  );

  return {
    layout,
    hidden: natural === null,
    pass,
    onLayout: (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      setContainerWidth((prev) => (prev === width ? prev : width));
    },
  };
}
