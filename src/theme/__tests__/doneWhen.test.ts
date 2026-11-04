import { StyleSheet } from 'react-native';
import {
  ELEMENT_NAMES,
  clearThemeCache,
  createTheme,
  lightTheme,
  resolveTheme,
  resolveThemeProp,
  type ResolvedTheme,
  type ThemeInput,
  type ThemeTokens,
} from '../index';

/** Every resolved style, by a readable name, as comparable JSON. */
function snapshotOf(theme: ResolvedTheme): Map<string, string> {
  const map = new Map<string, string>();
  const add = (name: string, style: { text: object; container: object }) =>
    map.set(name, JSON.stringify({ t: style.text, c: style.container }));
  for (const name of ELEMENT_NAMES) add(name, theme.elements[name]);
  theme.headings.forEach((h, i) => add(`h${i + 1}`, h));
  add('tableHeaderCell', theme.tableHeaderCell);
  add('nestedList', theme.nestedList);
  add('tightParagraph', theme.tightParagraph);
  add('footnoteSection', theme.footnoteSection);
  return map;
}

/** Names whose resolved style differs between two token sets. */
function changedBy(change: (t: ThemeTokens) => ThemeTokens): string[] {
  const before = snapshotOf(resolveTheme(lightTheme));
  const after = snapshotOf(resolveTheme(change(lightTheme)));
  return [...before.keys()].filter((k) => before.get(k) !== after.get(k));
}

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

describe('done when: changing one token restyles every element deriving from it', () => {
  it.each<[string, (t: ThemeTokens) => ThemeTokens, string[]]>([
    [
      'colors.text',
      (t) => ({ ...t, colors: { ...t.colors, text: '#010101' } }),
      [
        'Paragraph',
        'ListItem',
        'TableCell',
        'CodeBlock',
        ...HEADINGS,
        'tableHeaderCell',
        'tightParagraph',
      ],
    ],
    [
      'colors.muted',
      (t) => ({ ...t, colors: { ...t.colors, muted: '#020202' } }),
      ['Blockquote', 'HtmlBlock', 'footnoteSection'],
    ],
    [
      'colors.link',
      (t) => ({ ...t, colors: { ...t.colors, link: '#030303' } }),
      ['Link', 'FootnoteReference'],
    ],
    [
      'colors.codeBg',
      (t) => ({ ...t, colors: { ...t.colors, codeBg: '#040404' } }),
      ['InlineCode', 'Kbd', 'CodeBlock'],
    ],
    [
      'colors.border',
      (t) => ({ ...t, colors: { ...t.colors, border: '#050505' } }),
      ['TableCell', 'tableHeaderCell', 'Divider', 'footnoteSection'],
    ],
    [
      'colors.quoteBar',
      (t) => ({ ...t, colors: { ...t.colors, quoteBar: '#060606' } }),
      ['Blockquote'],
    ],
    [
      'colors.highlight',
      (t) => ({ ...t, colors: { ...t.colors, highlight: '#070707' } }),
      ['Highlight'],
    ],
    ['radius.code', (t) => ({ ...t, radius: { code: 1 } }), ['CodeBlock']],
    [
      'fonts.mono',
      (t) => ({ ...t, fonts: { ...t.fonts, mono: 'Mono' } }),
      ['InlineCode', 'Kbd', 'CodeBlock', 'HtmlBlock'],
    ],
    [
      'lineHeight',
      (t) => ({ ...t, lineHeight: 2 }),
      [
        'Paragraph',
        'ListItem',
        'TableCell',
        'HtmlBlock',
        'FootnoteDefinition',
        'tableHeaderCell',
        'tightParagraph',
        'footnoteSection',
      ],
    ],
    [
      'fontSize.scale',
      (t) => ({ ...t, fontSize: { ...t.fontSize, scale: 1.5 } }),
      // h6 is `base` itself, whatever the scale.
      ['h1', 'h2', 'h3', 'h4', 'h5'],
    ],
  ])('%s', (_name, change, expected) => {
    expect(changedBy(change).sort()).toEqual([...expected].sort());
  });

  it('fontSize.base reaches text, headings, code, scripts and footnotes', () => {
    expect(
      changedBy((t) => ({ ...t, fontSize: { ...t.fontSize, base: 20 } }))
    ).toEqual(
      expect.arrayContaining([
        'Paragraph',
        'ListItem',
        'TableCell',
        'CodeBlock',
        'InlineCode',
        'Kbd',
        'Superscript',
        'Subscript',
        'FootnoteReference',
        'FootnoteDefinition',
        'HtmlBlock',
        ...HEADINGS,
        'tableHeaderCell',
        'tightParagraph',
        'footnoteSection',
      ])
    );
  });

  it('spacing.block reaches every block that spaces itself', () => {
    expect(
      changedBy((t) => ({ ...t, spacing: { ...t.spacing, block: 20 } }))
    ).toEqual(
      expect.arrayContaining([
        'Paragraph',
        'Blockquote',
        'List',
        'CodeBlock',
        'Table',
        'TableCell',
        'Divider',
        'Image',
        'HtmlBlock',
        'footnoteSection',
        ...HEADINGS,
      ])
    );
  });
});

describe('done when: an equal theme object reuses the resolved theme', () => {
  beforeEach(() => clearThemeCache());

  it('creates styles once across re-renders with equal inline objects', () => {
    const spy = jest.spyOn(StyleSheet, 'create');
    const render = () =>
      resolveThemeProp(
        {
          colors: { link: '#0a0a0a' },
          fonts: { body: { regular: 'R', bold: 'B' } },
          elements: { Link: { text: { fontSize: 18 } } },
        },
        'light'
      );
    const first = render();
    for (let i = 0; i < 5; i++) expect(render()).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('cache key edge cases', () => {
  beforeEach(() => clearThemeCache());
  const resolve = (input: ThemeInput) => resolveThemeProp(input, 'light');

  it('tells groups apart by key even when the key counts match', () => {
    expect(resolve({ colors: { link: 'red' } })).not.toBe(
      resolve({ colors: { text: 'red' } })
    );
    expect(resolve({ fonts: { body: { regular: 'R' } } })).not.toBe(
      resolve({ fonts: { body: { regular: 'R', bold: 'B' } } })
    );
  });

  it('tells element overrides apart by element, part, kind and presence', () => {
    const base = resolve({ elements: { Link: { text: { color: 'a' } } } });
    expect(
      resolve({ elements: { Paragraph: { text: { color: 'a' } } } })
    ).not.toBe(base);
    expect(
      resolve({ elements: { Link: { container: { margin: 1 } } } })
    ).not.toBe(base);

    const code = resolve({
      elements: { CodeBlock: { container: { padding: 1 } } },
    });
    expect(
      resolve({ elements: { CodeBlock: { container: { padding: 2 } } } })
    ).not.toBe(code);
    expect(
      resolve({ elements: { CodeBlock: { container: { padding: 1 } } } })
    ).toBe(code);

    // function vs object, and an undefined entry vs an object
    const object = resolve({ elements: { Heading: { text: { color: 'a' } } } });
    expect(
      resolve({ elements: { Heading: () => ({ text: { color: 'a' } }) } })
    ).not.toBe(object);
    expect(resolve({ elements: { Link: undefined } })).not.toBe(
      resolve({ elements: { Link: { text: { color: 'a' } } } })
    );
  });

  it('compares listBullets by value', () => {
    const a = resolve({ listBullets: ['-', '*'] });
    expect(resolve({ listBullets: ['-', '*'] })).toBe(a);
    expect(resolve({ listBullets: ['-', '+'] })).not.toBe(a);
    expect(resolve({ listBullets: ['-'] })).not.toBe(a);
  });
});

describe('createTheme edge cases', () => {
  it('merges two object Heading overrides per part', () => {
    const base = createTheme({
      elements: {
        Heading: { text: { color: 'red' }, container: { margin: 1 } },
      },
    });
    const theme = createTheme(
      { elements: { Heading: { text: { letterSpacing: 2 } } } },
      base
    );
    expect(theme.elements.Heading).toEqual({
      text: { color: 'red', letterSpacing: 2 },
      container: { margin: 1 },
    });
  });
});
