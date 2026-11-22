import { StyleSheet } from 'react-native';
import { clearThemeCache, resolveThemeProp } from '../cache';
import type { FlatThemeInput } from '../flatTypes';
import { resolveTheme } from '../resolve';
import { resetThemeWarnings } from '../warn';

const flat = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('nested families merge per child', () => {
  it('keeps sibling children and props across top-level and dark', () => {
    const input: FlatThemeInput = {
      footnote: {
        reference: { color: '#111', fontScale: 0.5 },
        backLink: { color: '#222' },
      },
      codeBlock: { header: { color: '#333', paddingVertical: 2 } },
      dark: {
        footnote: { reference: { color: '#999' } },
        codeBlock: { header: { backgroundColor: '#444' } },
      },
    };
    const t = resolveTheme(input, 'dark');
    expect(t.flat.footnote?.reference).toEqual({
      color: '#999',
      fontScale: 0.5,
    });
    expect(t.flat.footnote?.backLink).toEqual({ color: '#222' });
    expect(t.flat.footnote?.definition?.highlightColor).toBeDefined();
    expect(t.flat.codeBlock.header).toEqual({
      color: '#333',
      paddingVertical: 2,
      backgroundColor: '#444',
    });
    expect(t.elements.FootnoteReference.text.color).toBe('#999');
    const light = resolveTheme(input, 'light');
    expect(light.flat.footnote?.reference?.color).toBe('#111');
  });
});

describe('cache with nested children', () => {
  beforeEach(clearThemeCache);
  const make = (color: string): FlatThemeInput => ({
    footnote: { definition: { color } },
    dark: { codeBlock: { header: { color } } },
  });

  it('hits for equal inline literals', () => {
    expect(resolveThemeProp(make('#a00'), 'dark')).toBe(
      resolveThemeProp(make('#a00'), 'dark')
    );
  });

  it('misses when a nested child changes', () => {
    expect(resolveThemeProp(make('#a00'), 'dark')).not.toBe(
      resolveThemeProp(make('#b00'), 'dark')
    );
  });
});

describe('warn on unknown nested props', () => {
  const g = globalThis as { __DEV__?: unknown };
  const original = g.__DEV__;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    g.__DEV__ = true;
    resetThemeWarnings();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    g.__DEV__ = original;
    warn.mockRestore();
  });

  it('warns once per family.child.prop', () => {
    const bad = (x: object) => x as never;
    resolveTheme(bad({ footnote: { reference: { size: 1 } } }));
    resolveTheme(bad({ footnote: { reference: { size: 2 } } }));
    resolveTheme(bad({ codeBlock: { header: { nope: 1 } } }));
    resolveTheme(bad({ footnote: { reference: { color: '#000' } } }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toContain(
      '"size" is not a prop of "footnote.reference"'
    );
    expect(warn.mock.calls[1]![0]).toContain(
      '"nope" is not a prop of "codeBlock.header"'
    );
  });
});

describe('list and table text props', () => {
  it('list text props reach item text and beat the paragraph', () => {
    const t = resolveTheme({
      paragraph: { color: 'p', fontSize: 18 },
      list: { color: 'li', fontStyle: 'italic', lineHeight: 30 },
    });
    expect(t.elements.ListItem.text).toMatchObject({
      color: 'li',
      fontSize: 18,
      fontStyle: 'italic',
      lineHeight: 30,
    });
  });

  it('table text props and cell padding and background reach cells and the header cell', () => {
    const t = resolveTheme({
      paragraph: { color: 'p' },
      table: {
        color: 'tc',
        fontSize: 13,
        cellPadding: 3,
        cellPaddingHorizontal: 4,
        cellPaddingVertical: 5,
        cellBackgroundColor: '#eee',
        headerColor: 'hc',
      },
    });
    expect(t.elements.TableCell.text).toMatchObject({
      color: 'tc',
      fontSize: 13,
    });
    expect(t.elements.TableCell.container).toMatchObject({
      padding: 3,
      paddingHorizontal: 4,
      paddingVertical: 5,
      backgroundColor: '#eee',
    });
    const header = t.tableHeaderCell;
    expect(flat(header.text)).toMatchObject({ color: 'hc', fontSize: 13 });
    expect(flat(header.container)).toMatchObject({
      paddingHorizontal: 4,
      backgroundColor: '#eee',
    });
  });
});

describe('removed keys', () => {
  it('are type errors at the top level', () => {
    const bad: FlatThemeInput[] = [
      // @ts-expect-error folded into footnote.reference
      { footnoteReference: { color: 'red' } },
      // @ts-expect-error folded into list
      { listItem: { color: 'red' } },
      // @ts-expect-error folded into table
      { tableCell: { padding: 1 } },
      // @ts-expect-error folded into codeBlock.header
      { codeBlockHeader: { color: 'red' } },
    ];
    expect(bad).toHaveLength(4);
  });

  it('inlineImage stays a top-level key', () => {
    const ok: FlatThemeInput = { inlineImage: { size: 20 } };
    expect(resolveTheme(ok).tokens.inlineImageSize).toBe(20);
  });
});
