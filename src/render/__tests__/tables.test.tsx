import { Platform, StyleSheet } from 'react-native';
import { act } from 'react';
import { renderTree, type TestInstance, type Tree } from '../../__tests__/tree';
import { resolveTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import {
  cachedColumnWidths,
  capColumnWidths,
  columnWidths,
} from '../tableLayout';
import { tableFor } from './helpers';

const SOURCE = '| a | b |\n|---|--:|\n| one | two |\n| three | 4 |\n';

/** Cell Views: host Views with the cell border style. */
const cells = (root: Tree) =>
  root.findAll(
    (n) =>
      n.type === 'View' &&
      'borderWidth' in
        ((StyleSheet.flatten(n.props.style) as object | undefined) ?? {})
  );

const widthOf = (cell: TestInstance) =>
  (StyleSheet.flatten(cell.props.style) as { width?: number }).width;

function mount(source: string, ctx: RenderCtx) {
  return renderTree(<BlockList table={tableFor(source)} ctx={ctx} />);
}

/** Simulates native layout: each cell reports `widths[i]`, then the frame flushes. */
async function layOut(root: Tree, widths: number[]) {
  await act(async () => {
    cells(root).forEach((cell, i) =>
      cell.props.onLayout?.({ nativeEvent: { layout: { width: widths[i] } } })
    );
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('table column widths', () => {
  it('measures every cell, then gives each column its widest cell', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = await mount(SOURCE, ctx);

    // Measuring: hidden, cells unconstrained (no fixed width).
    expect(cells(root)).toHaveLength(6);
    expect(cells(root).map(widthOf)).toEqual(Array(6).fill(undefined));
    expect(JSON.stringify(root.toJSON())).toContain('"opacity":0');

    // Column 0: a=30, one=50, three=90 → 90. Column 1: b=20, two=60, 4=10 → 60.
    await layOut(root, [30, 20, 50, 60, 90, 10]);

    expect(cells(root).map(widthOf)).toEqual([90, 60, 90, 60, 90, 60]);
    expect(cells(root).every((c) => c.props.onLayout === undefined)).toBe(true);
    expect(JSON.stringify(root.toJSON())).not.toContain('"opacity":0');
  });

  it('waits for every cell, even when cells report in separate frames', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = await mount(SOURCE.replace('three', 'late'), ctx);
    const report = (indices: number[], widths: number[]) =>
      act(async () => {
        const all = cells(root);
        indices.forEach((i) =>
          all[i]?.props.onLayout?.({
            nativeEvent: { layout: { width: widths[i] } },
          })
        );
      });
    const widths = [30, 20, 50, 60, 90, 10];

    // Frame 1: the cells of the first two rows only; the frame flushes.
    await report([0, 1, 2, 3], widths);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(cells(root).map(widthOf)).toEqual(Array(6).fill(undefined));

    // Frame 2: the last row arrives, then every column is final.
    await report([4, 5], widths);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(cells(root).map(widthOf)).toEqual([90, 60, 90, 60, 90, 60]);
  });

  it('adds a pixel on web, where onLayout rounds widths down', async () => {
    const spy = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      const ctx = createRenderCtx({ components: defaultComponents });
      // Own source: widths are cached per theme and table content.
      const root = await mount(SOURCE.replace('three', 'web'), ctx);
      await layOut(root, [30, 20, 50, 60, 90, 10]);
      expect(cells(root).map(widthOf)).toEqual([91, 61, 91, 61, 91, 61]);
    } finally {
      spy.restore();
    }
  });

  it('reuses cached widths on the next mount of the same table', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    await layOut(await mount(SOURCE, ctx), [30, 20, 50, 60, 90, 10]);

    const again = await mount(SOURCE, ctx);
    expect(cells(again).map(widthOf)).toEqual([90, 60, 90, 60, 90, 60]);
    expect(cells(again).every((c) => c.props.onLayout === undefined)).toBe(
      true
    );
  });

  it('re-measures when the table content changes (a new key)', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = await mount(SOURCE, ctx);
    await layOut(root, [30, 20, 50, 60, 90, 10]);

    await root.rerender(
      <BlockList table={tableFor(SOURCE.replace('three', 'six'))} ctx={ctx} />
    );
    expect(cells(root).map(widthOf)).toEqual(Array(6).fill(undefined));
  });

  it('caches per theme', async () => {
    const theme = resolveTheme({});
    const ctx = createRenderCtx({ components: defaultComponents, theme });
    const root = await mount('| x |\n|---|\n| y |\n', ctx);
    await layOut(root, [100, 120]);

    const other = createRenderCtx({
      components: defaultComponents,
      theme: resolveTheme({}),
    });
    const fresh = await mount('| x |\n|---|\n| y |\n', other);
    expect(cells(fresh).map(widthOf)).toEqual([undefined, undefined]);
    expect(cachedColumnWidths(theme, '')).toBeNull();
  });

  it('stores natural widths clamped to [min, ceiling]', () => {
    expect(
      columnWidths([10, 100.2, 1000, undefined], { min: 48, max: 600 })
    ).toEqual([48, 101, 600, 48]);
  });

  it('measures up to the token max when it exceeds twice the window', async () => {
    const theme = resolveTheme({ table: { maxColumnWidth: 5000 } });
    const ctx = createRenderCtx({ components: defaultComponents, theme });
    const root = await mount('| x |\n|---|\n| y |\n', ctx);
    const style = StyleSheet.flatten(cells(root)[0]!.props.style) as {
      maxWidth?: number;
    };
    expect(style.maxWidth).toBe(5000); // not 2 x window (1500)
    await layOut(root, [3000, 3000]);
    expect(cells(root).map(widthOf)).toEqual([3000, 3000]);
  });

  it('caps natural widths at render time', () => {
    expect(capColumnWidths([48, 101, 600], { min: 48, max: 280 })).toEqual([
      48, 101, 280,
    ]);
    expect(capColumnWidths([48, 101, 600], { min: 48, max: 90 })).toEqual([
      48, 90, 90,
    ]);
    // A cap below the minimum never goes under it.
    expect(capColumnWidths([60], { min: 48, max: 20 })).toEqual([48]);
  });

  it('re-clamps on a container resize without measuring again', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = await mount(SOURCE.replace('three', 'wide'), ctx);
    await layOut(root, [30, 20, 50, 60, 400, 10]);
    expect(cells(root).map(widthOf)).toEqual([280, 60, 280, 60, 280, 60]);
    const before = cells(root);

    const scroll = root.findAll((n) => n.type === 'RCTScrollView')[0]!;
    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { width: 150 } } });
    });
    expect(cells(root).map(widthOf)).toEqual([150, 60, 150, 60, 150, 60]);
    expect(JSON.stringify(root.toJSON())).not.toContain('"opacity":0');
    // The same cells stayed mounted: no new pass.
    expect(cells(root)).toEqual(before);

    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { width: 500 } } });
    });
    expect(cells(root).map(widthOf)).toEqual([280, 60, 280, 60, 280, 60]);
  });

  it('treats a container width of 0 as unknown, not as a cap of min', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = await mount(SOURCE.replace('three', 'wide'), ctx);
    await layOut(root, [30, 20, 50, 60, 400, 10]);
    const scroll = root.findAll((n) => n.type === 'RCTScrollView')[0]!;
    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { width: 0 } } });
    });
    expect(cells(root).map(widthOf)).toEqual([280, 60, 280, 60, 280, 60]);
  });
});
