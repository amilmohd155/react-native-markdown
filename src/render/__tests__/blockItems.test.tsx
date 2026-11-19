/**
 * `taskBase` of list items (P3-17): prefix sums reused across a stream's
 * stable prefix, recounted for the tail.
 */
import { useEffect } from 'react';
import type { NodeTable } from '../../model';
import { renderTree } from '../../__tests__/tree';
import { createRenderCtx, type RenderCtx } from '../context';
import { useBlockItems, type BlockItem } from '../blockItems';
import { blockTaskCount } from '../tasks';
import { hostComponents, tableFor } from './helpers';

let items: readonly BlockItem[] = [];

function Probe({ table, ctx }: { table: NodeTable; ctx: RenderCtx }) {
  const data = useBlockItems(table, ctx, null);
  useEffect(() => {
    items = data;
  });
  return null;
}

const bases = () => items.map((item) => item.taskBase);

/** `source`'s table, marked as `blocks` stable blocks of stream `prefix`. */
function streamTable(source: string, prefix: object, stable: number) {
  return { ...tableFor(source), prefixId: prefix, stableCount: stable };
}

describe('buildItems taskBase', () => {
  const ctx = createRenderCtx({ components: hostComponents() });

  it('is the prefix sum of per-block task counts', async () => {
    const table = tableFor('- [ ] a\n- [ ] b\n\ntext\n\n- [ ] c\n\n---\n\n- d');
    await renderTree(<Probe table={table} ctx={ctx} />);
    expect(bases()).toEqual([0, 2, 2, 3, 3]);
  });

  it('reuses the stable prefix and recounts only the tail', async () => {
    const prefix = {};
    const first = streamTable('- [ ] a\n\ntext\n\n- [ ] b', prefix, 2);
    const root = await renderTree(<Probe table={first} ctx={ctx} />);
    expect(bases()).toEqual([0, 1, 1]);
    const before = items;

    // The open tail grows: a task is added inside it, and a block follows.
    const next = streamTable(
      '- [ ] a\n\ntext\n\n- [ ] b\n- [ ] c\n\n---\n\n- [ ] d',
      prefix,
      2
    );
    await root.rerender(<Probe table={next} ctx={ctx} />);
    expect(bases()).toEqual([0, 1, 1, 3, 3]);
    // Stable-prefix items are the same objects.
    expect(items[0]).toBe(before[0]);
    expect(items[1]).toBe(before[1]);
    expect(items[2]).not.toBe(before[2]);
  });

  it('matches an independent prefix sum after every flush', async () => {
    const prefix = {};
    const blocks = [
      '- [ ] a',
      '> - [x] q\n>   - [ ] r',
      'text',
      '- [ ] b\n- [ ] c',
      '- [ ] d',
    ];
    const root = await renderTree(
      <Probe table={streamTable(blocks[0]!, prefix, 0)} ctx={ctx} />
    );
    for (let n = 1; n <= blocks.length; n++) {
      const source = blocks.slice(0, n).join('\n\n');
      // Every block but the last is closed.
      await root.rerender(
        <Probe table={streamTable(source, prefix, n - 1)} ctx={ctx} />
      );
      const table = tableFor(source);
      let sum = 0;
      const expected = Array.from({ length: table.blockCount }, (_, i) => {
        const base = sum;
        sum += blockTaskCount(table, i);
        return base;
      });
      expect(bases()).toEqual(expected);
    }
  });
});
