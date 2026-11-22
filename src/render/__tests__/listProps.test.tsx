/**
 * `list` theme props: marker colours, sizes, column width, indent, spacing.
 * Spec: docs/rewrite/phase-3a/theme-props.md
 */
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { findAll } from '../../__tests__/tree';
import { resolveTheme, type FlatThemeInput } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { tableFor } from './helpers';

type Flat = Record<string, unknown>;
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Flat;

async function rendered(source: string, theme: FlatThemeInput = {}) {
  const ctx = createRenderCtx({
    components: defaultComponents,
    theme: resolveTheme(theme),
  });
  const view = await render(<BlockList table={tableFor(source)} ctx={ctx} />);
  return view.container;
}

/** Marker texts, in order. */
const markers = (root: Awaited<ReturnType<typeof rendered>>, chars: string) =>
  findAll(root, 'Text').filter((n) => chars.includes(String(n.children[0])));

describe('list theme props', () => {
  it('resolves the built-in list tokens (indent 20, gap 6)', () => {
    const { tokens } = resolveTheme();
    expect(tokens.list).toMatchObject({ indent: 20, gap: 6, itemSpacing: 0 });
  });

  it('colours and sizes bullets, and colours ordered markers apart', async () => {
    const root = await rendered('- a\n\n1. b', {
      list: {
        bulletColor: 'red',
        bulletSize: 30,
        markerColor: 'blue',
        markerFontWeight: '700',
      },
    });
    const [bullet] = markers(root, '•');
    expect(flat(bullet!.props.style)).toMatchObject({
      color: 'red',
      fontSize: 30,
    });
    const [num] = markers(root, '1.');
    const style = flat(num!.props.style);
    expect(style).toMatchObject({
      color: 'blue',
      fontWeight: '700',
      textAlign: 'right',
    });
    expect(style.fontSize).not.toBe(30);
  });

  it('floors the marker column with markerMinWidth, same for 9. and 10.', async () => {
    const source = Array.from({ length: 10 }, (_, i) => `${i + 1}. x`).join(
      '\n'
    );
    const root = await rendered(source, {
      list: { markerMinWidth: 40, gapWidth: 10 },
    });
    const widths = findAll(root, 'View')
      .map((v) => flat(v.props.style))
      .filter((s) => s.paddingRight === 10)
      .map((s) => s.width);
    expect(widths).toHaveLength(10);
    expect(new Set(widths)).toEqual(new Set([50]));
  });

  it('indent sets the marker column floor per nesting level', async () => {
    const root = await rendered('- a\n  - b', { list: { marginLeft: 30 } });
    const widths = findAll(root, 'View')
      .map((v) => flat(v.props.style))
      .filter((s) => s.paddingRight === 6)
      .map((s) => s.width);
    expect(widths).toEqual([30, 30]);
  });

  it('itemSpacing separates items and nested lists, not the first item', async () => {
    const root = await rendered('- a\n  - b\n- c', {
      list: { itemSpacing: 7 },
    });
    const items = findAll(root, 'View')
      .map((v) => flat(v.props.style))
      .filter((s) => s.flexDirection === 'row');
    expect(items.map((s) => s.marginTop)).toEqual([undefined, undefined, 7]);
    const lists = findAll(root, 'View')
      .map((v) => flat(v.props.style))
      .filter((s) => s.marginTop === 7 && s.flexDirection === undefined);
    expect(lists).toHaveLength(1);
  });

  it('keeps one text column for 9. and 10., and marginLeft never shrinks it', async () => {
    const source = Array.from(
      { length: 10 },
      (_, i) => `${i + 1}. x\n   1. y`
    ).join('\n');
    const root = await rendered(source, { list: { marginLeft: 8 } });
    const widths = findAll(root, 'View')
      .map((v) => flat(v.props.style))
      .filter((s) => s.paddingRight === 6)
      .map((s) => s.width as number);
    const outer = widths.filter((_, i) => i % 2 === 0);
    // 3 chars ("10.") at 16px * 0.6, plus the gap: wider than marginLeft 8.
    expect(new Set(outer).size).toBe(1);
    expect(outer[0]).toBeGreaterThan(8);
    // The nested single-digit lists keep their own, narrower column.
    expect(Math.min(...widths)).toBeGreaterThan(8);
  });

  it('keeps the defaults when a theme sets other list props only', () => {
    const { tokens } = resolveTheme({ list: { itemSpacing: 4 } });
    expect(tokens.list).toMatchObject({ indent: 20, gap: 6, itemSpacing: 4 });
  });
});
