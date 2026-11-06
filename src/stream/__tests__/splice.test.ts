import type { NodeTable } from '../../model';
import { isSameBlock } from '../../model/blockIndex';
import { parseWithMarkdownIt } from '../../parse/markdownItBackend';
import { spliceTables } from '../splice';

const SOURCE = [
  '# Title',
  '',
  'Para with **bold** and `code` and a [link](https://x.dev).',
  '',
  '- one',
  '- two',
  '  - nested',
  '',
  '> quote',
  '',
  '```ts',
  'const a = 1;',
  '```',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '## Second',
  '',
  'Last paragraph.',
  '',
].join('\n');

const parse = (src: string): NodeTable => parseWithMarkdownIt(src).table;

/** Tail parse as parseFrom would return it: absolute offsets, whole source. */
function parseTail(source: string, offset: number): NodeTable {
  const t = parse(source.slice(offset));
  return {
    ...t,
    blockStart: t.blockStart.map((v) => v + offset),
    blockEnd: t.blockEnd.map((v) => v + offset),
    source,
  };
}

/** Everything observable in `[0, count)` plus the block index. */
function snapshot(t: NodeTable) {
  const n = t.count;
  return {
    count: n,
    type: Array.from(t.type.subarray(0, n)),
    flags: Array.from(t.flags.subarray(0, n)),
    parent: Array.from(t.parent.subarray(0, n)),
    firstChild: Array.from(t.firstChild.subarray(0, n)),
    nextSibling: Array.from(t.nextSibling.subarray(0, n)),
    text: Array.from(t.text.subarray(0, n)),
    attr: Array.from(t.attr.subarray(0, n)),
    strings: [...t.strings],
    attrs: [...t.attrs],
    pluginNodes: [...t.pluginNodes],
    blockCount: t.blockCount,
    blocks: Array.from(t.blocks),
    blockStart: Array.from(t.blockStart),
    blockEnd: Array.from(t.blockEnd),
    blockContext: [...t.blockContext],
    source: t.source,
    context: t.context,
  };
}

/** Same columns, but longer (capacity) and filled with junk past `count`. */
function padded(t: NodeTable, extra = 17): NodeTable {
  const pad = <T extends Uint8Array | Int32Array>(c: T): T => {
    const out = new (c.constructor as new (n: number) => T)(c.length + extra);
    out.fill(99);
    out.set(c);
    return out;
  };
  return {
    ...t,
    type: pad(t.type),
    flags: pad(t.flags),
    parent: pad(t.parent),
    firstChild: pad(t.firstChild),
    nextSibling: pad(t.nextSibling),
    text: pad(t.text),
    attr: pad(t.attr),
  };
}

const full = parse(SOURCE);

/** Prefix as a stream would hold it: the text cut inside block k. */
function prefixFor(k: number): NodeTable {
  const cut = Math.floor((full.blockStart[k]! + full.blockEnd[k]!) / 2);
  return parse(SOURCE.slice(0, Math.max(cut, full.blockStart[k]! + 1)));
}

describe('spliceTables', () => {
  it('has enough blocks to be meaningful', () => {
    expect(full.blockCount).toBeGreaterThanOrEqual(7);
  });

  for (let k = 0; k < full.blockCount; k++) {
    it(`equals a full parse when splicing at stableCount ${k}`, () => {
      const prefix = prefixFor(k);
      const tail = parseTail(SOURCE, full.blockStart[k]!);
      const out = spliceTables(prefix, k, tail, {});
      expect(snapshot(out)).toEqual(snapshot(full));
      expect(out.stableCount).toBe(k);
    });
  }

  it('handles capacity-padded prefix columns', () => {
    const k = 4;
    const prefix = padded(prefixFor(k));
    const tail = parseTail(SOURCE, full.blockStart[k]!);
    const out = spliceTables(prefix, k, tail, {});
    expect(snapshot(out)).toEqual(snapshot(full));
  });

  it('handles a prefix whose stable blocks are all of it', () => {
    const k = full.blockCount - 1;
    const prefix = parse(SOURCE.slice(0, full.blockStart[k]!));
    expect(prefix.blockCount).toBe(k);
    const out = spliceTables(
      prefix,
      k,
      parseTail(SOURCE, full.blockStart[k]!),
      {}
    );
    expect(snapshot(out)).toEqual(snapshot(full));
  });

  it('handles an empty tail', () => {
    const src = '# A\n\nB\n';
    const prefix = parse(src);
    const empty = parseTail(src, src.length);
    const out = spliceTables(prefix, prefix.blockCount, empty, {});
    expect(snapshot(out)).toEqual(snapshot(prefix));
  });

  it('handles an empty prefix', () => {
    const out = spliceTables(parse(''), 0, parseTail(SOURCE, 0), {});
    expect(snapshot(out)).toEqual(snapshot(full));
  });

  it('sets prefixId, stableCount, and takes source/context from the tail', () => {
    const id = {};
    const k = 2;
    const tail = parseTail(SOURCE, full.blockStart[k]!);
    const out = spliceTables(prefixFor(k), k, tail, id);
    expect(out.prefixId).toBe(id);
    expect(out.stableCount).toBe(k);
    expect(out.source).toBe(tail.source);
    expect(out.context).toBe(tail.context);
    expect(out.pluginNodes).toBe(tail.pluginNodes);
  });

  it('never mutates its inputs', () => {
    const k = 3;
    const prefix = prefixFor(k);
    const tail = parseTail(SOURCE, full.blockStart[k]!);
    const before = [snapshot(prefix), snapshot(tail)];
    const out = spliceTables(prefix, k, tail, {});
    expect([snapshot(prefix), snapshot(tail)]).toEqual(before);
    for (const col of [
      prefix.parent,
      prefix.nextSibling,
      prefix.firstChild,
      tail.parent,
      tail.nextSibling,
      tail.firstChild,
    ]) {
      expect(out.parent).not.toBe(col);
      expect(out.nextSibling).not.toBe(col);
      expect(out.firstChild).not.toBe(col);
    }
    expect(out.strings).not.toBe(prefix.strings);
    expect(out.strings).not.toBe(tail.strings);
  });

  it('rejects an out-of-range stableCount', () => {
    const t = parse('a\n');
    expect(() => spliceTables(t, 2, t, {})).toThrow(RangeError);
    expect(() => spliceTables(t, -1, t, {})).toThrow(RangeError);
  });
});

describe('isSameBlock stream fast path', () => {
  const k = 3;
  const tail = parseTail(SOURCE, full.blockStart[k]!);
  const id = {};
  const a = spliceTables(prefixFor(k), k, tail, id);
  const b = spliceTables(prefixFor(k), k, tail, id);
  const lying: NodeTable = { ...b, source: 'x'.repeat(SOURCE.length) };

  it('is true for stable blocks of the same prefix without comparing text', () => {
    expect(isSameBlock(a, 0, lying, 0)).toBe(true);
    expect(isSameBlock(a, k - 1, lying, k - 1)).toBe(true);
  });

  it('falls back to comparison at or past stableCount', () => {
    expect(isSameBlock(a, k, lying, k)).toBe(false);
    expect(isSameBlock(a, k, b, k)).toBe(true);
  });

  it('falls back when prefixIds differ', () => {
    expect(isSameBlock(a, 0, { ...lying, prefixId: {} }, 0)).toBe(false);
  });

  it('does not apply to ordinary parses', () => {
    expect(isSameBlock(full, 0, full, 0)).toBe(true);
    expect(isSameBlock(full, 0, full, 1)).toBe(false);
  });

  it('compares different indexes normally', () => {
    expect(isSameBlock(a, 0, b, 1)).toBe(false);
  });
});
