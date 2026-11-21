import { NodeType, type NodeTable } from '../../model';
import { parseWithMarkdownIt, type ParseOptions } from '../../parse';
import { definePlugin } from '../../plugins/definePlugin';
import { emoji } from '../../emoji';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import { createMarkdownStreamCoreWith } from '../createMarkdownStream';

const html = (table: NodeTable) => documentToHtml(table);

/** A plugin that only replaces an element: it owns no syntax (P3-32). */
const componentsOnly = definePlugin({
  name: 'components-only',
  components: { CodeBlock: () => null },
});

const SENTINEL = 'zzsentinelzz';

/**
 * Independent oracle for `openFenceBlock`: the tail block is an open fence
 * iff text appended after a blank line still lands inside a top-level
 * CodeBlock (a closed fence, list, quote or indented code would end).
 */
function oracleOpen(
  source: string,
  options?: ParseOptions
): number | undefined {
  if (source.length === 0) return undefined;
  const probe = source + '\n\n' + SENTINEL;
  const t = parseWithMarkdownIt(probe, options).table;
  let last = t.blockCount - 1;
  if (last >= 0 && t.type[t.blocks[last]!] === NodeType.FootnoteSection) {
    last--;
  }
  if (last < 0 || t.type[t.blocks[last]!] !== NodeType.CodeBlock) {
    return undefined;
  }
  // The fence must have started inside `source`, not be the sentinel itself.
  if (t.blockStart[last]! >= source.length) return undefined;
  const block = probe.slice(t.blockStart[last]!, t.blockEnd[last]!);
  if (!block.includes(SENTINEL)) return undefined;
  if (!/^ {0,3}(`{3,}|~{3,})/.test(block)) return undefined;
  return last;
}

describe('fast-path gate (P3-32)', () => {
  it('a components-only plugin keeps the open-fence fast path', () => {
    const options = { plugins: [componentsOnly] };
    const core = createMarkdownStreamCoreWith(options);
    core.append('intro\n\n```ts\nlet a = 1;\n');
    core.append('let b = 2;\n');
    expect(core.lastFlush.path).toBe('fence-fast-path');
    core.append('let c');
    expect(core.lastFlush.path).toBe('fence-fast-path');
    core.append('\n```\nafter\n');
    const done = core.done();
    expect(html(done)).toBe(
      html(parseWithMarkdownIt(core.source, options).table)
    );
  });

  it('a syntax plugin still falls back to the tail re-parse', () => {
    const plugin = emoji();
    expect(plugin.syntax).toBeDefined();
    const options = { plugins: [plugin] };
    const core = createMarkdownStreamCoreWith(options);
    core.append('```ts\nlet a = 1;\n');
    core.append('let b = 2;\n');
    expect(core.lastFlush.path).toBe('tail');
    expect(html(core.done())).toBe(
      html(parseWithMarkdownIt(core.source, options).table)
    );
  });

  it('no plugins: unchanged', () => {
    const core = createMarkdownStreamCoreWith();
    core.append('```ts\nlet a = 1;\n');
    core.append('let b = 2;\n');
    expect(core.lastFlush.path).toBe('fence-fast-path');
    const empty = createMarkdownStreamCoreWith({ plugins: [] });
    empty.append('```ts\nlet a = 1;\n');
    empty.append('let b = 2;\n');
    expect(empty.lastFlush.path).toBe('fence-fast-path');
  });
});

describe('openFenceBlock (P3-33)', () => {
  const variants: [string, ParseOptions | undefined][] = [
    ['no plugin', undefined],
    ['syntax plugin', { plugins: [emoji()] }],
    ['components-only plugin', { plugins: [componentsOnly] }],
  ];

  it.each(variants)('%s: open while unclosed, not after the closer', (_, o) => {
    const core = createMarkdownStreamCoreWith(o);
    core.append('intro\n\n```ts\nlet a');
    expect(core.table.openFenceBlock).toBe(1);
    core.append(' = 1;\n');
    expect(core.table.openFenceBlock).toBe(1);
    core.append('let b = 2;\n');
    expect(core.table.openFenceBlock).toBe(1);
    core.append('```\n');
    expect(core.table.openFenceBlock).toBeUndefined();
    core.append('more');
    expect(core.table.openFenceBlock).toBeUndefined();
  });

  it.each(variants)('%s: not open after done()', (_, o) => {
    const core = createMarkdownStreamCoreWith(o);
    core.append('```ts\nlet a = 1;\n');
    core.append('let b');
    expect(core.table.openFenceBlock).toBe(0);
    expect(core.done().openFenceBlock).toBeUndefined();
    expect(core.table.openFenceBlock).toBeUndefined();
  });

  it('a closed fence earlier in the stream is not open', () => {
    const core = createMarkdownStreamCoreWith();
    core.append('```\na\n```\n\nsome text');
    expect(core.table.openFenceBlock).toBeUndefined();
    core.append('\n\n~~~\nb\n');
    expect(core.table.openFenceBlock).toBe(2);
  });

  it('is never set on a static parse', () => {
    expect(
      parseWithMarkdownIt('```ts\nnever closed\n').table.openFenceBlock
    ).toBeUndefined();
  });

  it('with smoothing, the view carries it', () => {
    const core = createMarkdownStreamCoreWith({ smoothing: 'hide-incomplete' });
    core.append('para **ita\n```\nx');
    expect(core.table.openFenceBlock).toBe(1);
    core.append('\n```\nnow **bo');
    // A re-parsed view (the dangling `**` hidden) with a closed fence.
    expect(html(core.table)).not.toContain('**bo');
    expect(core.table.openFenceBlock).toBeUndefined();
    expect(core.done().openFenceBlock).toBeUndefined();
  });

  it('matches the oracle on every prefix, with and without plugins', () => {
    const docs = [
      '```\na\nb\n```\nafter\n',
      '```js\nx\n\ny\n',
      '~~~\n```\nstill code\n~~~~\nout\n',
      '````\n```\ninner\n```\n````\n',
      '```\nnever closed\n   \n  ```\n  \n',
      '```\n\n  \nx  \n   ``` \nnot a close?\n',
      '- ```\n  in a list\n  ```\n',
      '> ```\n> in a quote\n',
      '   ```\n   indented\n   body\n```\n',
      '    indented code\n',
      '```\nabc\n``` trailing\nmore\n```\n',
      'text[^1]\n\n[^1]: note\n\n```\ncode\n',
      '```\r\nwindows\r\n```\r\nafter\r\n',
    ];
    for (const [, o] of variants) {
      for (const doc of docs) {
        for (const size of [1, 3, 7]) {
          const core = createMarkdownStreamCoreWith(o);
          for (let i = 0; i < doc.length; i += size) {
            core.append(doc.slice(i, i + size));
            expect([core.source, core.table.openFenceBlock]).toEqual([
              core.source,
              oracleOpen(core.source, o),
            ]);
          }
          expect(core.done().openFenceBlock).toBeUndefined();
        }
      }
    }
  });
});
