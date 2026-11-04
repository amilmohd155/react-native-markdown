import { NodeType } from '../../model';
import { convertTokens } from '../convert';
import { getMarkdownIt } from '../markdownIt';
import { parseWithMarkdownIt } from '../markdownItBackend';
import { dumpBlocks } from './dump';
import type { HtmlMode, Preset } from '../backend';

const blocks = (src: string, preset: Preset = 'commonmark', html?: HtmlMode) =>
  dumpBlocks(parseWithMarkdownIt(src, { preset, html }).table);

const text = (t: string) => ({ type: 'Text', text: t });

describe('headings', () => {
  it('maps ATX and setext headings with level and slug', () => {
    expect(blocks('# One\n\nTwo\n---\n### Three ###\n')).toEqual([
      {
        type: 'Heading',
        attrs: { level: 1, id: 'one' },
        children: [text('One')],
      },
      {
        type: 'Heading',
        attrs: { level: 2, id: 'two' },
        children: [text('Two')],
      },
      {
        type: 'Heading',
        attrs: { level: 3, id: 'three' },
        children: [text('Three')],
      },
    ]);
  });

  it('builds GitHub-style slugs, de-duplicated in document order', () => {
    const ids = blocks(
      '# Hello, World!\n# Hello World\n# hello world\n# Ünïcode é_x\n#\n'
    ).map((b) => (b.attrs as { id: string }).id);
    expect(ids).toEqual([
      'hello-world',
      'hello-world-1',
      'hello-world-2',
      'ünïcode-é_x',
      '',
    ]);
  });
});

describe('paragraphs and blockquotes', () => {
  it('nests blockquotes and paragraphs', () => {
    expect(blocks('para\n\n> quote\n>\n> > deeper\n')).toEqual([
      { type: 'Paragraph', children: [text('para')] },
      {
        type: 'Blockquote',
        children: [
          { type: 'Paragraph', children: [text('quote')] },
          {
            type: 'Blockquote',
            children: [{ type: 'Paragraph', children: [text('deeper')] }],
          },
        ],
      },
    ]);
  });
});

describe('lists', () => {
  it('marks tight lists and indexes items', () => {
    expect(blocks('- a\n- b\n')).toEqual([
      {
        type: 'List',
        flags: ['TIGHT'],
        attrs: { start: 1, marker: '-' },
        children: [
          {
            type: 'ListItem',
            attrs: { index: 0 },
            children: [{ type: 'Paragraph', children: [text('a')] }],
          },
          {
            type: 'ListItem',
            attrs: { index: 1 },
            children: [{ type: 'Paragraph', children: [text('b')] }],
          },
        ],
      },
    ]);
  });

  it('leaves loose lists untight', () => {
    const [list] = blocks('* a\n\n* b\n');
    expect(list).toMatchObject({ type: 'List', attrs: { marker: '*' } });
    expect(list!.flags).toBeUndefined();
  });

  it('maps ordered lists with start, delimiter and ORDERED items', () => {
    const [list] = blocks('3) a\n4) b\n');
    expect(list).toMatchObject({
      type: 'List',
      flags: ['ORDERED', 'TIGHT'],
      attrs: { start: 3, marker: ')' },
    });
    expect(list!.children!.map((i) => i.flags)).toEqual([
      ['ORDERED'],
      ['ORDERED'],
    ]);
  });

  it('marks tightness on the nearest list only', () => {
    const [outer] = blocks('- a\n\n- b\n  1. x\n  2. y\n');
    expect(outer!.flags).toBeUndefined();
    const inner = outer!.children![1]!.children![1]!;
    expect(inner).toMatchObject({
      type: 'List',
      flags: ['ORDERED', 'TIGHT'],
      attrs: { start: 1, marker: '.' },
    });
  });
});

describe('code, dividers and HTML', () => {
  it('maps fenced code with decoded info string split into language and meta', () => {
    expect(blocks('```js&amp;x  title="a b"\ncode\n```\n')).toEqual([
      {
        type: 'CodeBlock',
        text: 'code\n',
        attrs: { language: 'js&x', meta: 'title="a b"' },
      },
    ]);
  });

  it('maps fences without info and indented code to null language', () => {
    expect(blocks('```\nx\n```\n\n    indented\n')).toEqual([
      { type: 'CodeBlock', text: 'x\n', attrs: { language: null, meta: null } },
      {
        type: 'CodeBlock',
        text: 'indented\n',
        attrs: { language: null, meta: null },
      },
    ]);
  });

  it('maps thematic breaks', () => {
    expect(blocks('***\n')).toEqual([{ type: 'Divider' }]);
  });

  it('keeps block HTML as text, or drops it in strip mode', () => {
    const src = '<div>\nhi\n</div>\n\npara\n';
    expect(blocks(src)[0]).toEqual({
      type: 'HtmlBlock',
      text: '<div>\nhi\n</div>\n',
    });
    expect(blocks(src, 'commonmark', 'text')[0]!.type).toBe('HtmlBlock');
    expect(blocks(src, 'commonmark', 'strip')).toEqual([
      { type: 'Paragraph', children: [text('para')] },
    ]);
  });
});

describe('tables (gfm)', () => {
  it('maps head/body, row indexes, columns, header flags and alignment', () => {
    const [table] = blocks(
      '| a | b | c |\n|:--|:-:|---|\n| 1 | 2 | 3 |\n',
      'gfm'
    );
    expect(table).toMatchObject({
      type: 'Table',
      attrs: { align: ['left', 'center', null] },
    });
    const [head, body] = table!.children!;
    const headRow = head!.children![0]!;
    const bodyRow = body!.children![0]!;
    expect(head!.type).toBe('TableHead');
    expect(headRow).toMatchObject({
      type: 'TableRow',
      flags: ['HEADER'],
      attrs: { index: 0 },
    });
    expect(headRow.children![1]).toEqual({
      type: 'TableCell',
      flags: ['HEADER'],
      attrs: { align: 'center', column: 1 },
      children: [text('b')],
    });
    expect(bodyRow).toMatchObject({ type: 'TableRow', attrs: { index: 1 } });
    expect(bodyRow.flags).toBeUndefined();
    expect(bodyRow.children![2]).toEqual({
      type: 'TableCell',
      attrs: { align: null, column: 2 },
      children: [text('3')],
    });
  });

  it('is not parsed by the commonmark preset', () => {
    expect(blocks('| a |\n|---|\n| 1 |\n')[0]!.type).toBe('Paragraph');
  });
});

describe('block index', () => {
  it('indexes each top-level block with its source range', () => {
    const src = '# T\n\npara\n\n- a\n- b\n\n```\nc\n```\n';
    const { table } = parseWithMarkdownIt(src, { preset: 'commonmark' });
    expect(table.blockCount).toBe(4);
    const slices = Array.from(table.blocks, (_, i) =>
      src.slice(table.blockStart[i], table.blockEnd[i])
    );
    // markdown-it's list range includes the blank line after the list.
    expect(slices).toEqual([
      '# T\n',
      'para\n',
      '- a\n- b\n\n',
      '```\nc\n```\n',
    ]);
    expect(Array.from(table.blocks, (id) => table.type[id])).toEqual([
      NodeType.Heading,
      NodeType.Paragraph,
      NodeType.List,
      NodeType.CodeBlock,
    ]);
  });

  it('does not index nested blocks', () => {
    const { table } = parseWithMarkdownIt('> a\n>\n> b\n', {
      preset: 'commonmark',
    });
    expect(table.blockCount).toBe(1);
  });
});

describe('unknown tokens', () => {
  const md = getMarkdownIt('commonmark');
  const Token = md.parse('x', {})[0]!.constructor as new (
    type: string,
    tag: string,
    nesting: -1 | 0 | 1
  ) => import('markdown-it').Token;

  const make = (
    type: string,
    nesting: -1 | 0 | 1,
    level: number,
    extra: Partial<{ content: string; map: [number, number] }> = {}
  ) => {
    const t = new Token(type, 'div', nesting);
    t.level = level;
    t.content = extra.content ?? '';
    t.map = extra.map ?? null;
    return t;
  };

  it('drops unknown wrappers but keeps and indexes their children', () => {
    const tokens = [
      make('note_open', 1, 0, { map: [0, 2] }),
      ...md.parse('inside\n', {}).map((t) => {
        t.level += 1;
        return t;
      }),
      make('note_close', -1, 0),
    ];
    const { table, warnings } = convertTokens(md, tokens, 'inside\n', {
      html: 'safe',
    });
    expect(dumpBlocks(table)).toEqual([
      { type: 'Paragraph', children: [text('inside')] },
    ]);
    expect(table.blockCount).toBe(1);
    expect(warnings).toEqual([expect.stringContaining('"note"')]);
  });

  it('keeps unknown leaf content as a paragraph and warns once per type', () => {
    const tokens = [
      make('math_block', 0, 0, { content: 'x^2', map: [0, 1] }),
      make('math_block', 0, 0, { content: 'y^2', map: [1, 2] }),
    ];
    const { table, warnings } = convertTokens(md, tokens, 'x^2\ny^2\n', {
      html: 'safe',
    });
    expect(dumpBlocks(table)).toEqual([
      { type: 'Paragraph', children: [text('x^2')] },
      { type: 'Paragraph', children: [text('y^2')] },
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe('deep nesting', () => {
  it('converts 10,000 nested blockquotes without overflowing the stack', () => {
    const { table } = parseWithMarkdownIt('> '.repeat(10000) + 'a', {
      preset: 'commonmark',
    });
    expect(table.count).toBeGreaterThan(100);
    expect(table.blockCount).toBe(1);
  });

  it('converts 1,000 nested list levels', () => {
    const src = Array.from(
      { length: 1000 },
      (_, i) => '  '.repeat(i) + '- a\n'
    ).join('');
    const { table } = parseWithMarkdownIt(src, { preset: 'commonmark' });
    expect(table.blockCount).toBe(1);
  });
});
