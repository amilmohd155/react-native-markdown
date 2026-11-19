/**
 * Global task index (P3-17) and task text (P3-16).
 * Spec: docs/rewrite/phase-3/task-toggling.md
 */
import { createElement, type ReactNode } from 'react';
import { renderTree } from '../../__tests__/tree';
import { NodeType } from '../../model';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { blockTaskCount, taskText } from '../tasks';
import { hostComponents, nodesOfType, tableFor } from './helpers';

interface Seen {
  readonly taskIndex: number | null;
  readonly text: string | null;
  readonly index: number;
}

/** Renders `source`, returning every ListItem's props in render order. */
function listItemsOf(
  seen: Seen[],
  ListItem = ({
    taskIndex,
    text,
    index,
    children,
  }: Seen & { children?: ReactNode }) => {
    seen.push({ taskIndex, text, index });
    return createElement('ListItem', null, children);
  }
) {
  return createRenderCtx({
    components: hostComponents({ ListItem: ListItem as never }),
  });
}

function textsOf(source: string): (string | null)[] {
  const table = tableFor(source);
  return nodesOfType(table, NodeType.ListItem).map((id) => taskText(table, id));
}

describe('global task index', () => {
  it('re-renders later blocks when a task is inserted above them', async () => {
    const seen: Seen[] = [];
    const ctx = listItemsOf(seen);
    const before = '- [ ] b\n- [x] c\n\nmiddle\n\n- [ ] d';
    const root = await renderTree(
      <BlockList table={tableFor(before)} ctx={ctx} />
    );
    expect(seen.map((s) => s.taskIndex)).toEqual([0, 1, 2]);

    seen.length = 0;
    // A new task in block 0; the later blocks' own source is unchanged, so
    // `isSameBlock` alone would skip them with a stale base.
    const after = '- [ ] a\n- [ ] b\n- [x] c\n\nmiddle\n\n- [ ] d';
    await root.rerender(<BlockList table={tableFor(after)} ctx={ctx} />);
    expect(seen.map((s) => s.taskIndex)).toEqual([0, 1, 2, 3]);
    // The last list's block was unchanged and still got the new index.
    expect(seen[3]).toEqual({ taskIndex: 3, text: 'd', index: 0 });
  });

  it('counts depth-first in document order across blockquotes and nested lists', async () => {
    const seen: Seen[] = [];
    const ctx = listItemsOf(seen);
    const source = [
      '- [ ] one',
      '  - [x] one.a',
      '    - [ ] one.a.i',
      '  - plain',
      '  - [ ] one.b',
      '- [ ] two',
      '',
      '> - [ ] quoted',
      '>   - [x] quoted child',
      '',
      '1. [ ] ordered',
    ].join('\n');
    await renderTree(<BlockList table={tableFor(source)} ctx={ctx} />);
    expect(seen.map(({ taskIndex, text }) => [taskIndex, text])).toEqual([
      [0, 'one'],
      [1, 'one.a'],
      [2, 'one.a.i'],
      [null, null],
      [3, 'one.b'],
      [4, 'two'],
      [5, 'quoted'],
      [6, 'quoted child'],
      [7, 'ordered'],
    ]);
  });

  it('keeps the per-list index unchanged', async () => {
    const seen: Seen[] = [];
    const ctx = listItemsOf(seen);
    await renderTree(
      <BlockList
        table={tableFor('- [ ] a\n- [ ] b\n\ntext\n\n- [ ] c')}
        ctx={ctx}
      />
    );
    expect(seen.map((s) => [s.index, s.taskIndex])).toEqual([
      [0, 0],
      [1, 1],
      [0, 2],
    ]);
  });

  it('counts tasks per block at any depth', () => {
    const table = tableFor(
      ['# h', '- [ ] a\n  - [ ] b\n- c', '> - [x] q', 'para', '- d'].join(
        '\n\n'
      )
    );
    expect(
      Array.from({ length: table.blockCount }, (_, i) =>
        blockTaskCount(table, i)
      )
    ).toEqual([0, 2, 1, 0, 0]);
  });
});

describe('task text', () => {
  it('flattens inline formatting, links, code, images and breaks', () => {
    expect(
      textsOf(
        '- [ ] **bold** *em* ~~del~~ [link](https://x.y) `code` ![alt text](i.png) end'
      )
    ).toEqual(['bold em del link code alt text end']);
  });

  it('turns soft and hard breaks into a space', () => {
    expect(textsOf('- [ ] one\n  two  \n  three')).toEqual(['one two three']);
  });

  it('excludes nested lists but keeps their own text separate', () => {
    expect(textsOf('- [ ] parent\n  - [x] child\n  - [ ] other')).toEqual([
      'parent',
      'child',
      'other',
    ]);
  });

  it('joins the paragraphs of a loose item', () => {
    expect(textsOf('- [ ] first\n\n  second\n\n  - [ ] sub')).toEqual([
      'first second',
      'sub',
    ]);
  });

  it('is null (with a null index) for plain items', async () => {
    const seen: Seen[] = [];
    await renderTree(
      <BlockList
        table={tableFor('- plain\n- [ ] task')}
        ctx={listItemsOf(seen)}
      />
    );
    expect(seen.map((s) => [s.taskIndex, s.text])).toEqual([
      [null, null],
      [0, 'task'],
    ]);
  });
});
