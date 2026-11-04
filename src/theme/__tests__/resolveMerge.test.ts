import { StyleSheet } from 'react-native';
import {
  ELEMENT_NAMES,
  createTheme,
  fontStateIndex,
  lightTheme,
  resolveTheme,
  type ElementStyle,
  type FontFaces,
  type HeadingLevel,
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
  ];
}

describe('merge order', () => {
  it('layers derived < plugin themes (in order) < user overrides', () => {
    const user = createTheme({
      elements: { Link: { text: { color: 'user' } } },
    });
    const theme = resolveTheme(user, [
      { Link: { text: { color: 'plugin1', fontSize: 11, letterSpacing: 1 } } },
      { Link: { text: { color: 'plugin2', fontSize: 22 } } },
    ]);
    expect(theme.elements.Link.text).toEqual({
      textDecorationLine: 'underline', // derived, untouched
      letterSpacing: 1, // plugin 1 only
      fontSize: 22, // plugin 2 beats plugin 1
      color: 'user', // user beats both plugins
    });
  });

  it('merges text and container separately', () => {
    const theme = resolveTheme(
      createTheme({
        elements: { CodeBlock: { container: { padding: 20 } } },
      })
    );
    const derived = resolveTheme(lightTheme).elements.CodeBlock;
    expect(theme.elements.CodeBlock.text).toEqual(derived.text);
    expect(theme.elements.CodeBlock.container).toEqual({
      ...derived.container,
      padding: 20,
    });
  });

  it('calls a Heading function once per level at resolve time', () => {
    const fn = jest.fn((level: HeadingLevel) => ({
      text: { letterSpacing: level },
    }));
    const theme = resolveTheme(createTheme({ elements: { Heading: fn } }));
    expect(fn.mock.calls.map(([level]) => level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(theme.headings.map((h) => h.text.letterSpacing)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    // Derived heading sizes are kept.
    expect(theme.headings[0]!.text.fontSize).toBe(40);
  });

  it('applies a Heading object override to every level', () => {
    const theme = resolveTheme(
      createTheme({ elements: { Heading: { text: { color: 'red' } } } })
    );
    expect(theme.headings.map((h) => h.text.color)).toEqual(
      Array(6).fill('red')
    );
  });

  it('carries overrides into the variants derived from an element', () => {
    const theme = resolveTheme(
      createTheme({
        elements: {
          Paragraph: { text: { color: 'p' }, container: { marginTop: 3 } },
          List: { container: { marginTop: 5 } },
          TableCell: { container: { padding: 9 } },
        },
      })
    );
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

  it('ignores the elements of a plain token set', () => {
    expect(resolveTheme(lightTheme).elements.Link.text.color).toBe(
      lightTheme.colors.link
    );
    expect(resolveTheme(lightTheme).tokens).toEqual(lightTheme);
  });

  it('still creates all styles with one StyleSheet.create call', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    resolveTheme(
      createTheme({
        fonts: { body: inter },
        elements: {
          Strong: { text: { color: 'red' } },
          Heading: (level) => ({ text: { letterSpacing: level } }),
        },
      }),
      [{ Link: { text: { color: 'plugin' } } }]
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('tokens drive the derived styles', () => {
  it('restyles every element that derives from a changed token', () => {
    const a = resolveTheme({
      ...lightTheme,
      colors: { ...lightTheme.colors, text: '#aa0001' },
    });
    const b = resolveTheme({
      ...lightTheme,
      colors: { ...lightTheme.colors, text: '#bb0002' },
    });
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

  it('restyles every element that derives from the link color', () => {
    const b = resolveTheme({
      ...lightTheme,
      colors: { ...lightTheme.colors, link: '#cc0003' },
    });
    expect(b.elements.Link.text.color).toBe('#cc0003');
    expect(b.elements.FootnoteReference.text.color).toBe('#cc0003');
  });
});

describe('font faces', () => {
  const faces = createTheme({ fonts: { body: inter } });

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

  it('uses fonts.heading for headings when set', () => {
    const theme = resolveTheme(
      createTheme({ fonts: { body: inter, heading: 'Display' } })
    );
    // A family name for headings keeps fontWeight, as before.
    expect(theme.headings[0]!.text).toMatchObject({
      fontFamily: 'Display',
      fontWeight: '700',
    });
    expect(theme.headings[2]!.text.fontWeight).toBe('600');
  });

  it('falls back to fontWeight for headings whose map has no bold face', () => {
    const theme = resolveTheme(
      createTheme({ fonts: { body: { regular: 'R' } } })
    );
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

  it('applies Strong/Emphasis overrides to every variant', () => {
    const theme = resolveTheme(
      createTheme({
        fonts: { body: inter },
        elements: { Strong: { text: { color: 'red' } } },
      })
    );
    for (const variant of theme.fontVariants.Strong) {
      expect(variant.text.color).toBe('red');
    }
  });

  it('keeps one shared style for family names', () => {
    const theme = resolveTheme(createTheme({ fonts: { body: 'Inter' } }));
    expect(theme.elements.Strong.text).toEqual({ fontWeight: '700' });
    expect(new Set(theme.fontVariants.Strong).size).toBe(1);
    expect(theme.fontVariants.Strong[0]).toBe(theme.elements.Strong);
    expect(new Set(theme.fontVariants.Emphasis).size).toBe(1);
  });

  it('accepts a { regular } map for mono', () => {
    const theme = resolveTheme(
      createTheme({ fonts: { mono: { regular: 'JetBrainsMono' } } })
    );
    expect(theme.elements.CodeBlock.text.fontFamily).toBe('JetBrainsMono');
    expect(theme.elements.InlineCode.text.fontFamily).toBe('JetBrainsMono');
  });
});
