import { StyleSheet } from 'react-native';
import {
  ELEMENT_NAMES,
  createTheme,
  darkTheme,
  fontStateIndex,
  lightTheme,
  resolveTheme,
  type ElementStyle,
  type FlatThemeBlock,
  type FlatThemeInput,
  type FontFaces,
  type ResolvedTheme,
} from '../index';

const inter: FontFaces = {
  regular: 'Inter_400Regular',
  italic: 'Inter_400Regular_Italic',
  bold: 'Inter_700Bold',
  boldItalic: 'Inter_700Bold_Italic',
};

/** Every resolved style that has a text part, by a readable name. */
function allStyles(theme: ResolvedTheme): [string, ElementStyle][] {
  return [
    ...ELEMENT_NAMES.map((n): [string, ElementStyle] => [n, theme.elements[n]]),
    ...theme.headings.map((h, i): [string, ElementStyle] => [`h${i + 1}`, h]),
    ['tableHeaderCell', theme.tableHeaderCell],
    ['tightParagraph', theme.tightParagraph],
    ['footnoteSection', theme.footnoteSection],
    ['codeBlockGutter', theme.codeBlockGutter],
  ];
}

function flat(style: Parameters<typeof StyleSheet.flatten>[0]) {
  return StyleSheet.flatten(style) ?? {};
}

describe('merge order', () => {
  it('layers built-in < plugin blocks (in order) < top-level keys < scheme block', () => {
    const theme = (scheme: 'light' | 'dark') =>
      resolveTheme(
        {
          link: { color: 'top', fontWeight: '600' },
          dark: { link: { color: 'dark' } },
          light: { link: { color: 'light' } },
        },
        scheme,
        [
          { link: { color: 'plugin1', textDecorationLine: 'none' } },
          { link: { color: 'plugin2', fontWeight: '300' } },
        ]
      );
    expect(theme('dark').elements.Link.text).toEqual({
      textDecorationLine: 'none', // plugin 1 beats the built-in
      fontWeight: '600', // top-level beats plugin 2
      color: 'dark', // scheme block beats everything
    });
    expect(theme('light').elements.Link.text.color).toBe('light');
  });

  it('merges per key and per prop, and skips undefined', () => {
    const theme = resolveTheme(
      { codeBlock: { padding: 20, borderRadius: undefined } },
      'light',
      [{ codeBlock: { borderColor: 'red' } }]
    );
    const derived = resolveTheme().elements.CodeBlock;
    expect(theme.elements.CodeBlock.text).toEqual(derived.text);
    expect(theme.elements.CodeBlock.container).toEqual({
      ...derived.container,
      padding: 20,
      borderColor: 'red',
    });
  });

  it('applies top-level keys to both schemes and the block only to its own', () => {
    const input: FlatThemeInput = {
      paragraph: { fontSize: 18 },
      dark: { link: { color: 'dark-link' }, paragraph: { color: 'dark-text' } },
      light: { link: { color: 'light-link' } },
    };
    const light = resolveTheme(input, 'light');
    const dark = resolveTheme(input, 'dark');
    expect(light.tokens.fontSize.base).toBe(18);
    expect(dark.tokens.fontSize.base).toBe(18);
    expect(light.elements.Link.text.color).toBe('light-link');
    expect(dark.elements.Link.text.color).toBe('dark-link');
    expect(dark.elements.Paragraph.text.color).toBe('dark-text');
    expect(light.elements.Paragraph.text.color).toBe(
      lightTheme.paragraph!.color
    );
  });

  it('merges syntax and link variants one level deeper', () => {
    const theme = resolveTheme(
      {
        codeBlock: { syntax: { keyword: 'k', string: 's' } },
        dark: { codeBlock: { syntax: { keyword: 'dk' } } },
      },
      'dark'
    );
    expect(theme.tokens.syntax).toEqual({
      ...darkTheme.codeBlock!.syntax,
      keyword: 'dk',
      string: 's',
    });
    expect(Object.isFrozen(theme.tokens.syntax)).toBe(true);
  });

  it('merges a checked item style onto the default, or turns it off', () => {
    const on = resolveTheme({ checkbox: { checkedText: { opacity: 0.2 } } });
    expect(on.tokens.checkbox.checkedText).toEqual({
      textDecorationLine: 'line-through',
      opacity: 0.2,
    });
    expect(
      resolveTheme({ checkbox: { checkedText: false } }).tokens.checkbox
        .checkedText
    ).toBe(false);
  });

  it('never mutates its input or the built-ins', () => {
    const input: FlatThemeInput = Object.freeze({
      paragraph: Object.freeze({ color: 'a' }),
      dark: Object.freeze({
        codeBlock: Object.freeze({ syntax: Object.freeze({ keyword: 'k' }) }),
      }),
    });
    expect(() => resolveTheme(input, 'dark')).not.toThrow();
    expect(darkTheme.paragraph!.color).not.toBe('a');
  });
});

describe('plugin keys', () => {
  // A plugin key is not in the core whitelist; the map is empty here, so the
  // test goes through a cast, as a plugin's own types would.
  const callout = { callout: { color: 'c', padding: 4, fontWeight: '700' } };
  const asBlock = (b: object) => b as FlatThemeBlock;

  it('routes text props to the text and the rest to the container', () => {
    const theme = resolveTheme({}, 'light', [asBlock(callout)]);
    expect(theme.pluginElements.callout!.text).toEqual({
      color: 'c',
      fontWeight: '700',
    });
    expect(theme.pluginElements.callout!.container).toEqual({ padding: 4 });
    expect(theme.pluginElements.other).toBeUndefined();
  });

  it('merges the plugin default under the user key, per prop', () => {
    const theme = resolveTheme(
      asBlock({ callout: { color: 'user', margin: 2 } }),
      'light',
      [asBlock(callout)]
    );
    expect(theme.pluginElements.callout!.text).toEqual({
      color: 'user',
      fontWeight: '700',
    });
    expect(theme.pluginElements.callout!.container).toEqual({
      padding: 4,
      margin: 2,
    });
  });

  it('lets a scheme block restyle a plugin key', () => {
    const input = asBlock({
      callout: { color: 'top' },
      dark: { callout: { color: 'dark' } },
    });
    expect(resolveTheme(input, 'dark').pluginElements.callout!.text.color).toBe(
      'dark'
    );
    expect(
      resolveTheme(input, 'light').pluginElements.callout!.text.color
    ).toBe('top');
  });

  it('does not list core keys as plugin elements', () => {
    const theme = resolveTheme({ link: { color: 'x' } });
    expect(Object.keys(theme.pluginElements)).toEqual([]);
  });
});

describe('elements from the merged block', () => {
  it('splits text and view props per element', () => {
    const { elements } = resolveTheme({
      paragraph: { fontWeight: '500', textAlign: 'center', marginBottom: 4 },
      blockquote: {
        color: 'gray',
        borderLeftWidth: 2,
        paddingLeft: 8,
        marginTop: 1,
      },
      codeBlock: {
        color: '#000',
        fontSize: 13,
        lineHeight: 20,
        borderRadius: 12,
        padding: 16,
      },
      tableCell: { padding: 3, fontStyle: 'italic' },
      divider: { height: 2, marginTop: 5 },
    });
    expect(elements.Paragraph.text).toMatchObject({
      fontWeight: '500',
      textAlign: 'center',
    });
    expect(elements.Paragraph.container).toEqual({ marginBottom: 4 });
    expect(elements.Blockquote.text).toEqual({ color: 'gray' });
    expect(elements.Blockquote.container).toMatchObject({
      borderLeftWidth: 2,
      paddingLeft: 8,
      marginTop: 1,
    });
    expect(elements.CodeBlock.text).toMatchObject({
      color: '#000',
      fontSize: 13,
      lineHeight: 20,
    });
    expect(elements.CodeBlock.container).toMatchObject({
      borderRadius: 12,
      padding: 16,
    });
    expect(elements.TableCell.text.fontStyle).toBe('italic');
    expect(elements.TableCell.container.padding).toBe(3);
    expect(elements.Divider.container).toMatchObject({
      height: 2,
      marginTop: 5,
    });
  });

  it('applies inline element props to their elements', () => {
    const { elements } = resolveTheme({
      strong: { color: 'a', fontWeight: '800' },
      em: { fontStyle: 'normal' },
      strikethrough: { color: 'b' },
      underline: { color: 'c' },
      link: { textDecorationLine: 'none', fontWeight: '600' },
      inlineCode: { fontSize: 12, backgroundColor: 'd' },
      kbd: { color: 'e' },
      highlight: { color: 'f' },
      superscript: { color: 'g' },
      footnoteReference: { color: 'h' },
      footnoteBackLink: { color: 'i' },
    });
    expect(elements.Strong.text).toEqual({ color: 'a', fontWeight: '800' });
    expect(elements.Emphasis.text).toEqual({ fontStyle: 'normal' });
    expect(elements.Strikethrough.text.color).toBe('b');
    expect(elements.Underline.text.color).toBe('c');
    expect(elements.Link.text).toMatchObject({
      textDecorationLine: 'none',
      fontWeight: '600',
    });
    expect(elements.InlineCode.text).toMatchObject({
      fontSize: 12,
      backgroundColor: 'd',
    });
    expect(elements.Kbd.text.color).toBe('e');
    expect(elements.Highlight.text.color).toBe('f');
    expect(elements.Superscript.text.color).toBe('g');
    expect(elements.FootnoteReference.text.color).toBe('h');
    expect(elements.FootnoteBackLink.text.color).toBe('i');
  });

  it('applies the code block header and footnote definition props', () => {
    const { elements } = resolveTheme({
      codeBlockHeader: { color: 'a', backgroundColor: 'b', paddingVertical: 2 },
      footnoteDefinition: { fontSize: 12, color: 'c' },
      htmlBlock: { color: 'd', marginBottom: 1 },
    });
    expect(elements.CodeBlockHeader.text.color).toBe('a');
    expect(elements.CodeBlockHeader.container).toMatchObject({
      backgroundColor: 'b',
      paddingVertical: 2,
    });
    expect(elements.FootnoteDefinition.text).toMatchObject({
      fontSize: 12,
      color: 'c',
    });
    expect(elements.HtmlBlock.text.color).toBe('d');
    expect(elements.HtmlBlock.container.marginBottom).toBe(1);
  });

  it('lets the props that source a derived value reach its variants', () => {
    const r = resolveTheme({
      divider: { backgroundColor: '#123456' },
      codeBlock: { backgroundColor: '#abcdef' },
      footnoteDefinition: { highlightColor: 'pink' },
      link: { color: '#cc0003' },
    });
    expect(r.tokens.colors.border).toBe('#123456');
    expect(flat(r.footnoteSection.container).borderTopColor).toBe('#123456');
    expect(flat(r.codeBlockGutter.container).borderRightColor).toBe('#123456');
    expect(r.elements.CodeBlock.container.backgroundColor).toBe('#abcdef');
    expect(r.tokens.colors.footnoteHighlight).toBe('pink');
    expect(r.elements.FootnoteReference.text.color).toBe('#cc0003');
  });

  it('carries props into the variants derived from an element', () => {
    const theme = resolveTheme({
      paragraph: { color: 'p', marginTop: 3 },
      list: { marginTop: 5 },
      tableCell: { padding: 9 },
    });
    expect(theme.tightParagraph.text.color).toBe('p');
    expect(theme.tightParagraph.container).toEqual({
      marginTop: 3,
      marginBottom: 0,
    });
    expect(theme.nestedList.container).toEqual({
      paddingLeft: 0,
      marginTop: 5,
      marginBottom: 0,
    });
    expect(theme.tableHeaderCell.container).toMatchObject({ padding: 9 });
    expect(theme.tableHeaderCell.text.fontWeight).toBe('600');
  });

  it('aligns the code gutter with the code text', () => {
    const theme = resolveTheme({
      codeBlock: { fontFamily: 'Mono', fontSize: 15, lineHeight: 22 },
    });
    expect(theme.codeBlockGutter.text).toMatchObject({
      fontFamily: 'Mono',
      fontSize: 15,
      lineHeight: 22,
      color: theme.tokens.colors.muted,
      textAlign: 'right',
    });
  });

  it('creates all styles with one StyleSheet.create call', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    resolveTheme(
      createTheme({
        paragraph: { fontFamily: inter },
        strong: { color: 'red' },
        h3: { fontSize: 22 },
      }),
      'light',
      [{ link: { color: 'plugin' } }]
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('tokens drive the derived styles', () => {
  it('restyles every element that derives from the paragraph colour', () => {
    const a = resolveTheme({ paragraph: { color: '#aa0001' } });
    const b = resolveTheme({ paragraph: { color: '#bb0002' } });
    const dependent: string[] = [];
    const entriesB = new Map(allStyles(b));
    for (const [name, style] of allStyles(a)) {
      if (style.text.color === '#aa0001') {
        dependent.push(name);
        expect(entriesB.get(name)!.text.color).toBe('#bb0002');
      }
    }
    expect(dependent).toEqual(
      expect.arrayContaining([
        'Paragraph',
        'ListItem',
        'TableCell',
        'CodeBlock',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'tableHeaderCell',
        'tightParagraph',
      ])
    );
  });
});

describe('font faces', () => {
  const faces: FlatThemeInput = { paragraph: { fontFamily: inter } };

  it('sets the regular face on block text and the bold face on headings and heads', () => {
    const theme = resolveTheme(faces);
    expect(theme.elements.Paragraph.text.fontFamily).toBe('Inter_400Regular');
    expect(theme.elements.ListItem.text.fontFamily).toBe('Inter_400Regular');
    for (const h of theme.headings) {
      expect(h.text.fontFamily).toBe('Inter_700Bold');
      expect(h.text.fontWeight).toBeUndefined();
    }
    expect(theme.tableHeaderCell.text.fontFamily).toBe('Inter_700Bold');
    expect(theme.tableHeaderCell.text.fontWeight).toBeUndefined();
  });

  it('uses the heading fontFamily when set', () => {
    const theme = resolveTheme({
      paragraph: { fontFamily: inter },
      h1: { fontFamily: 'Display' },
      h2: { fontFamily: 'Display' },
      h3: { fontFamily: 'Display' },
      h4: { fontFamily: 'Display' },
      h5: { fontFamily: 'Display' },
      h6: { fontFamily: 'Display' },
    });
    // A family name for headings keeps fontWeight, as before.
    expect(theme.headings[0]!.text).toMatchObject({
      fontFamily: 'Display',
      fontWeight: '700',
    });
    expect(theme.headings[2]!.text.fontWeight).toBe('600');
  });

  it('keeps a per-level heading family, face maps included', () => {
    const display: FontFaces = { regular: 'D_400', bold: 'D_700' };
    const theme = resolveTheme({
      paragraph: { fontFamily: inter },
      h2: { fontFamily: display },
      h3: { fontFamily: 'Name' },
    });
    // The face map keeps its bold face (no weight), the name keeps a weight.
    expect(theme.headings[1]!.text.fontFamily).toBe('D_700');
    expect(theme.headings[1]!.text.fontWeight).toBeUndefined();
    expect(theme.headings[2]!.text).toMatchObject({
      fontFamily: 'Name',
      fontWeight: '600',
    });
    // Levels that set nothing follow the body.
    expect(theme.headings[0]!.text.fontFamily).toBe('Inter_700Bold');
  });

  it('falls back to fontWeight for headings whose map has no bold face', () => {
    const theme = resolveTheme({ paragraph: { fontFamily: { regular: 'R' } } });
    expect(theme.headings[0]!.text).toMatchObject({
      fontFamily: 'R',
      fontWeight: '700',
    });
    expect(theme.headings[3]!.text.fontWeight).toBe('600');
  });

  it('gives Strong and Emphasis the face for where they sit', () => {
    const theme = resolveTheme(faces);
    const at = (bold: boolean, italic: boolean, heading = false) =>
      fontStateIndex({ bold, italic, heading });

    expect(theme.elements.Strong.text).toEqual({ fontFamily: 'Inter_700Bold' });
    expect(theme.elements.Emphasis.text).toEqual({
      fontFamily: 'Inter_400Regular_Italic',
    });
    // Nested: the combined face, both ways round.
    expect(theme.fontVariants.Strong[at(false, true)]!.text).toEqual({
      fontFamily: 'Inter_700Bold_Italic',
    });
    expect(theme.fontVariants.Emphasis[at(true, false)]!.text).toEqual({
      fontFamily: 'Inter_700Bold_Italic',
    });
    // In a heading, Strong adds nothing and Emphasis picks boldItalic.
    expect(theme.fontVariants.Strong[at(true, false, true)]!.text).toEqual({});
    expect(theme.fontVariants.Emphasis[at(true, false, true)]!.text).toEqual({
      fontFamily: 'Inter_700Bold_Italic',
    });
  });

  it('applies Strong/Emphasis props to every variant', () => {
    const theme = resolveTheme({
      paragraph: { fontFamily: inter },
      strong: { color: 'red' },
    });
    for (const variant of theme.fontVariants.Strong) {
      expect(variant.text.color).toBe('red');
    }
  });

  it('keeps one shared style for family names', () => {
    const theme = resolveTheme({ paragraph: { fontFamily: 'Inter' } });
    expect(theme.elements.Strong.text).toEqual({ fontWeight: '700' });
    expect(new Set(theme.fontVariants.Strong).size).toBe(1);
    expect(theme.fontVariants.Strong[0]).toBe(theme.elements.Strong);
    expect(new Set(theme.fontVariants.Emphasis).size).toBe(1);
  });

  it('accepts a face map for mono and uses its regular face', () => {
    const theme = resolveTheme({
      codeBlock: { fontFamily: { regular: 'JetBrainsMono' } },
    });
    expect(theme.elements.CodeBlock.text.fontFamily).toBe('JetBrainsMono');
    expect(theme.elements.InlineCode.text.fontFamily).toBe('JetBrainsMono');
    expect(theme.elements.HtmlBlock.text.fontFamily).toBe('JetBrainsMono');
  });
});
