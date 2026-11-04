import type { MarkdownIt } from 'markdown-it';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { definePlugin } from '../../plugins/definePlugin';
import { Markdown } from '../Markdown';
import { parse } from '../parse';
import { visit, type VisitInfo } from '../visit';

/** `@name` → self-contained inline `mention` token. */
function mentionSyntax(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'mention', (state, silent) => {
    const match = /^@(\w+)/.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push('mention', 'span', 0);
      token.content = match[1]!;
    }
    state.pos += match[0].length;
    return true;
  });
}

declare module '../../theme/types' {
  interface PluginElementPropsMap {
    VisitMention: { userId: string };
  }
}

const mentions = definePlugin({
  name: 'visit-mentions',
  syntax: { markdownIt: mentionSyntax },
  nodes: {
    VisitMention: {
      kind: 'inline',
      token: 'mention',
      from: (token) => ({ userId: token.content }),
    },
  },
  components: {
    VisitMention: ({ userId }) => createElement('VisitMention', { userId }),
  },
});

describe('visit', () => {
  it('collects a table of contents (spec example)', () => {
    const doc = parse('# One\n\ntext\n\n## Two *em*\n\n### `three`');
    const toc: { level: number; id: string; text: string }[] = [];
    visit(doc, {
      Heading: ({ level, id }, { text }) => toc.push({ level, id, text }),
    });
    expect(toc).toEqual([
      { level: 1, id: 'one', text: 'One' },
      { level: 2, id: 'two-em', text: 'Two em' },
      { level: 3, id: 'three', text: 'three' },
    ]);
  });

  it('visits in pre-order with depth and blockIndex', () => {
    const doc = parse('> **a** b\n\nc');
    const seen: [string, number, number][] = [];
    const record = (name: string) => (_: unknown, info: VisitInfo) => {
      seen.push([name, info.depth, info.blockIndex]);
    };
    visit(doc, {
      Blockquote: record('Blockquote'),
      Paragraph: record('Paragraph'),
      Strong: record('Strong'),
    });
    expect(seen).toEqual([
      ['Blockquote', 0, 0],
      ['Paragraph', 1, 0],
      ['Strong', 2, 0],
      ['Paragraph', 0, 1],
    ]);
  });

  it('passes the props the components get, and freezes them', () => {
    const doc = parse('[x](https://a.b "t")\n\n```ts meta\ncode\n```');
    const props: unknown[] = [];
    visit(doc, {
      Link: (p) => props.push(p),
      CodeBlock: (p) => props.push(p),
    });
    expect(props).toEqual([
      { href: 'https://a.b', title: 't' },
      { code: 'code', language: 'ts', meta: 'meta' },
    ]);
    expect(props.every((p) => Object.isFrozen(p))).toBe(true);
  });

  it('visits lists with depth-aware markers and tasks', () => {
    const doc = parse('- a\n  - b\n\n1. c\n\n- [x] d');
    const items: [string, boolean | null][] = [];
    visit(doc, {
      ListItem: ({ marker, checked }) => items.push([marker, checked]),
    });
    expect(items).toEqual([
      ['•', null],
      ['◦', null],
      ['1.', null],
      ['•', true],
    ]);
  });

  it('visits tables without the structural head and body', () => {
    const doc = parse('| a | b |\n|:-|-:|\n| 1 | 2 |');
    const seen: string[] = [];
    visit(doc, {
      Table: ({ align }) => seen.push(`table:${align.join()}`),
      TableRow: ({ header, index }) => seen.push(`row:${header}:${index}`),
      TableCell: ({ column }, { text }) => seen.push(`cell:${column}:${text}`),
    });
    expect(seen).toEqual([
      'table:left,right',
      'row:true:0',
      'cell:0:a',
      'cell:1:b',
      'row:false:1',
      'cell:0:1',
      'cell:1:2',
    ]);
  });

  it('mirrors the renderer for images', () => {
    const doc = parse('![alt](a.png)\n\ntext ![inline](b.png)');
    const seen: string[] = [];
    visit(doc, {
      Paragraph: (_, { text }) => seen.push(`p:${text}`),
      Image: ({ src }) => seen.push(`image:${src}`),
      InlineImage: ({ src }, { text }) => seen.push(`inline:${src}:${text}`),
    });
    expect(seen).toEqual([
      'image:a.png',
      'p:text inline',
      'inline:b.png:inline',
    ]);
  });

  it('visits footnotes', () => {
    const doc = parse('a[^1]\n\n[^1]: note');
    const seen: string[] = [];
    visit(doc, {
      FootnoteReference: ({ label }) => seen.push(`ref:${label}`),
      FootnoteDefinition: ({ label }, { text }) =>
        seen.push(`def:${label}:${text}`),
    });
    expect(seen).toEqual(['ref:1', 'def:1:note']);
  });

  it('visits plugin nodes', () => {
    const doc = parse('hi @ada and @bob', { plugins: [mentions] });
    const ids: string[] = [];
    visit(doc, { VisitMention: ({ userId }) => ids.push(userId) });
    expect(ids).toEqual(['ada', 'bob']);
  });

  it('computes text lazily and includes hard breaks', () => {
    const doc = parse('a  \nb');
    let text = '';
    visit(doc, { Paragraph: (_, info) => (text = info.text) });
    expect(text).toBe('a\nb');
  });

  it('ignores names the visitor omits and leaves the document usable', () => {
    const doc = parse('# t');
    expect(() => visit(doc, {})).not.toThrow();
    visit(doc, { Heading: () => {} });
    expect(doc.blockCount).toBe(1);
  });

  it('throws for objects parse() did not create', () => {
    expect(() => visit({ blockCount: 1 }, {})).toThrow(TypeError);
  });
});

describe('<Markdown document> with plugins', () => {
  it('renders a document parsed with plugins', () => {
    const document = parse('hi @ada', { plugins: [mentions] });
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<Markdown document={document} plugins={[mentions]} />);
    });
    expect(root.root.findAllByType('VisitMention' as never)).toHaveLength(1);
  });
});
