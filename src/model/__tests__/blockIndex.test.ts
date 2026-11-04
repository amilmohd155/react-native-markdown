import { getMarkdownIt } from '../../parse/markdownIt';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import type { ParseOptions } from '../../parse';
import {
  BlockIndexBuilder,
  blockKey,
  computeLineOffsets,
  isSameBlock,
  lineToOffset,
} from '../blockIndex';

const offsets = (s: string) => Array.from(computeLineOffsets(s));

describe('computeLineOffsets', () => {
  it('handles LF, CRLF and CR, plus a final sentinel', () => {
    expect(offsets('a\nb')).toEqual([0, 2, 3]);
    expect(offsets('a\r\nb')).toEqual([0, 3, 4]);
    expect(offsets('a\rb')).toEqual([0, 2, 3]);
    expect(offsets('a\r\n\r\nb')).toEqual([0, 3, 5, 6]);
    expect(offsets('a\nb\rc\r\nd')).toEqual([0, 2, 4, 7, 8]);
  });

  it('handles empty input and a trailing newline', () => {
    expect(offsets('')).toEqual([0, 0]);
    expect(offsets('a\n')).toEqual([0, 2, 2]);
    expect(offsets('\n\n')).toEqual([0, 1, 2, 2]);
  });

  it('clamps lines past the end to source length', () => {
    const lines = computeLineOffsets('a\nb');
    expect(lineToOffset(lines, 1)).toBe(2);
    expect(lineToOffset(lines, 99)).toBe(3);
  });
});

describe('BlockIndexBuilder', () => {
  /** Top-level blocks of `source` via markdown-it, as source slices. */
  function topLevelSlices(source: string) {
    const lines = computeLineOffsets(source);
    const builder = new BlockIndexBuilder(source, lines);
    let node = 1;
    for (const token of getMarkdownIt('commonmark').parse(source, {})) {
      if (token.level === 0 && token.nesting !== -1 && token.map) {
        builder.addLines(node++, token.map[0], token.map[1]);
      }
    }
    const index = builder.finish();
    return Array.from(index.blocks, (_, i) =>
      source.slice(index.blockStart[i], index.blockEnd[i])
    );
  }

  it('maps markdown-it line ranges to source slices', () => {
    expect(
      topLevelSlices('# Title\n\nPara one\nline two\n\n- a\n- b\n')
    ).toEqual(['# Title\n', 'Para one\nline two\n', '- a\n- b\n']);
  });

  it('keeps offsets in the original source when it uses CRLF', () => {
    expect(topLevelSlices('# Title\r\n\r\nPara\r\nline\r\n')).toEqual([
      '# Title\r\n',
      'Para\r\nline\r\n',
    ]);
  });

  it('handles a last block without a trailing newline', () => {
    expect(topLevelSlices('one\n\ntwo')).toEqual(['one\n', 'two']);
  });

  it('keeps block contexts, appended to the current block', () => {
    const builder = new BlockIndexBuilder('a\n\nb\n');
    builder.appendContext('ignored: no block yet');
    builder.addLines(1, 0, 1);
    builder.appendContext('intro');
    builder.appendContext('intro-1');
    builder.addLines(2, 2, 3);
    builder.addRange(9, 5, 5, 'footnotes: x');
    expect(builder.finish().blockContext).toEqual([
      'intro\u0000intro-1\u0000',
      '',
      'footnotes: x',
    ]);
  });

  it('rejects reversed ranges', () => {
    expect(() => new BlockIndexBuilder('abc').addRange(1, 2, 1)).toThrow(
      RangeError
    );
  });
});

describe('blockKey', () => {
  it('is the block index', () => {
    expect(blockKey(0)).toBe('0');
    expect(blockKey(12)).toBe('12');
  });
});

describe('isSameBlock (P1-9)', () => {
  const table = (src: string, options?: ParseOptions) =>
    parseWithMarkdownIt(src, options).table;
  /** Same-ness of every block of `a` against the same index in `b`. */
  const compare = (
    a: string,
    b: string,
    oa?: ParseOptions,
    ob?: ParseOptions
  ) => {
    const ta = table(a, oa);
    const tb = table(b, ob);
    return Array.from(
      { length: Math.min(ta.blockCount, tb.blockCount) },
      (_, i) => isSameBlock(ta, i, tb, i)
    );
  };

  it('treats an identical re-parse as unchanged', () => {
    const src = '# T\n\npara **x**\n\n- a\n';
    expect(compare(src, src)).toEqual([true, true, true]);
    // Equal content in a different string object: native compare.
    expect(compare(src, (' ' + src).slice(1))).toEqual([true, true, true]);
  });

  it('streaming: earlier blocks stay unchanged, the growing one changes', () => {
    expect(compare('one\n\ntwo', 'one\n\ntwo three')).toEqual([true, false]);
    expect(compare('one\n\ntw', 'one\n\ntwo\n\nthree')).toEqual([true, false]);
  });

  it('editing a block leaves later blocks unchanged despite moved offsets', () => {
    const a = table('a\n\nedit me\n\nc\n\nd\n');
    const b = table('a\n\nedited text\n\nc\n\nd\n');
    expect([0, 1, 2, 3].map((i) => isSameBlock(a, i, b, i))).toEqual([
      true,
      false,
      true,
      true,
    ]);
    expect(b.blockStart[2]).not.toBe(a.blockStart[2]);
  });

  it('catches a setext underline appended to an earlier line', () => {
    expect(compare('Title\n', 'Title\n===\n')).toEqual([false]);
  });

  it('pitfall 1: a reference definition changed elsewhere changes every block', () => {
    expect(
      compare('[docs][ref]\n\n[ref]: /old\n', '[docs][ref]\n\n[ref]: /new\n')
    ).toEqual([false]);
  });

  it('pitfall 2: a duplicate heading inserted earlier changes the later slug', () => {
    const a = table('# Intro\n\ntext\n\n# Intro\n');
    const b = table('# Intro\n\n# Intro\n\n# Intro\n');
    // Block 2 is "# Intro" in both, but its slug is intro-1 vs intro-2.
    expect(isSameBlock(a, 2, b, 2)).toBe(false);
    // Nested headings count for the enclosing top-level block.
    const qa = table('# X\n\n> # X\n');
    const qb = table('> # X\n');
    expect(isSameBlock(qa, 1, qb, 0)).toBe(false);
  });

  it('pitfall 3: different parse options change every block', () => {
    const src = '| a |\n|---|\n| b |\n';
    expect(
      compare(src, src, { preset: 'gfm' }, { preset: 'commonmark' })
    ).toEqual([false]);
    expect(
      compare(
        'a <sup>1</sup>\n',
        'a <sup>1</sup>\n',
        { html: 'safe' },
        { html: 'text' }
      )
    ).toEqual([false]);
  });

  it('rejects by length before comparing text', () => {
    const a = table('short\n');
    const b = table('much longer text\n');
    expect(isSameBlock(a, 0, b, 0)).toBe(false);
  });
});
