import { isSameBlock, NodeType, type NodeTable } from '../../model';
import type { Preset } from '../../parse';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { dumpBlocks, type Dumped } from '../../parse/__tests__/dump';

const parse = (src: string, preset: Preset = 'gfm') =>
  parseWithMarkdownIt(src, { preset });
const blocks = (src: string, preset?: Preset): Dumped[] =>
  dumpBlocks(parse(src, preset).table);

const text = (t: string): Dumped => ({ type: 'Text', text: t });
const ref = (label: string, index: number, subId = 0): Dumped => ({
  type: 'FootnoteReference',
  attrs: { label, index, subId },
});
const para = (...children: Dumped[]): Dumped => ({
  type: 'Paragraph',
  children,
});

/** `isSameBlock` for each block of `b` against the same index in `a`. */
const same = (a: NodeTable, b: NodeTable): boolean[] =>
  Array.from({ length: b.blockCount }, (_, i) =>
    i < a.blockCount ? isSameBlock(a, i, b, i) : false
  );

describe('footnotes', () => {
  it('maps references, the section and definitions', () => {
    const { table, warnings } = parse(
      'A[^x] b[^y] c[^x].\n\n[^x]: X *def*\n\n[^y]: Y\n'
    );
    expect(warnings).toEqual([]);
    expect(dumpBlocks(table)).toEqual([
      para(
        text('A'),
        ref('x', 1),
        text(' b'),
        ref('y', 2),
        text(' c'),
        ref('x', 1, 1),
        text('.')
      ),
      {
        type: 'FootnoteSection',
        children: [
          {
            type: 'FootnoteDefinition',
            attrs: { label: 'x', index: 1, references: 2 },
            children: [
              para(text('X '), {
                type: 'Emphasis',
                children: [text('def')],
              }),
            ],
          },
          {
            type: 'FootnoteDefinition',
            attrs: { label: 'y', index: 2, references: 1 },
            children: [para(text('Y'))],
          },
        ],
      },
    ]);
  });

  it('numbers by first reference, drops unused definitions, keeps unresolved references as text', () => {
    const doc = blocks(
      'a[^second] b[^first] c[^nope]\n\n[^first]: F\n[^second]: S\n[^unused]: U\n'
    );
    expect(doc[0]).toEqual(
      para(
        text('a'),
        ref('second', 1),
        text(' b'),
        ref('first', 2),
        text(' c[^nope]')
      )
    );
    expect(
      doc[1]!.children!.map((d) => (d.attrs as { label: string }).label)
    ).toEqual(['second', 'first']);
  });

  it('keeps block content inside definitions', () => {
    const [, section] = blocks(
      'x[^n]\n\n[^n]:\n    > quote\n\n        code\n\n    para\n'
    );
    expect(section!.children![0]!.children!.map((c) => c.type)).toEqual([
      'Blockquote',
      'CodeBlock',
      'Paragraph',
    ]);
  });

  it('indexes the section as a block with an empty range at the end (P1-4)', () => {
    const src = 'a[^1]\n\n[^1]: note\n';
    const { table } = parse(src);
    expect(table.blockCount).toBe(2);
    expect(table.type[table.blocks[1]!]).toBe(NodeType.FootnoteSection);
    expect(table.blockStart[1]).toBe(src.length);
    expect(table.blockEnd[1]).toBe(src.length);
  });

  it('has no section without referenced definitions', () => {
    const { table } = parse('a\n\n[^1]: unused\n');
    expect(table.blockCount).toBe(1);
  });

  it('does not parse inline footnotes (not a GitHub feature)', () => {
    expect(blocks('a^[inline note]\n')).toEqual([
      para(text('a^[inline note]')),
    ]);
  });

  it('is plain text without the plugin', () => {
    const preset: Preset = { base: 'gfm', exclude: ['footnotes'] };
    expect(blocks('a[^1]\n\n[^1]: note\n', preset)).toEqual([
      // CommonMark: `[^1]: note` is a link reference definition.
      para(text('a'), {
        type: 'Link',
        attrs: { href: 'note', title: null },
        children: [text('^1')],
      }),
    ]);
    expect(blocks('a[^1]\n', preset)).toEqual([para(text('a[^1]'))]);
  });
});

describe('footnotes and block identity (P1-9)', () => {
  const base = 'x[^a]\n\ny[^b]\n\n[^a]: A\n[^b]: B\n';

  it('an unchanged document keeps every block', () => {
    expect(same(parse(base).table, parse(base).table)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('a renumbered reference changes its block', () => {
    // `y[^b]` has the same text, but [^b] becomes footnote 1.
    const next = 'x\n\ny[^b]\n\n[^a]: A\n[^b]: B\n';
    expect(same(parse(base).table, parse(next).table)).toEqual([
      false, // the text changed
      false, // same text, new number
      false, // the section's definitions changed
    ]);
  });

  it('editing a definition changes only the section', () => {
    const next = 'x[^a]\n\ny[^b]\n\n[^a]: A edited\n[^b]: B\n';
    expect(same(parse(base).table, parse(next).table)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('a new reference to a definition changes the section (one more back-link)', () => {
    const next = 'x[^a]\n\ny[^b] z[^a]\n\n[^a]: A\n[^b]: B\n';
    const result = same(parse(base).table, parse(next).table);
    expect(result[0]).toBe(true);
    expect(result[2]).toBe(false);
  });
});
