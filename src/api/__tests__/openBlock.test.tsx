/**
 * The open block flag (P3-37): `useIsOpenBlock()` is true for a table in the
 * last block while a `useMarkdownStream` stream runs, false after `done()`
 * and for a document that is not streamed.
 */
import { createElement, useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree } from '../../__tests__/tree';
import { useIsOpenBlock } from '../../render/contexts';
import type { Components } from '../../render/elements';
import { Markdown } from '../Markdown';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const T1 = '| a | b |\n|---|---|\n| 1 | 2 |\n\n';
const T2 = '| c | d |\n|---|---|\n| 3 | 4 |\n';

/** Renders of each table, in order, with the open flag it saw. */
let renders: { open: boolean }[] = [];
let paragraphs = 0;

const spies = {
  Table: ({ children }: { children?: ReactNode }) => {
    const open = useIsOpenBlock();
    renders.push({ open });
    return createElement('Table', null, children);
  },
  Paragraph: ({ children }: { children?: ReactNode }) => {
    paragraphs++;
    return createElement('Paragraph', null, children);
  },
} as unknown as Partial<Components>;

const probe = {} as { current: UseMarkdownStreamResult };

function Streamed() {
  const stream = useMarkdownStream({ streamingConfig: { animation: 'none' } });
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} components={spies} />;
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const run = (f: (s: UseMarkdownStreamResult) => void) =>
  act(async () => f(probe.current));
const lastOpen = () => renders.map((r) => r.open);

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'web');
  renders = [];
  paragraphs = 0;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('open block flag', () => {
  it('is false for a document that is not streamed', async () => {
    await renderTree(<Markdown source={`${T1}${T2}`} components={spies} />);
    expect(renders.length).toBeGreaterThan(0);
    expect(lastOpen().every((o) => !o)).toBe(true);
  });

  it('is true for the last block during a stream, false after done()', async () => {
    await renderTree(<Streamed />);
    await run((s) => s.append(`${T1}${T2}`));
    await advance(100);
    // First table (closed) false, last table (open) true.
    expect(renders.map((r) => r.open).slice(-2)).toEqual([false, true]);

    renders = [];
    await run((s) => s.done());
    await advance(100);
    // The closing flush re-renders the formerly open table, now false.
    expect(renders.length).toBeGreaterThan(0);
    expect(lastOpen().every((o) => !o)).toBe(true);
  });

  it('does not re-render earlier closed blocks', async () => {
    await renderTree(<Streamed />);
    await run((s) =>
      s.append('Intro\n\nsecond para\n\n| a | b |\n|---|---|\n')
    );
    await advance(100);
    const before = paragraphs;
    await run((s) => s.append('| 1 | 2 |\n'));
    await advance(100);
    expect(paragraphs).toBe(before);
  });
});
