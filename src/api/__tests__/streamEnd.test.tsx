/**
 * `onStreamingEnd` (P2b-6): once per stream, after the exact document that
 * `done()` publishes has been committed.
 * Spec: docs/rewrite/phase-2b/decisions.md#p2b-6-one-streamingconfig-object-and-onstreamingend
 */
import { StrictMode, useEffect } from 'react';
import { Platform } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree, textOf, type Tree } from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import { Markdown } from '../Markdown';
import {
  useMarkdownStream,
  type StreamingConfig,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const components = hostComponents();
const probe = {} as { current: UseMarkdownStreamResult };

function Streamed({
  onEnd,
  config,
}: {
  readonly onEnd?: () => void;
  readonly config?: StreamingConfig;
}) {
  const stream = useMarkdownStream({
    streamingConfig: config,
    onStreamingEnd: onEnd,
  });
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} components={components} />;
}

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const run = (f: (s: UseMarkdownStreamResult) => void) =>
  act(async () => f(probe.current));

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'web');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** A handler that records the committed text each time it is called. */
function recorder(tree: { current: Tree | null }) {
  const seen: string[] = [];
  const onEnd = jest.fn(() => {
    seen.push(textOf(tree.current!.container));
  });
  return { onEnd, seen };
}

describe('onStreamingEnd', () => {
  it('fires once, after the done() document is committed', async () => {
    const ref = { current: null as Tree | null };
    const { onEnd, seen } = recorder(ref);
    ref.current = await renderTree(<Streamed onEnd={onEnd} />);
    await run((s) => s.append('Hello **wor'));
    await advance(20);
    expect(onEnd).not.toHaveBeenCalled();
    await run((s) => s.done());
    expect(onEnd).toHaveBeenCalledTimes(1);
    // The exact parse (the dangling `**` shows), already on screen.
    expect(seen).toEqual(['Hello **wor']);
    await advance(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('with smooth: after the paced text drains and the exact publish', async () => {
    const ref = { current: null as Tree | null };
    const { onEnd, seen } = recorder(ref);
    ref.current = await renderTree(
      <Streamed onEnd={onEnd} config={{ smooth: true }} />
    );
    const burst = Array.from(
      { length: 20 },
      (_, i) => `Sentence ${i} has some words.\n\n`
    ).join('');
    await run((s) => s.append(burst));
    await advance(32);
    await run((s) => s.done());
    expect(onEnd).not.toHaveBeenCalled(); // still draining
    for (let i = 0; i < 15; i++) await advance(16);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(seen[0]).toContain('Sentence 19 has some words.');
  });

  it('done() twice fires once', async () => {
    const onEnd = jest.fn();
    await renderTree(<Streamed onEnd={onEnd} />);
    await run((s) => s.append('One.'));
    await run((s) => s.done());
    await run((s) => s.done());
    await run((s) => s.append(' More.'));
    await run((s) => s.done());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('reset() starts a new stream that ends again', async () => {
    const onEnd = jest.fn();
    await renderTree(<Streamed onEnd={onEnd} />);
    await run((s) => s.append('One.'));
    await run((s) => s.done());
    await run((s) => s.reset());
    expect(onEnd).toHaveBeenCalledTimes(1);
    await run((s) => s.append('Two.'));
    await run((s) => s.done());
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it('does not fire without done(), on reset() or on unmount', async () => {
    const onEnd = jest.fn();
    const tree = await renderTree(<Streamed onEnd={onEnd} />);
    await run((s) => s.append('One.'));
    await run((s) => s.reset('Two.'));
    await advance(1000);
    await tree.unmount();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('does not fire when unmounted while smooth drains', async () => {
    const onEnd = jest.fn();
    const tree = await renderTree(
      <Streamed onEnd={onEnd} config={{ smooth: true }} />
    );
    await run((s) => s.append('one two three four five six seven '.repeat(20)));
    await advance(32);
    await run((s) => s.done());
    await tree.unmount();
    await advance(2000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('StrictMode: fires once', async () => {
    const onEnd = jest.fn();
    await renderTree(
      <StrictMode>
        <Streamed onEnd={onEnd} />
      </StrictMode>
    );
    await run((s) => s.append('One.'));
    await run((s) => s.done());
    await advance(100);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback, without a warning or new identities', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const first = jest.fn();
    const second = jest.fn();
    const tree = await renderTree(<Streamed onEnd={first} />);
    const { append, reset, done } = probe.current;
    await tree.rerender(<Streamed onEnd={second} />);
    await run((s) => s.append('One.'));
    await run((s) => s.done());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(probe.current.append).toBe(append);
    expect(probe.current.reset).toBe(reset);
    expect(probe.current.done).toBe(done);
  });
});
