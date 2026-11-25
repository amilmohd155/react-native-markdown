/**
 * The column width cache key (P3-37): the Table node's own source lines,
 * plus document context, block context and its position in the block.
 */
import { createElement, useContext, type ReactNode } from 'react';
import { renderTree } from '../../__tests__/tree';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { TableKeyContext } from '../contexts';
import { hostComponents, tableFor } from './helpers';

const TABLE = '| a | b |\n|---|---|\n| 1 | 2 |\n';

/** The key of every table in `source`, in render order. */
async function keysOf(source: string): Promise<string[]> {
  const keys: string[] = [];
  const Table = ({ children }: { children?: ReactNode }) => {
    keys.push(useContext(TableKeyContext));
    return createElement('Table', null, children);
  };
  const ctx = createRenderCtx({
    components: hostComponents({ Table: Table as never }),
  });
  await renderTree(<BlockList table={tableFor(source)} ctx={ctx} />);
  return keys;
}

describe('table key', () => {
  it('is shared by identical tables in different lists', async () => {
    const [a] = await keysOf(
      `- one\n- two\n\n  ${TABLE.replace(/\n/g, '\n  ')}`
    );
    const [b] = await keysOf(
      `- other\n- items\n\n  ${TABLE.replace(/\n/g, '\n  ')}`
    );
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it('survives an edit outside the table, in the same block', async () => {
    const indent = (t: string) => t.replace(/^/gm, '  ').replace(/ +$/, '');
    const [a] = await keysOf(`- one\n\n${indent(TABLE)}`);
    const [b] = await keysOf(`- one, edited\n\n${indent(TABLE)}`);
    expect(a).toBe(b);
  });

  it('survives an edit in another block', async () => {
    const [a] = await keysOf(`intro\n\n${TABLE}`);
    const [b] = await keysOf(`a longer intro\n\n${TABLE}`);
    expect(a).toBe(b);
  });

  it('changes when the table itself changes', async () => {
    const [a] = await keysOf(TABLE);
    const [b] = await keysOf(TABLE.replace('| 1 | 2 |', '| 1 | 22 |'));
    expect(a).not.toBe(b);
  });

  it('differs for identical tables at different positions of one block', async () => {
    const t = TABLE.replace(/^/gm, '> ');
    const keys = await keysOf(`${t}>\n${t}`);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('is empty (no cache) for a table without source', async () => {
    const keys: string[] = [];
    const Table = ({ children }: { children?: ReactNode }) => {
      keys.push(useContext(TableKeyContext));
      return createElement('Table', null, children);
    };
    const ctx = createRenderCtx({
      components: hostComponents({ Table: Table as never }),
    });
    const base = tableFor(TABLE);
    const table = {
      ...base,
      attrs: base.attrs.map((a) => ('source' in a ? { ...a, source: '' } : a)),
    };
    await renderTree(<BlockList table={table} ctx={ctx} />);
    expect(keys).toEqual(['']);
  });
});
