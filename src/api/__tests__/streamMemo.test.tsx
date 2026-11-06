/**
 * Memoization during a stream (phase 2, S2.5).
 * Spec: docs/rewrite/phase-2/testing-harness.md#memoization-test
 *
 * Streams a multi-block message through `useMarkdownStream` into
 * `<Markdown document>` and checks, per flush, that only the open block's
 * elements render, and that closed blocks are skipped by the `isSameBlock`
 * prefix fast path (no source-text comparison).
 */
import { createElement, useEffect, type ReactNode } from 'react';
import { act } from '@testing-library/react-native';
import { renderTree } from '../../__tests__/tree';
import type { NodeTable } from '../../model';
import type { Components } from '../../render/elements';
import { Markdown } from '../Markdown';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

interface SameBlockCall {
  readonly index: number;
  /** The fast-path condition held: same stream prefix, closed block. */
  readonly closed: boolean;
  /** The comparison read source text, context or offsets (the slow path). */
  readonly touchedSource: boolean;
  readonly result: boolean;
}

const mockCalls: SameBlockCall[] = [];

// Wraps the real `isSameBlock` (used by `Block`'s memo comparison) with proxied
// tables that record whether the slow path's fields were read.
jest.mock('../../model', () => {
  const actual = jest.requireActual('../../model');
  const SLOW = new Set([
    'source',
    'context',
    'blockStart',
    'blockEnd',
    'blockContext',
  ]);
  return {
    ...actual,
    isSameBlock: (a: NodeTable, i: number, b: NodeTable, j: number) => {
      const closed =
        a.prefixId !== undefined &&
        a.prefixId === b.prefixId &&
        i < a.stableCount! &&
        j < b.stableCount! &&
        i === j;
      let touchedSource = false;
      const watch = (table: NodeTable): NodeTable =>
        new Proxy(table, {
          get(target, key, receiver) {
            if (typeof key === 'string' && SLOW.has(key)) touchedSource = true;
            return Reflect.get(target, key, receiver);
          },
        });
      const result = actual.isSameBlock(watch(a), i, watch(b), j);
      mockCalls.push({ index: i, closed, touchedSource, result });
      return result;
    },
  };
});

/** Per-flush render log of the spy components. */
const renders = {
  paragraph: [] as string[],
  list: 0,
  code: 0,
  table: 0,
};
const resetRenders = () => {
  renders.paragraph = [];
  renders.list = 0;
  renders.code = 0;
  renders.table = 0;
};

const spies = {
  Paragraph: ({ children }: { children?: ReactNode }) => {
    renders.paragraph.push(String(children));
    return createElement('Paragraph', null, children);
  },
  List: ({ children }: { children?: ReactNode }) => {
    renders.list++;
    return createElement('List', null, children);
  },
  CodeBlock: () => {
    renders.code++;
    return createElement('CodeBlock');
  },
  Table: ({ children }: { children?: ReactNode }) => {
    renders.table++;
    return createElement('Table', null, children);
  },
} as unknown as Partial<Components>;

/** The hook's handle, published after commit (`append` is stable). */
const probe = {} as { current: UseMarkdownStreamResult };

/** `timeout`: an explicit window. `raf`: the native default (these tests run as iOS). */
function Streamed({ scheduler }: { scheduler: 'timeout' | 'raf' }) {
  const stream = useMarkdownStream(
    scheduler === 'timeout' ? { flushIntervalMs: 50 } : {}
  );
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} components={spies} />;
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

/** One chunk per flush: the open block is named in the comment. */
const STEPS: {
  chunk: string;
  expect: {
    paragraph: string[];
    list: number;
    code: number;
    table: number;
  };
}[] = [
  {
    // First flush: nothing to skip yet. Open block: "Para tw".
    chunk: 'Para one.\n\nPara tw',
    expect: { paragraph: ['Para one.', 'Para tw'], list: 0, code: 0, table: 0 },
  },
  {
    // Open block: "Para two." (grows), then a list starts.
    chunk: 'o.\n\n- item a\n',
    // (Tight-list items render through `Paragraph` too.)
    expect: {
      paragraph: ['Para two.', 'item a'],
      list: 1,
      code: 0,
      table: 0,
    },
  },
  {
    // Open block: the list.
    chunk: '- item b\n\n```js\nco',
    expect: { paragraph: ['item a', 'item b'], list: 1, code: 1, table: 0 },
  },
  {
    // Open block: the fence.
    chunk: 'de line\n',
    expect: { paragraph: [], list: 0, code: 1, table: 0 },
  },
  {
    // Open block: the fence closes, a table starts.
    chunk: '```\n\n| a | b |\n|---|---|\n| 1 |',
    expect: { paragraph: [], list: 0, code: 1, table: 1 },
  },
  {
    // Open block: the table, then a paragraph.
    chunk: ' 2 |\n\nLast para.\n\n',
    expect: { paragraph: ['Last para.'], list: 0, code: 0, table: 1 },
  },
];

describe.each(['timeout', 'raf'] as const)(
  'streaming memoization (%s)',
  (mode) => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockCalls.length = 0;
      resetRenders();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('renders only the open block per flush', async () => {
      await renderTree(<Streamed scheduler={mode} />);
      resetRenders();

      for (const [n, step] of STEPS.entries()) {
        resetRenders();
        await act(async () => probe.current.append(step.chunk));
        // 100 ms covers one `timeout` window and one `raf` frame: one flush per step.
        await advance(100);
        expect({ step: n, ...renders }).toEqual({ step: n, ...step.expect });
      }
      // The wrapper around the real `isSameBlock` is live (so the `it.failing`
      // below fails for its documented reason, not because the spy is dead)
      // and closed blocks were compared and found equal.
      expect(mockCalls.length).toBeGreaterThan(0);
      expect(mockCalls.some((c) => c.result)).toBe(true);
    });

    // KNOWN GAP (found in S2.5): the `isSameBlock` prefix fast path never fires
    // through `<Block>`. `Block`'s memo compares the props of its LAST RENDER
    // with the new ones, and a block last rendered while it was open has
    // `i >= table.stableCount` in that retained table, so `i < a.stableCount`
    // is never true. Closed blocks are skipped (first test) but by the slow
    // source-text comparison (measured on the S25 FE: 0.43 ms p50 per flush at
    // 862 blocks, not the 6 ms first estimated).
    // ACCEPTED, not to be fixed now (P2-2, S5, docs/rewrite/phase-2/decisions.md):
    // the baseline comparator is ~0.8% of stream time at 862 blocks and a fix
    // saves at most ~0.5% (spikes A/B: 0.49% / 0.42%). If a fix is ever merged
    // (see the spikes in P2-2) this test starts passing and `it.failing`
    // fails: change it to `it`.
    it.failing(
      'skips closed blocks without comparing source text',
      async () => {
        await renderTree(<Streamed scheduler={mode} />);

        for (const step of STEPS) {
          await act(async () => probe.current.append(step.chunk));
          await advance(100);
        }

        const closed = mockCalls.filter((c) => c.closed);
        // The fast path was actually exercised on a multi-block stream.
        expect(closed.length).toBeGreaterThan(0);
        for (const call of closed) {
          expect(call.touchedSource).toBe(false);
          expect(call.result).toBe(true);
        }
      }
    );
  }
);
