import { StyleSheet } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { lightTheme, resolveTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx, type RenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { cachedColumnWidths, columnWidths } from '../tableLayout';
import { tableFor } from './helpers';

const SOURCE = '| a | b |\n|---|--:|\n| one | two |\n| three | 4 |\n';

/** Cell Views: host Views with the cell border style. */
const cells = (root: ReactTestRenderer) =>
  root.root.findAll(
    (n) =>
      n.type === ('View' as never) &&
      'borderWidth' in
        ((StyleSheet.flatten(n.props.style) as object | undefined) ?? {})
  );

const widthOf = (cell: ReactTestInstance) =>
  (StyleSheet.flatten(cell.props.style) as { width?: number }).width;

function mount(source: string, ctx: RenderCtx) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<BlockList table={tableFor(source)} ctx={ctx} />);
  });
  return root;
}

/** Simulates native layout: each cell reports `widths[i]`, then the frame flushes. */
function layOut(root: ReactTestRenderer, widths: number[]) {
  act(() => {
    cells(root).forEach((cell, i) =>
      cell.props.onLayout?.({ nativeEvent: { layout: { width: widths[i] } } })
    );
  });
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('table column widths', () => {
  it('measures every cell, then gives each column its widest cell', () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = mount(SOURCE, ctx);

    // Measuring: hidden, cells unconstrained (no fixed width).
    expect(cells(root)).toHaveLength(6);
    expect(cells(root).map(widthOf)).toEqual(Array(6).fill(undefined));
    expect(JSON.stringify(root.toJSON())).toContain('"opacity":0');

    // Column 0: a=30, one=50, three=90 → 90. Column 1: b=20, two=60, 4=10 → 60.
    layOut(root, [30, 20, 50, 60, 90, 10]);

    expect(cells(root).map(widthOf)).toEqual([90, 60, 90, 60, 90, 60]);
    expect(cells(root).every((c) => c.props.onLayout === undefined)).toBe(true);
    expect(JSON.stringify(root.toJSON())).not.toContain('"opacity":0');
  });

  it('reuses cached widths on the next mount of the same table', () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    layOut(mount(SOURCE, ctx), [30, 20, 50, 60, 90, 10]);

    const again = mount(SOURCE, ctx);
    expect(cells(again).map(widthOf)).toEqual([90, 60, 90, 60, 90, 60]);
    expect(cells(again).every((c) => c.props.onLayout === undefined)).toBe(
      true
    );
  });

  it('re-measures when the table content changes', () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const root = mount(SOURCE, ctx);
    layOut(root, [30, 20, 50, 60, 90, 10]);

    act(() =>
      root.update(
        <BlockList table={tableFor(SOURCE.replace('three', 'six'))} ctx={ctx} />
      )
    );
    expect(cells(root).map(widthOf)).toEqual(Array(6).fill(undefined));
  });

  it('caches per theme', () => {
    const theme = resolveTheme(lightTheme);
    const ctx = createRenderCtx({ components: defaultComponents, theme });
    const root = mount('| x |\n|---|\n| y |\n', ctx);
    layOut(root, [100, 120]);

    const other = createRenderCtx({
      components: defaultComponents,
      theme: resolveTheme(lightTheme),
    });
    const fresh = mount('| x |\n|---|\n| y |\n', other);
    expect(cells(fresh).map(widthOf)).toEqual([undefined, undefined]);
    expect(cachedColumnWidths(theme, '')).toBeNull();
  });

  it('clamps column widths', () => {
    expect(columnWidths([10, 100.2, 1000, undefined])).toEqual([
      48, 101, 280, 48,
    ]);
  });
});
