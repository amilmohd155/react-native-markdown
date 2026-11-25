import { StyleSheet, useWindowDimensions } from 'react-native';
import { act, StrictMode, useEffect } from 'react';
import { renderTree, type Tree } from '../../__tests__/tree';
import type { NodeTable } from '../../model';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import type { Components } from '../elements';
import { tableFor } from './helpers';

/**
 * A table that grows across stream flushes (rows appended, same columns).
 * Root cause was `tableKey` being the Provider's React key: every flush
 * remounted the whole subtree and re-ran the hidden measuring pass (P3-37).
 *
 * The tables are in the open block (`openBlock: 0`, as a running stream sets
 * it); closing clears it. Asserts mount counts, the measuring (opacity 0)
 * style, and what the cache holds.
 */
const counts = { table: 0, cell: 0 };
const DefaultTable = defaultComponents.Table;
const DefaultCell = defaultComponents.TableCell;
const components: Components = {
  ...defaultComponents,
  Table(props) {
    useEffect(() => {
      counts.table += 1;
    }, []);
    return <DefaultTable {...props} />;
  },
  TableCell(props) {
    useEffect(() => {
      counts.cell += 1;
    }, []);
    return <DefaultCell {...props} />;
  },
};

const HEAD = '| a | b |\n|---|---|\n';
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => `| r${i} | v${i} |\n`).join('');

const cells = (root: Tree) =>
  root.findAll(
    (n) =>
      n.type === 'View' &&
      'borderWidth' in
        ((StyleSheet.flatten(n.props.style) as object | undefined) ?? {})
  );

const hidden = (root: Tree) =>
  JSON.stringify(root.toJSON()).includes('"opacity":0');

const withOpen = (source: string, open: boolean): NodeTable => {
  const table = tableFor(source);
  return open ? { ...table, openBlock: 0 } : table;
};

const sizeOf = (cell: ReturnType<typeof cells>[number]) =>
  StyleSheet.flatten(cell.props.style) as {
    width?: number;
    minWidth?: number;
    maxWidth?: number;
  };
const minWidths = (root: Tree) => cells(root).map((c) => sizeOf(c).minWidth);
const fixedWidths = (root: Tree) => cells(root).map((c) => sizeOf(c).width);

/** Native layout: every cell still measuring reports, then the frame flushes. */
async function layOut(root: Tree, width = 60) {
  await act(async () => {
    cells(root).forEach((cell) =>
      cell.props.onLayout?.({ nativeEvent: { layout: { width } } })
    );
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  counts.table = 0;
  counts.cell = 0;
});
afterEach(() => jest.useRealTimers());

describe('streaming table (rows appended per flush)', () => {
  const view = (
    ctx: ReturnType<typeof createRenderCtx>,
    n: number,
    open = true
  ) => <BlockList table={withOpen(HEAD + rows(n), open)} ctx={ctx} />;

  it('keeps one Table and its cells mounted, and never re-hides after the first measure', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(view(ctx, 1));
    expect(hidden(root)).toBe(true); // first measuring pass
    await layOut(root);
    expect(hidden(root)).toBe(false);
    expect(counts).toEqual({ table: 1, cell: 4 });

    const hiddenAfterFlush: boolean[] = [];
    for (const n of [2, 3, 4]) {
      await root.rerender(view(ctx, n));
      hiddenAfterFlush.push(hidden(root));
      await layOut(root);
    }

    // Only the new row's 2 cells mount per flush, Table once.
    expect(counts.table).toBe(1);
    expect(counts.cell).toBe(4 + 2 * 3);
    // No hidden measuring pass after the first.
    expect(hiddenAfterFlush).toEqual([false, false, false]);
  });

  it('seeds cells as minWidth, never a fixed width, and stores nothing while open', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(view(ctx, 1));
    await layOut(root, 70);
    await root.rerender(view(ctx, 2));
    expect(minWidths(root)).toEqual(Array(6).fill(70));
    expect(fixedWidths(root)).toEqual(Array(6).fill(undefined));
    await layOut(root, 70);
    // Nothing was stored: a fresh open table of the same content has no seed.
    expect(hidden(await renderTree(view(ctx, 2)))).toBe(true);
  });

  it('bounds a growing cell by the token max, never the measuring ceiling', async () => {
    const ctx = createRenderCtx({ components });
    let ceiling = 0;
    const Probe = () => {
      ceiling = 2 * useWindowDimensions().width;
      return null;
    };
    await renderTree(<Probe />);
    const root = await renderTree(view(ctx, 1));
    await layOut(root, 70);
    await root.rerender(view(ctx, 2));
    const maxes = cells(root).map((c) => sizeOf(c).maxWidth);
    expect(maxes).toEqual(Array(6).fill(280));
    expect(ceiling).toBeGreaterThan(280);
  });

  it('grows a column for a wider new row without hiding', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(view(ctx, 1));
    await layOut(root, 60);
    await root.rerender(view(ctx, 2));
    const all = cells(root);
    await act(async () => {
      // The new row's first cell is wider than the seed.
      all[4]!.props.onLayout?.({ nativeEvent: { layout: { width: 90 } } });
    });
    expect(hidden(root)).toBe(false);
    expect(minWidths(root)).toEqual([90, 60, 90, 60, 90, 60]);
  });

  it('drops the seed when the column count changes, and measures hidden', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(view(ctx, 1));
    await layOut(root);
    const three = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';
    await root.rerender(<BlockList table={withOpen(three, true)} ctx={ctx} />);
    expect(hidden(root)).toBe(true);
    await layOut(root, 50);
    expect(hidden(root)).toBe(false);
    expect(minWidths(root)).toEqual(Array(6).fill(50));
  });

  it('does not remount cells per flush while a pass runs, and ends visible', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(view(ctx, 1));
    for (const n of [2, 3, 4]) {
      await root.rerender(view(ctx, n)); // flushes outpace layout
      expect(hidden(root)).toBe(true);
    }
    expect(counts.table).toBe(1);
    expect(counts.cell).toBe(4 + 2 * 3); // one mount per cell, no remounts
    await layOut(root, 55);
    expect(hidden(root)).toBe(false);
    expect(minWidths(root)).toEqual(Array(10).fill(55));
  });

  it('measures once under StrictMode (effects run twice)', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(
      <StrictMode>
        <BlockList table={withOpen(HEAD + rows(1), true)} ctx={ctx} />
      </StrictMode>
    );
    await layOut(root, 60);
    expect(hidden(root)).toBe(false);
    expect(minWidths(root)).toEqual(Array(4).fill(60));
  });

  it('adopts the seed on close: not hidden, stored, a remount reads it', async () => {
    const ctx = createRenderCtx({ components });
    const root = await renderTree(view(ctx, 1));
    await layOut(root, 60);
    await root.rerender(view(ctx, 2));
    await layOut(root, 60);
    expect(hidden(await renderTree(view(ctx, 2)))).toBe(true); // not stored while open

    await root.rerender(view(ctx, 2, false));
    expect(hidden(root)).toBe(false); // no blink
    expect(fixedWidths(root)).toEqual(Array(6).fill(60));
    expect(counts.cell).toBeLessThanOrEqual(4 + 2 + 6); // not remounted on close

    const again = await renderTree(view(ctx, 2, false));
    expect(hidden(again)).toBe(false);
    expect(fixedWidths(again)).toEqual(Array(6).fill(60));
    expect(cells(again).every((c) => c.props.onLayout === undefined)).toBe(
      true
    );
  });

  it('closes with no seed: hidden pass, then stored', async () => {
    const ctx = createRenderCtx({ components });
    // Row count unused by other tests: the cache is shared across them.
    const root = await renderTree(view(ctx, 7)); // never laid out
    await root.rerender(view(ctx, 7, false));
    expect(hidden(root)).toBe(true);
    await layOut(root, 55);
    expect(hidden(root)).toBe(false);
    expect(fixedWidths(root)).toEqual(Array(16).fill(55));
    const again = await renderTree(view(ctx, 7, false));
    expect(hidden(again)).toBe(false);
    expect(fixedWidths(again)).toEqual(Array(16).fill(55));
  });
});
