import type { Token } from 'markdown-it';
import { getMarkdownIt } from '../../parse/markdownIt';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';

const inline = (src: string): Dumped[] =>
  dumpBlocks(parseWithMarkdownIt(src, { preset: 'gfm' }).table)[0]!.children ??
  [];

const text = (t: string): Dumped => ({ type: 'Text', text: t });
const del = (...children: Dumped[]): Dumped => ({
  type: 'Strikethrough',
  children,
});

describe('strikethrough (GFM)', () => {
  it('accepts runs of one or two tildes', () => {
    expect(inline('~one~ ~~two~~\n')).toEqual([
      del(text('one')),
      text(' '),
      del(text('two')),
    ]);
  });

  it('keeps runs of three or more as text', () => {
    // (A line starting with ~~~ would be a code fence.)
    expect(inline('x ~~~three~~~ ~~~~~five~~~~~\n')).toEqual([
      text('x ~~~three~~~ ~~~~~five~~~~~'),
    ]);
  });

  it('pairs only runs of the same length', () => {
    expect(inline('No ~mismatch~~\n')).toEqual([text('No ~mismatch~~')]);
    expect(inline('~~a ~b~~ c~\n')).toEqual([text('~~a '), del(text('b~~ c'))]);
  });

  it('needs flanking runs', () => {
    expect(inline("This ~is ~ legit~ isn't ~ legit.\n")).toEqual([
      text('This '),
      del(text('is ~ legit')),
      text(" isn't ~ legit."),
    ]);
    expect(inline('a ~ b ~ c\n')).toEqual([text('a ~ b ~ c')]);
  });

  it('does not span paragraphs', () => {
    const blocks = dumpBlocks(
      parseWithMarkdownIt('This ~~has a\n\nnew paragraph~~.\n').table
    );
    expect(blocks.map((b) => b.children)).toEqual([
      [text('This ~~has a')],
      [text('new paragraph~~.')],
    ]);
  });

  it('nests with emphasis and links', () => {
    expect(inline('~~a *b* [c ~d~](u)~~\n')).toEqual([
      del(text('a '), { type: 'Emphasis', children: [text('b')] }, text(' '), {
        type: 'Link',
        attrs: { href: 'u', title: null },
        children: [text('c '), del(text('d'))],
      }),
    ]);
  });

  it('does not pair across a link boundary', () => {
    expect(inline('~a [b~](u)\n')).toEqual([
      text('~a '),
      {
        type: 'Link',
        attrs: { href: 'u', title: null },
        children: [text('b~')],
      },
    ]);
  });

  it('keeps the run as markup on the tokens', () => {
    const children: Token[] = getMarkdownIt('gfm').parseInline(
      '~a~ ~~b~~',
      {}
    )[0]!.children!;
    expect(
      children.filter((t) => t.type === 's_open').map((t) => t.markup)
    ).toEqual(['~', '~~']);
  });

  it('stays linear on many unmatched delimiters', () => {
    const src = '~a '.repeat(50000) + '~~b~~\n';
    const start = Date.now();
    const children = inline(src);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(children.at(-1)).toEqual(del(text('b')));
  });
});
