import { getMarkdownIt } from '../../parse/markdownIt';
import {
  BlockIndexBuilder,
  blockKey,
  computeLineOffsets,
  fnv1a,
  lineToOffset,
} from '../blockIndex';

const offsets = (s: string) => Array.from(computeLineOffsets(s));

describe('computeLineOffsets', () => {
  it('handles LF, CRLF and CR, plus a final sentinel', () => {
    expect(offsets('a\nb')).toEqual([0, 2, 3]);
    expect(offsets('a\r\nb')).toEqual([0, 3, 4]);
    expect(offsets('a\rb')).toEqual([0, 2, 3]);
    expect(offsets('a\r\n\r\nb')).toEqual([0, 3, 5, 6]);
  });

  it('handles empty input and a trailing newline', () => {
    expect(offsets('')).toEqual([0, 0]);
    expect(offsets('a\n')).toEqual([0, 2, 2]);
  });

  it('clamps lines past the end to source length', () => {
    const lines = computeLineOffsets('a\nb');
    expect(lineToOffset(lines, 1)).toBe(2);
    expect(lineToOffset(lines, 99)).toBe(3);
  });
});

describe('fnv1a', () => {
  it('matches the reference FNV-1a 32-bit vectors for ASCII', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('hashes a range without slicing, as an unsigned 32-bit int', () => {
    expect(fnv1a('xxfoobarxx', 2, 8)).toBe(fnv1a('foobar'));
    const h = fnv1a('ünïcødé ✓');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different content', () => {
    expect(fnv1a('block one')).not.toBe(fnv1a('block two'));
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
    const slices = Array.from(index.blocks, (_, i) =>
      source.slice(index.blockStart[i], index.blockEnd[i])
    );
    return { index, slices };
  }

  it('maps markdown-it line ranges to source slices', () => {
    const { index, slices } = topLevelSlices(
      '# Title\n\nPara one\nline two\n\n- a\n- b\n'
    );
    expect(index.blockCount).toBe(3);
    expect(slices).toEqual(['# Title\n', 'Para one\nline two\n', '- a\n- b\n']);
  });

  it('keeps offsets in the original source when it uses CRLF', () => {
    const source = '# Title\r\n\r\nPara\r\nline\r\n';
    const { slices } = topLevelSlices(source);
    expect(slices).toEqual(['# Title\r\n', 'Para\r\nline\r\n']);
  });

  it('handles a last block without a trailing newline', () => {
    const { slices } = topLevelSlices('one\n\ntwo');
    expect(slices).toEqual(['one\n', 'two']);
  });

  it('hashes equal blocks equally and changed blocks differently', () => {
    const a = topLevelSlices('same\n\nfirst\n').index;
    const b = topLevelSlices('same\n\nsecond\n').index;
    expect(a.blockHash[0]).toBe(b.blockHash[0]);
    expect(a.blockHash[1]).not.toBe(b.blockHash[1]);
  });

  it('accepts synthesized blocks with a precomputed hash', () => {
    const source = 'text\n';
    const builder = new BlockIndexBuilder(source);
    builder.addLines(1, 0, 1);
    builder.addRange(9, source.length, source.length, fnv1a('[^1]: note'));
    const index = builder.finish();

    expect(Array.from(index.blocks)).toEqual([1, 9]);
    expect(index.blockStart[1]).toBe(5);
    expect(index.blockEnd[1]).toBe(5);
    expect(index.blockHash[1]).toBe(fnv1a('[^1]: note'));
  });

  it('builds stable keys from position and offset', () => {
    const { index } = topLevelSlices('a\n\nb\n');
    expect(blockKey(index, 0)).toBe('0:0');
    expect(blockKey(index, 1)).toBe('1:3');
  });

  it('rejects reversed ranges', () => {
    expect(() => new BlockIndexBuilder('abc').addRange(1, 2, 1)).toThrow(
      RangeError
    );
  });
});
