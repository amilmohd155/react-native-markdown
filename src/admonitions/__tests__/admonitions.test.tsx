import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Markdown } from '../../api/Markdown';
import { renderTree, textOf } from '../../__tests__/tree';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { streamView } from '../../../test/stream/harness';
import type { FlatThemeInput } from '../../theme';
import { admonitions } from '../index';

type Options = Parameters<typeof admonitions>[0];

const parse = (
  src: string,
  options?: Options,
  preset: 'gfm' | 'commonmark' = 'gfm'
): Dumped[] =>
  dumpBlocks(
    parseWithMarkdownIt(src, { preset, plugins: [admonitions(options)] }).table
  );

const walk = (node: Dumped): Dumped[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
];
const all = (src: string, options?: Options) =>
  parse(src, options).flatMap(walk);
/** Plugin nodes dump as `Plugin(<type id>)`; Admonition is the only one. */
const alerts = (src: string, options?: Options) =>
  all(src, options).filter((n) => n.type.startsWith('Plugin('));
const quotes = (src: string) => all(src).filter((n) => n.type === 'Blockquote');
const texts = (node: Dumped) => walk(node).map((n) => n.text);

describe('admonitions: parse', () => {
  it.each([
    ['NOTE', 'note', 'Note'],
    ['TIP', 'tip', 'Tip'],
    ['IMPORTANT', 'important', 'Important'],
    ['WARNING', 'warning', 'Warning'],
    ['CAUTION', 'caution', 'Caution'],
  ])('converts [!%s]', (marker, kind, title) => {
    const src = `> [!${marker}]\n> body`;
    const found = alerts(src);
    expect(found).toHaveLength(1);
    expect(found[0]!.attrs).toEqual({ kind, title });
    expect(quotes(src)).toHaveLength(0);
  });

  it('matches the kind case-insensitively', () => {
    expect(alerts('> [!note]\n> a')[0]!.attrs).toMatchObject({ kind: 'note' });
    expect(alerts('> [!Tip]\n> a')[0]!.attrs).toMatchObject({ kind: 'tip' });
  });

  it('removes the marker line and keeps the body', () => {
    const [a] = alerts('> [!NOTE]\n> hello **there**');
    const text = texts(a!);
    expect(text).toContain('hello ');
    expect(text.join('')).not.toContain('[!NOTE]');
  });

  it('allows trailing blanks after the marker', () => {
    expect(alerts('> [!NOTE]  \n> body')).toHaveLength(1);
  });

  it('makes a bare marker an empty alert', () => {
    const [a] = alerts('> [!WARNING]');
    expect(a).toBeDefined();
    expect(a!.children ?? []).toHaveLength(0);
  });

  it('keeps later blocks', () => {
    const [a] = alerts(
      '> [!TIP]\n> one\n>\n> - a\n> - b\n>\n> ```js\n> x\n> ```'
    );
    expect((a!.children ?? []).map((c) => c.type)).toEqual([
      'Paragraph',
      'List',
      'CodeBlock',
    ]);
  });

  it('drops the marker paragraph when nothing else is in it', () => {
    const [a] = alerts('> [!NOTE]\n>\n> body');
    expect((a!.children ?? []).map((c) => c.type)).toEqual(['Paragraph']);
  });

  it('treats a lazy continuation line as body', () => {
    const [a] = alerts('> [!NOTE]\nlazy');
    expect(a).toBeDefined();
    expect(texts(a!)).toContain('lazy');
  });

  it('converts inside a list item', () => {
    expect(alerts('- item\n\n  > [!NOTE]\n  > inner')).toHaveLength(1);
  });

  it('converts a nested blockquote and leaves the outer one', () => {
    const src = '> outer\n>\n> > [!CAUTION]\n> > inner';
    expect(alerts(src)).toHaveLength(1);
    expect(quotes(src)).toHaveLength(1);
  });

  it('converts an alert that holds a blockquote', () => {
    const src = '> [!NOTE]\n> text\n>\n> > quoted';
    expect(alerts(src)).toHaveLength(1);
    expect(quotes(src)).toHaveLength(1);
  });

  it('converts adjacent alerts separately', () => {
    const src = '> [!NOTE]\n> a\n\n> [!TIP]\n> b';
    const kinds = alerts(src).map((a) => (a.attrs as { kind: string }).kind);
    expect(kinds).toEqual(['note', 'tip']);
  });

  it('works under the commonmark preset', () => {
    const found = parse('> [!NOTE]\n> hi', undefined, 'commonmark')
      .flatMap(walk)
      .filter((n) => n.type.startsWith('Plugin('));
    expect(found).toHaveLength(1);
  });

  describe('falls back to a blockquote', () => {
    it.each([
      ['an unknown kind', '> [!FOO]\n> x'],
      ['text after the marker', '> [!NOTE] text'],
      ['a marker not at the start', '> hello\n> [!NOTE]'],
      ['a marker outside a blockquote', '[!NOTE]\nx'],
      ['a missing bang', '> [NOTE]\n> x'],
      ['a marker in a code span', '> `[!NOTE]`\n> x'],
    ])('for %s', (_name, src) => {
      expect(alerts(src)).toHaveLength(0);
    });

    it('keeps the blockquote for an unknown kind', () => {
      expect(quotes('> [!FOO]\n> x')).toHaveLength(1);
    });
  });

  describe('titles and parse context', () => {
    it('replaces titles per kind', () => {
      const titles = { note: 'Hinweis' };
      const [a] = alerts('> [!NOTE]\n> x', { titles });
      expect(a!.attrs).toEqual({ kind: 'note', title: 'Hinweis' });
      const [b] = alerts('> [!TIP]\n> x', { titles });
      expect(b!.attrs).toEqual({ kind: 'tip', title: 'Tip' });
    });

    it('differs in context for different titles only', () => {
      const context = (titles?: { note: string }) =>
        parseWithMarkdownIt('x', {
          preset: 'gfm',
          plugins: [admonitions({ titles })],
        }).table.context;
      expect(context({ note: 'A' })).not.toBe(context({ note: 'B' }));
      expect(context()).toBe(context());
    });
  });
});

describe('admonitions: streaming', () => {
  const plugins = [admonitions()];
  const view = (src: string) => dumpBlocks(streamView(src, { plugins }));

  it('shows a half-typed marker as a blockquote, then the alert', () => {
    for (const partial of ['> [!', '> [!NO', '> [!NOTE']) {
      const blocks = view(partial).flatMap(walk);
      expect(blocks.some((n) => n.type === 'Blockquote')).toBe(true);
      expect(blocks.some((n) => n.type.startsWith('Plugin('))).toBe(false);
    }
    const done = view('> [!NOTE]').flatMap(walk);
    expect(done.some((n) => n.type.startsWith('Plugin('))).toBe(true);
  });
});

describe('admonitions: render', () => {
  it('renders the title then the body', async () => {
    const tree = await renderTree(
      <Markdown source={'> [!NOTE]\n> hello'} plugins={[admonitions()]} />
    );
    expect(textOf(tree.container)).toBe('Notehello');
  });

  it('uses custom titles', async () => {
    const tree = await renderTree(
      <Markdown
        source={'> [!WARNING]\n> careful'}
        plugins={[admonitions({ titles: { warning: 'Achtung' } })]}
      />
    );
    expect(textOf(tree.container)).toBe('Achtungcareful');
  });

  it('exposes a summary role labelled with the title', async () => {
    await render(
      <Markdown source={'> [!TIP]\n> x'} plugins={[admonitions()]} />
    );
    const box = screen.getByLabelText('Tip');
    expect(box).toHaveProp('accessibilityRole', 'summary');
    // Not `accessible`: that would fold the body into a single screen reader stop.
    expect(box.props.accessible).not.toBe(true);
  });

  it('leaves a plain blockquote without the summary role', async () => {
    await render(<Markdown source={'> plain'} plugins={[admonitions()]} />);
    expect(screen.queryByLabelText(/./)).toBeNull();
  });

  it('themes by kind and falls back to the shared element', async () => {
    await render(
      <Markdown
        source={'> [!NOTE]\n> a\n\n> [!TIP]\n> b'}
        plugins={[admonitions()]}
        // Plugin keys are typed by augmenting `PluginThemeMap`.
        theme={
          {
            Admonition: { marginBottom: 33 },
            AdmonitionTip: { backgroundColor: '#123456' },
          } as unknown as FlatThemeInput
        }
      />
    );
    const note = screen.getByLabelText('Note');
    const tip = screen.getByLabelText('Tip');
    expect(note).toHaveStyle({ marginBottom: 33 });
    expect(tip).toHaveStyle({ marginBottom: 33, backgroundColor: '#123456' });
    expect(note).not.toHaveStyle({ backgroundColor: '#123456' });
  });

  it('titles in the body font, bold by weight for a family name', async () => {
    await render(
      <Markdown
        source={'> [!NOTE]\n> a'}
        plugins={[admonitions()]}
        theme={{ paragraph: { fontFamily: 'Inter' } }}
      />
    );
    const title = screen.getByText('Note');
    expect(title).toHaveStyle({ fontFamily: 'Inter', fontWeight: '700' });
  });

  it('titles in the bold face for a face map', async () => {
    await render(
      <Markdown
        source={'> [!NOTE]\n> a'}
        plugins={[admonitions()]}
        theme={{
          paragraph: {
            fontFamily: { regular: 'Inter-Regular', bold: 'Inter-Bold' },
          },
        }}
      />
    );
    expect(screen.getByText('Note')).toHaveStyle({ fontFamily: 'Inter-Bold' });
  });

  it('uses the dark accent on a dark theme', async () => {
    await render(
      <Markdown
        source={'> [!NOTE]\n> a'}
        plugins={[admonitions()]}
        theme="dark"
      />
    );
    expect(screen.getByLabelText('Note')).toHaveStyle({
      borderLeftColor: '#4493f8',
    });
  });

  it('renders through a custom component with kind and title', async () => {
    await render(
      <Markdown
        source={'> [!IMPORTANT]\n> body'}
        plugins={[admonitions({ titles: { important: 'Wichtig' } })]}
        components={{
          Admonition: ({ kind, title, children }) => (
            <Text>
              {`${kind}/${title}`}
              {children}
            </Text>
          ),
        }}
      />
    );
    expect(screen.getByText(/important\/Wichtig/)).toBeTruthy();
  });
});
