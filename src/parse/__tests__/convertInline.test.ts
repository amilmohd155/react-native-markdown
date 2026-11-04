import { parseWithMarkdownIt } from '../markdownItBackend';
import type { Preset } from '../backend';
import { dumpBlocks, type Dumped } from './dump';

/** Inline children of the first block. */
const inline = (src: string, preset: Preset = 'commonmark'): Dumped[] =>
  dumpBlocks(parseWithMarkdownIt(src, { preset }).table)[0]!.children ?? [];

const text = (t: string) => ({ type: 'Text', text: t });

describe('text runs', () => {
  it('merges text, entities and escapes into one node', () => {
    expect(inline('a \\* &amp; b')).toEqual([text('a * & b')]);
  });

  it('merges soft breaks into the run as newlines', () => {
    expect(inline('one\ntwo\nthree')).toEqual([text('one\ntwo\nthree')]);
  });

  it('maps hard breaks (two spaces or backslash) to LineBreak', () => {
    const hard = { type: 'LineBreak', flags: ['HARD'] };
    expect(inline('x  \ny')).toEqual([text('x'), hard, text('y')]);
    expect(inline('x\\\ny')).toEqual([text('x'), hard, text('y')]);
  });
});

describe('emphasis and code', () => {
  it('nests strong and emphasis', () => {
    expect(inline('a **b *c* d** e')).toEqual([
      text('a '),
      {
        type: 'Strong',
        children: [
          text('b '),
          { type: 'Emphasis', children: [text('c')] },
          text(' d'),
        ],
      },
      text(' e'),
    ]);
  });

  it('maps code spans with their content', () => {
    expect(inline('use `x < y` here')).toEqual([
      text('use '),
      { type: 'InlineCode', text: 'x < y' },
      text(' here'),
    ]);
  });

  it('maps strikethrough in the gfm preset only', () => {
    expect(inline('~~gone~~', 'gfm')).toEqual([
      { type: 'Strikethrough', children: [text('gone')] },
    ]);
    expect(inline('~~gone~~')).toEqual([text('~~gone~~')]);
  });
});

describe('links and images', () => {
  it('maps links with href and title', () => {
    expect(inline('[t](/u "T") [n](/v)')).toEqual([
      {
        type: 'Link',
        attrs: { href: '/u', title: 'T' },
        children: [text('t')],
      },
      text(' '),
      {
        type: 'Link',
        attrs: { href: '/v', title: null },
        children: [text('n')],
      },
    ]);
  });

  it('flags <…> autolinks', () => {
    expect(inline('<https://a.b>')).toEqual([
      {
        type: 'Link',
        flags: ['AUTOLINK'],
        attrs: { href: 'https://a.b', title: null },
        children: [text('https://a.b')],
      },
    ]);
  });

  it('resolves reference links through markdown-it', () => {
    expect(inline('[x][ref]\n\n[ref]: /target "T"')).toEqual([
      {
        type: 'Link',
        attrs: { href: '/target', title: 'T' },
        children: [text('x')],
      },
    ]);
  });

  it('leaves unresolved references as literal text', () => {
    expect(inline('[x][missing]')).toEqual([text('[x][missing]')]);
  });

  it('builds image alt text from its inline content', () => {
    expect(inline('![*a* `b` c](/i.png "T")')).toEqual([
      { type: 'Image', attrs: { src: '/i.png', alt: 'a b c', title: 'T' } },
    ]);
  });

  it('nests an image inside a link', () => {
    expect(inline('[![i](s)](l)')).toEqual([
      {
        type: 'Link',
        attrs: { href: 'l', title: null },
        children: [
          { type: 'Image', attrs: { src: 's', alt: 'i', title: null } },
        ],
      },
    ]);
  });
});

describe('raw HTML (interim, until the safe subset in task 7)', () => {
  it('keeps inline HTML tags as HtmlInline nodes', () => {
    expect(inline('a <span>x</span>')).toEqual([
      text('a '),
      { type: 'HtmlInline', text: '<span>' },
      text('x'),
      { type: 'HtmlInline', text: '</span>' },
    ]);
  });
});

describe('heading slugs from inline text', () => {
  const id = (src: string) =>
    (
      dumpBlocks(parseWithMarkdownIt(src, { preset: 'commonmark' }).table)[0]!
        .attrs as { id: string }
    ).id;

  it('uses the rendered text, not the markdown syntax', () => {
    expect(id('# Hello *World*')).toBe('hello-world');
    expect(id('# `useMemo` hook')).toBe('usememo-hook');
    expect(id('# [Link](/x) text')).toBe('link-text');
  });
});

describe('inline content in other blocks', () => {
  it('converts inline content of table cells', () => {
    const [table] = dumpBlocks(
      parseWithMarkdownIt('| **a** |\n|---|\n| `b` |\n', { preset: 'gfm' })
        .table
    );
    const headCell = table!.children![0]!.children![0]!.children![0]!;
    const bodyCell = table!.children![1]!.children![0]!.children![0]!;
    expect(headCell.children).toEqual([
      { type: 'Strong', children: [text('a')] },
    ]);
    expect(bodyCell.children).toEqual([{ type: 'InlineCode', text: 'b' }]);
  });
});
