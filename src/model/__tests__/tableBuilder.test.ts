import { childIds, getAttrs, getText } from '../read';
import { EMPTY_BLOCK_INDEX, NONE, ROOT, TableBuilder } from '../tableBuilder';
import { Flag, hasFlag, NodeType } from '../types';

describe('TableBuilder', () => {
  it('starts with a root node', () => {
    const table = new TableBuilder().finish();
    expect(table.count).toBe(1);
    expect(table.type[ROOT]).toBe(NodeType.Root);
    expect(table.parent[ROOT]).toBe(NONE);
    expect(table.firstChild[ROOT]).toBe(NONE);
  });

  it('links children in insertion order and assigns ids in document order', () => {
    const b = new TableBuilder();
    const p1 = b.add(NodeType.Paragraph, ROOT);
    const t1 = b.add(NodeType.Text, p1, 0, 'one');
    const p2 = b.add(NodeType.Paragraph, ROOT);
    const s = b.add(NodeType.Strong, p2);
    const t2 = b.add(NodeType.Text, s, 0, 'two');
    const t3 = b.add(NodeType.Text, p2, 0, 'three');
    const table = b.finish();

    expect([p1, t1, p2, s, t2, t3]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(childIds(table, ROOT)).toEqual([p1, p2]);
    expect(childIds(table, p2)).toEqual([s, t3]);
    expect(childIds(table, s)).toEqual([t2]);
    expect(table.parent[t2]).toBe(s);
    expect(table.nextSibling[t3]).toBe(NONE);
  });

  it('stores text and attributes, NONE when absent', () => {
    const b = new TableBuilder();
    const h = b.add(NodeType.Heading, ROOT, 0, null, { level: 2, id: '' });
    const t = b.add(NodeType.Text, h, 0, 'Title');
    const table = b.finish();

    expect(getAttrs(table, h)).toEqual({ level: 2, id: '' });
    expect(getText(table, h)).toBeNull();
    expect(getText(table, t)).toBe('Title');
    expect(getAttrs(table, t)).toBeNull();
    expect(table.attr[t]).toBe(NONE);
  });

  it('sets flags at creation and later', () => {
    const b = new TableBuilder();
    const list = b.add(NodeType.List, ROOT, Flag.ORDERED);
    b.addFlags(list, Flag.TIGHT);
    const table = b.finish();

    expect(hasFlag(table.flags[list]!, Flag.ORDERED)).toBe(true);
    expect(hasFlag(table.flags[list]!, Flag.TIGHT)).toBe(true);
    expect(hasFlag(table.flags[list]!, Flag.TASK)).toBe(false);
  });

  it('merges text runs with appendText and lastChildOf', () => {
    const b = new TableBuilder();
    const p = b.add(NodeType.Paragraph, ROOT);
    const t = b.add(NodeType.Text, p, 0, 'Hello');
    expect(b.lastChildOf(p)).toBe(t);
    expect(b.typeOf(t)).toBe(NodeType.Text);
    b.appendText(t, ', ');
    b.appendText(t, 'world');

    const empty = b.add(NodeType.Text, p);
    b.appendText(empty, 'created');
    const table = b.finish();

    expect(getText(table, t)).toBe('Hello, world');
    expect(getText(table, empty)).toBe('created');
  });

  it('replaces attributes with setAttrs', () => {
    const b = new TableBuilder();
    const h = b.add(NodeType.Heading, ROOT, 0, null, { level: 1, id: '' });
    b.setAttrs(h, { level: 1, id: 'title' });
    const bare = b.add(NodeType.CodeBlock, ROOT);
    b.setAttrs(bare, { language: 'ts', meta: null });
    const table = b.finish();

    expect(getAttrs(table, h)).toEqual({ level: 1, id: 'title' });
    expect(getAttrs(table, bare)).toEqual({ language: 'ts', meta: null });
    expect(table.attrs).toHaveLength(2);
  });

  it('grows past its initial capacity without losing data', () => {
    const b = new TableBuilder(2);
    const ids: number[] = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(b.add(NodeType.Text, ROOT, i % 2 ? Flag.HARD : 0, `t${i}`));
    }
    const table = b.finish();

    expect(table.count).toBe(1001);
    expect(childIds(table, ROOT)).toEqual(ids);
    expect(getText(table, ids[999]!)).toBe('t999');
    expect(table.flags[ids[1]!]).toBe(Flag.HARD);
  });

  it('trims columns to count and carries the block index', () => {
    const b = new TableBuilder(64);
    b.add(NodeType.Paragraph, ROOT);
    const index = {
      blockCount: 1,
      blocks: Int32Array.of(1),
      blockStart: Int32Array.of(0),
      blockEnd: Int32Array.of(4),
      blockHash: Uint32Array.of(123),
    };
    const table = b.finish(index);

    for (const column of [
      table.type,
      table.flags,
      table.parent,
      table.firstChild,
      table.nextSibling,
      table.text,
      table.attr,
    ]) {
      expect(column).toHaveLength(2);
    }
    expect(table.blockCount).toBe(1);
    expect(table.blockHash[0]).toBe(123);
  });

  it('defaults to an empty block index', () => {
    const table = new TableBuilder().finish();
    expect(table.blockCount).toBe(0);
    expect(table.blocks).toBe(EMPTY_BLOCK_INDEX.blocks);
  });

  it('rejects unknown parents', () => {
    const b = new TableBuilder();
    expect(() => b.add(NodeType.Text, 5)).toThrow(RangeError);
    expect(() => b.add(NodeType.Text, -1)).toThrow(RangeError);
  });

  it('cannot be used after finish', () => {
    const b = new TableBuilder();
    b.finish();
    expect(() => b.add(NodeType.Paragraph, ROOT)).toThrow('already finished');
    expect(() => b.finish()).toThrow('already finished');
  });
});
