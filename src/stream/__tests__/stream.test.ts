import { parseWithMarkdownIt } from '../../parse';
import { documentToHtml } from '../../../test/utils/documentToHtml';
import {
  createMarkdownStream,
  createMarkdownStreamCore,
  createMarkdownStreamCoreWith,
} from '../createMarkdownStream';

const paragraphDoc = (blocks: number): string =>
  Array.from(
    { length: blocks },
    (_, i) => `Paragraph ${i} with *some* **inline** text and a [link](/u${i}).`
  ).join('\n\n') + '\n\n';

function feed(
  core: ReturnType<typeof createMarkdownStreamCore>,
  text: string,
  size: number
): number[] {
  const work: number[] = [];
  for (let i = 0; i < text.length; i += size) {
    core.append(text.slice(i, i + size));
    work.push(core.lastFlush.charsReparsed);
  }
  return work;
}

const html = (table: Parameters<typeof documentToHtml>[0]) =>
  documentToHtml(table);

describe('createMarkdownStreamCore', () => {
  it('exports the alias', () => {
    expect(createMarkdownStream).toBe(createMarkdownStreamCore);
  });

  it('starts empty and ignores empty chunks', () => {
    const core = createMarkdownStreamCore();
    expect(core.source).toBe('');
    expect(core.table.blockCount).toBe(0);
    const before = core.table;
    expect(core.append('')).toBe(before);
    expect(core.lastFlush).toEqual({
      charsReparsed: 0,
      fullReparse: false,
      path: 'tail',
    });
  });

  it('re-parses a constant amount per append, whatever the document size', () => {
    const tailWork = (blocks: number) => {
      const core = createMarkdownStreamCore();
      const doc = paragraphDoc(blocks);
      const work = feed(core, doc, 20);
      expect(html(core.table)).toBe(html(parseWithMarkdownIt(doc).table));
      // Ignore the first appends (nothing to skip yet).
      return work.slice(Math.floor(work.length / 2));
    };
    const small = tailWork(100);
    const large = tailWork(900);
    const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // One paragraph is ~65 chars; the open block plus a chunk is well under 200.
    expect(max(large)).toBeLessThan(200);
    expect(max(large)).toBeLessThanOrEqual(max(small) + 4); // wider indexes
    expect(mean(large)).toBeLessThan(mean(small) * 1.25);
  });

  it('never reports a full re-parse for plain appends', () => {
    const core = createMarkdownStreamCore();
    const doc = paragraphDoc(50);
    for (let i = 0; i < doc.length; i += 7) {
      core.append(doc.slice(i, i + 7));
      expect(core.lastFlush.fullReparse).toBe(false);
      expect(core.lastFlush.path).toBe('tail');
    }
  });

  it('keeps the prefix identity between appends and shares closed blocks', () => {
    const core = createMarkdownStreamCore();
    core.append(paragraphDoc(5));
    const a = core.table;
    core.append('Next paragraph');
    const b = core.table;
    expect(b.prefixId).toBe(a.prefixId);
    expect(b.stableCount).toBeGreaterThan(0);
    expect(b.blockCount).toBe(a.blockCount + 1);
  });

  it('done() equals a full parse and starts a new prefix', () => {
    const core = createMarkdownStreamCore();
    const doc = paragraphDoc(20) + '- a\n- b\n\n```js\nlet x';
    feed(core, doc, 13);
    const before = core.table;
    const done = core.done();
    expect(core.lastFlush).toMatchObject({ fullReparse: true, path: 'full' });
    expect(html(done)).toBe(html(parseWithMarkdownIt(doc).table));
    expect(done.prefixId).not.toBe(before.prefixId);
    expect(core.table).toBe(done);
  });

  it('reset() starts a new stream, optionally with a source', () => {
    const core = createMarkdownStreamCore();
    feed(core, paragraphDoc(10), 17);
    const old = core.table;
    const fresh = core.reset();
    expect(core.source).toBe('');
    expect(fresh.blockCount).toBe(0);
    expect(fresh.prefixId).not.toBe(old.prefixId);

    const seeded = core.reset('# Title\n\nbody');
    expect(core.source).toBe('# Title\n\nbody');
    expect(html(seeded)).toBe(
      html(parseWithMarkdownIt('# Title\n\nbody').table)
    );
    expect(core.lastFlush.fullReparse).toBe(true);

    core.append(' more');
    expect(core.lastFlush.fullReparse).toBe(false);
    expect(html(core.table)).toBe(
      html(parseWithMarkdownIt('# Title\n\nbody more').table)
    );
  });

  it('uses the parse options for the life of the stream', () => {
    const doc =
      'Hi <b>x</b> and ~~gone~~ and https://example.com\n\n| a |\n| - |\n| 1 |\n';
    for (const options of [
      { html: 'strip' as const },
      { preset: 'commonmark' as const },
      { html: 'text' as const, preset: 'gfm' as const },
    ]) {
      const core = createMarkdownStreamCore(options);
      feed(core, doc, 3);
      core.done();
      expect(html(core.table)).toBe(
        html(parseWithMarkdownIt(doc, options).table)
      );
    }
  });

  it('re-parses everything when a reference definition arrives', () => {
    const core = createMarkdownStreamCore();
    core.append('See [x] here.\n\nmore text\n\n');
    expect(html(core.table)).toContain('[x]');
    core.append('[x]: /url\n');
    expect(core.lastFlush.fullReparse).toBe(true);
    expect(html(core.table)).toContain('href="/url"');
  });

  it('survives a chunk that splits \\r\\n and a surrogate pair', () => {
    const doc = 'a\r\nb\r\n\r\nemoji \u{1F600} end\r\n';
    const cut = doc.indexOf('\r') + 1;
    const pair = doc.indexOf('\u{1F600}') + 1;
    for (const at of [cut, pair]) {
      const core = createMarkdownStreamCore();
      core.append(doc.slice(0, at));
      core.append(doc.slice(at));
      expect(html(core.table)).toBe(html(parseWithMarkdownIt(doc).table));
    }
  });
});

describe('open fence fast path', () => {
  const codeDoc =
    'intro\n\n```ts title="x"\n' +
    Array.from({ length: 200 }, (_, i) => `const v${i} = ${i};`).join('\n') +
    '\n';

  it('appends without parsing while a fence is open', () => {
    const core = createMarkdownStreamCore();
    core.append('intro\n\n```ts\nlet a = 1;\n');
    expect(core.lastFlush.path).toBe('tail');
    core.append('let b = 2;\n');
    expect(core.lastFlush).toEqual({
      charsReparsed: 11,
      fullReparse: false,
      path: 'fence-fast-path',
    });
    core.append('let c');
    expect(core.lastFlush.path).toBe('fence-fast-path');
    expect(html(core.table)).toBe(html(parseWithMarkdownIt(core.source).table));
  });

  it('does per-append work bounded by the chunk, not the block', () => {
    const core = createMarkdownStreamCore();
    core.append(codeDoc.slice(0, 40));
    const work = feed(core, codeDoc.slice(40), 9);
    expect(Math.max(...work)).toBeLessThanOrEqual(9);
    expect(html(core.table)).toBe(html(parseWithMarkdownIt(codeDoc).table));
  });

  it('falls back when a chunk could close the fence', () => {
    const core = createMarkdownStreamCore();
    core.append('```\nabc\n');
    core.append('``');
    expect(core.lastFlush.path).toBe('fence-fast-path');
    core.append('`\nafter');
    expect(core.lastFlush.path).toBe('tail');
    expect(html(core.table)).toBe(html(parseWithMarkdownIt(core.source).table));
  });

  it('is off when disabled', () => {
    const core = createMarkdownStreamCoreWith(undefined, {
      fenceFastPath: false,
    });
    core.append('```\nabc\n');
    core.append('def\n');
    expect(core.lastFlush.path).toBe('tail');
  });

  it('matches a full parse with and without the fast path', () => {
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
      '```\nabc\n``` trailing\nmore\n```\n',
      codeDoc + '```\n\nparagraph\n',
    ];
    for (const doc of docs) {
      for (const size of [1, 2, 3, 5, 11]) {
        const on = createMarkdownStreamCoreWith();
        const off = createMarkdownStreamCoreWith(undefined, {
          fenceFastPath: false,
        });
        for (let i = 0; i < doc.length; i += size) {
          const chunk = doc.slice(i, i + size);
          on.append(chunk);
          off.append(chunk);
          const expected = html(parseWithMarkdownIt(on.source).table);
          expect(html(on.table)).toBe(expected);
          expect(html(off.table)).toBe(expected);
        }
      }
    }
  });
});
