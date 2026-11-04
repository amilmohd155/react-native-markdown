import { parseWithMarkdownIt } from '../markdownItBackend';
import { allowedTags, parseSimpleTag } from '../htmlSubset';
import type { HtmlMode } from '../backend';
import { dumpBlocks, type Dumped } from './dump';

const inline = (src: string, html: HtmlMode = 'safe'): Dumped[] =>
  dumpBlocks(parseWithMarkdownIt(src, { preset: 'commonmark', html }).table)[0]!
    .children ?? [];

const text = (t: string) => ({ type: 'Text', text: t });
const raw = (t: string) => ({ type: 'HtmlInline', text: t });
const hard = { type: 'LineBreak', flags: ['HARD'] };

describe('parseSimpleTag', () => {
  it('parses bare open, close and self-closing tags, case-insensitively', () => {
    expect(parseSimpleTag('<SUP>')).toEqual({
      name: 'sup',
      closing: false,
      selfClosing: false,
    });
    expect(parseSimpleTag('</b>')).toMatchObject({ name: 'b', closing: true });
    expect(parseSimpleTag('<br />')).toMatchObject({
      name: 'br',
      selfClosing: true,
    });
  });

  it('rejects tags with attributes or other content', () => {
    expect(parseSimpleTag('<b class="x">')).toBeNull();
    expect(parseSimpleTag('<!-- c -->')).toBeNull();
    expect(parseSimpleTag('<a href="x">')).toBeNull();
  });
});

describe('allowedTags', () => {
  it('maps each mode to its interpreted tags', () => {
    expect(allowedTags('strip')).toBeNull();
    expect(allowedTags('text')!.size).toBe(0);
    expect(allowedTags('safe')).toEqual(
      new Set([
        'br',
        'b',
        'strong',
        'i',
        'em',
        's',
        'del',
        'u',
        'mark',
        'sup',
        'sub',
        'kbd',
      ])
    );
    expect(allowedTags({ allow: ['SUP', 'span', 'br'] })).toEqual(
      new Set(['sup', 'br'])
    );
  });
});

describe('safe mode (default)', () => {
  it.each([
    ['b', 'Strong'],
    ['strong', 'Strong'],
    ['i', 'Emphasis'],
    ['em', 'Emphasis'],
    ['s', 'Strikethrough'],
    ['del', 'Strikethrough'],
    ['u', 'Underline'],
    ['mark', 'Highlight'],
    ['sup', 'Superscript'],
    ['sub', 'Subscript'],
    ['kbd', 'Kbd'],
  ])('<%s> becomes %s', (tag, type) => {
    expect(inline(`a <${tag}>x</${tag}> b`)).toEqual([
      text('a '),
      { type, children: [text('x')] },
      text(' b'),
    ]);
  });

  it('matches tag names case-insensitively', () => {
    expect(inline('<SUP>2</Sup>')).toEqual([
      { type: 'Superscript', children: [text('2')] },
    ]);
  });

  it('turns every <br> form into a hard break', () => {
    expect(inline('a<br>b<br/>c<br />d')).toEqual([
      text('a'),
      hard,
      text('b'),
      hard,
      text('c'),
      hard,
      text('d'),
    ]);
  });

  it('nests tags inside each other and inside markdown', () => {
    expect(inline('<b><i>x</i></b> **H<sub>2</sub>O**')).toEqual([
      {
        type: 'Strong',
        children: [{ type: 'Emphasis', children: [text('x')] }],
      },
      text(' '),
      {
        type: 'Strong',
        children: [
          text('H'),
          { type: 'Subscript', children: [text('2')] },
          text('O'),
        ],
      },
    ]);
  });

  it('keeps unclosed and unmatched allowed tags as literal text', () => {
    expect(inline('a <sup>x')).toEqual([text('a <sup>x')]);
    expect(inline('a </sup> b')).toEqual([text('a </sup> b')]);
    expect(inline('<b><i>x</b></i>')).toEqual([
      text('<b>'),
      { type: 'Emphasis', children: [text('x</b>')] },
    ]);
  });

  it('never pairs tags across markdown nesting', () => {
    expect(inline('<b>**x</b>**')).toEqual([
      text('<b>'),
      { type: 'Strong', children: [text('x</b>')] },
    ]);
  });

  it('never pairs tags across blocks', () => {
    const blocks = dumpBlocks(
      parseWithMarkdownIt('<b>a\n\nb</b>', { preset: 'commonmark' }).table
    );
    expect(blocks.map((b) => b.children)).toEqual([
      [text('<b>a')],
      [text('b</b>')],
    ]);
  });

  it('keeps other tags and tags with attributes as literal HtmlInline', () => {
    expect(inline('<span>x</span> <b class="c">y</b>')).toEqual([
      raw('<span>'),
      text('x'),
      raw('</span>'),
      text(' '),
      raw('<b class="c">'),
      text('y</b>'),
    ]);
  });

  it('treats self-closing non-void tags as literal text', () => {
    expect(inline('a <b/> c')).toEqual([text('a <b/> c')]);
  });

  it('feeds element text into heading slugs', () => {
    const [heading] = dumpBlocks(
      parseWithMarkdownIt('# H<sub>2</sub>O', { preset: 'commonmark' }).table
    );
    expect((heading!.attrs as { id: string }).id).toBe('h2o');
  });
});

describe('other modes', () => {
  it('text: every tag stays literal', () => {
    expect(inline('<b>x</b><br>', 'text')).toEqual([
      raw('<b>'),
      text('x'),
      raw('</b>'),
      raw('<br>'),
    ]);
  });

  it('strip: tags removed, text between them kept', () => {
    expect(inline('a <b>x</b> <span>y</span> b', 'strip')).toEqual([
      text('a x y b'),
    ]);
  });

  it('{ allow }: only the listed safe tags become elements', () => {
    expect(inline('<sup>1</sup> <b>2</b>', { allow: ['sup'] })).toEqual([
      { type: 'Superscript', children: [text('1')] },
      text(' '),
      raw('<b>'),
      text('2'),
      raw('</b>'),
    ]);
  });
});
