import { StyleSheet } from 'react-native';
import { act } from 'react';
import { renderTree, type Tree } from '../../__tests__/tree';
import { resolveTheme } from '../../theme';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { defaultComponents } from '../defaults';
import { tableFor } from './helpers';

const SOURCE = '| h1 | h2 |\n|---|---|\n| a | b |\n| c | d |\n| e | f |\n';

type Style = Record<string, unknown>;
const styleOf = (node: { props: { style?: unknown } }): Style =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Style;

function mount(table: object, source = SOURCE) {
  const theme = resolveTheme({ table });
  const ctx = createRenderCtx({ components: defaultComponents, theme });
  return renderTree(<BlockList table={tableFor(source)} ctx={ctx} />);
}

/** Row Views, in order: head first. */
const rows = (root: Tree) =>
  root.findAll((n) => n.type === 'View' && styleOf(n).flexDirection === 'row');

describe('table row backgrounds', () => {
  it('colors the header row, and alternates the body rows from even', async () => {
    const root = await mount({
      headerBackgroundColor: '#111',
      rowEvenBackgroundColor: '#222',
      rowOddBackgroundColor: '#333',
    });
    expect(rows(root).map((r) => styleOf(r).backgroundColor)).toEqual([
      '#111',
      '#222',
      '#333',
      '#222',
    ]);
  });

  it('leaves rows unpainted by default', async () => {
    const root = await mount({});
    expect(
      rows(root).every((r) => styleOf(r).backgroundColor === undefined)
    ).toBe(true);
  });
});

describe('table header cell', () => {
  const header = (theme: ReturnType<typeof resolveTheme>) =>
    StyleSheet.flatten(theme.tableHeaderCell.text) as Style;

  it('is bold by default', () => {
    expect(header(resolveTheme({})).fontWeight).toBeDefined();
  });

  it('takes headerColor and headerFontFamily (no synthetic bold)', () => {
    const style = header(
      resolveTheme({
        table: { headerColor: '#abc', headerFontFamily: 'Inter-Bold' },
      })
    );
    expect(style).toMatchObject({
      color: '#abc',
      fontFamily: 'Inter-Bold',
      fontWeight: 'normal',
    });
  });
});

describe('table frame', () => {
  it('defaults to no alignment and no bleed', () => {
    expect(resolveTheme({}).tableFrame).toEqual({ align: null, bleed: 0 });
  });

  it('keeps the border on the scroll view when unset', async () => {
    const root = await mount({ borderColor: '#f00', borderWidth: 2 });
    const scroll = root.find('RCTScrollView');
    expect(styleOf(scroll).borderWidth).toBe(2);
  });

  it('aligns a narrow table and moves the border onto the table', async () => {
    const root = await mount({
      align: 'center',
      borderColor: '#f00',
      borderWidth: 2,
      borderRadius: 6,
    });
    const scroll = root.find('RCTScrollView');
    expect(styleOf(scroll).borderWidth).toBeUndefined();
    expect(scroll.props.contentContainerStyle).toMatchObject({
      flexGrow: 1,
      justifyContent: 'center',
    });
    const bordered = root.find(
      (n) => n.type === 'View' && styleOf(n).borderRadius === 6
    );
    expect(styleOf(bordered)).toMatchObject({
      borderWidth: 2,
      borderColor: '#f00',
      overflow: 'hidden',
    });
  });

  it('aligns right and keeps the border off the scroll view with a bleed', async () => {
    const root = await mount({
      align: 'right',
      horizontalOverflow: 8,
      borderWidth: 1,
    });
    expect(
      root.find('RCTScrollView').props.contentContainerStyle
    ).toMatchObject({ justifyContent: 'flex-end', paddingHorizontal: 8 });
    const bordered = root.find(
      (n) =>
        n.type === 'View' &&
        styleOf(n).borderWidth === 1 &&
        styleOf(n).overflow === undefined
    );
    expect(bordered).toBeDefined();
  });

  it('clamps a negative horizontalOverflow to no bleed', () => {
    expect(
      resolveTheme({ table: { horizontalOverflow: -4 } }).tableFrame.bleed
    ).toBe(0);
  });

  it('bleeds a scrolling table by horizontalOverflow each side', async () => {
    const root = await mount({ horizontalOverflow: 16 });
    const scroll = root.find('RCTScrollView');
    expect(styleOf(scroll).marginHorizontal).toBe(-16);
    expect(scroll.props.contentContainerStyle).toMatchObject({
      paddingHorizontal: 16,
      justifyContent: 'flex-start',
    });
  });
});

afterAll(() => act(async () => {}));
