import { StyleSheet } from 'react-native';
import {
  ELEMENT_NAMES,
  clearThemeCache,
  resolveTheme,
  resolveThemeProp,
  type FlatThemeInput,
  type ResolvedTheme,
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
  add('codeBlockGutter', theme.codeBlockGutter);
  return map;
}

/** Names whose resolved style differs when `input` is merged in. */
function changedBy(input: FlatThemeInput): string[] {
  const before = snapshotOf(resolveTheme());
  const after = snapshotOf(resolveTheme(input));
  return [...before.keys()].filter((k) => before.get(k) !== after.get(k));
}

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

describe('done when: changing one prop restyles every element deriving from it', () => {
  it.each<[string, FlatThemeInput, string[]]>([
    [
      'paragraph.color',
      { paragraph: { color: '#010101' } },
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
    ['blockquote.color', { blockquote: { color: '#020202' } }, ['Blockquote']],
    ['htmlBlock.color', { htmlBlock: { color: '#020202' } }, ['HtmlBlock']],
    [
      'codeBlock.header.color',
      { codeBlock: { header: { color: '#020202' } } },
      ['CodeBlockHeader'],
    ],
    [
      'link.color',
      { link: { color: '#030303' } },
      ['Link', 'FootnoteReference', 'FootnoteBackLink'],
    ],
    [
      'codeBlock.backgroundColor',
      { codeBlock: { backgroundColor: '#040404' } },
      ['InlineCode', 'Kbd', 'CodeBlock', 'CodeBlockHeader'],
    ],
    [
      'divider.backgroundColor',
      { divider: { backgroundColor: '#050505' } },
      [
        'TableCell',
        'tableHeaderCell',
        'Divider',
        'footnoteSection',
        'CodeBlockHeader',
        'codeBlockGutter',
      ],
    ],
    [
      'blockquote.borderLeftColor',
      { blockquote: { borderLeftColor: '#060606' } },
      ['Blockquote'],
    ],
    [
      'highlight.backgroundColor',
      { highlight: { backgroundColor: '#070707' } },
      ['Highlight'],
    ],
    [
      'codeBlock.borderRadius',
      { codeBlock: { borderRadius: 1 } },
      ['CodeBlock'],
    ],
    [
      'codeBlock.fontFamily',
      { codeBlock: { fontFamily: 'Mono' } },
      [
        'InlineCode',
        'Kbd',
        'CodeBlock',
        'CodeBlockHeader',
        'codeBlockGutter',
        'HtmlBlock',
      ],
    ],
    [
      'paragraph.lineHeight',
      { paragraph: { lineHeight: 31 } },
      [
        'Paragraph',
        'ListItem',
        'TableCell',
        'HtmlBlock',
        'FootnoteDefinition',
        'footnoteSection',
        'tableHeaderCell',
        'tightParagraph',
      ],
    ],
    [
      'paragraph.marginBottom',
      { paragraph: { marginBottom: 20 } },
      ['Paragraph'],
    ],
    // h6 is the paragraph size itself, whatever the ratio.
    ['h1.fontSize', { h1: { fontSize: 50 } }, ['h1']],
  ])('%s', (_name, input, expected) => {
    expect(changedBy(input).sort()).toEqual([...expected].sort());
  });

  it('paragraph.fontSize reaches text, headings, code and footnotes (inline sizes are relative)', () => {
    expect(changedBy({ paragraph: { fontSize: 20 } })).toEqual(
      expect.arrayContaining([
        'Paragraph',
        'ListItem',
        'TableCell',
        'CodeBlock',
        'FootnoteDefinition',
        'HtmlBlock',
        ...HEADINGS,
        'tableHeaderCell',
        'tightParagraph',
        'footnoteSection',
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
          link: { color: '#0a0a0a', fontWeight: '700' },
          paragraph: { fontFamily: { regular: 'R', bold: 'B' } },
          dark: { link: { color: '#fafafa' } },
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
  const resolve = (input: FlatThemeInput) => resolveThemeProp(input, 'light');

  it('tells props apart by key, element and value', () => {
    const base = resolve({ link: { color: 'a' } });
    expect(resolve({ paragraph: { color: 'a' } })).not.toBe(base);
    expect(resolve({ link: { fontWeight: '700' } })).not.toBe(base);

    const code = resolve({ codeBlock: { padding: 1 } });
    expect(resolve({ codeBlock: { padding: 2 } })).not.toBe(code);
    expect(resolve({ codeBlock: { padding: 1 } })).toBe(code);
  });

  it('compares syntax, variants and admonitions by value, two levels deep', () => {
    const make = (color: string): FlatThemeInput => ({
      codeBlock: { syntax: { keyword: color } },
      link: { variants: { '^a': { color } } },
      blockquote: { admonitions: { note: { color } } },
    });
    const a = resolve(make('x'));
    expect(resolve(make('x'))).toBe(a);
    expect(resolve(make('y'))).not.toBe(a);
  });
});
