/**
 * CodeBlock `open` (P3-33): true only while a fence is unclosed on the tail
 * block of a stream, on the fast path and the tail re-parse alike.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree } from '../../__tests__/tree';
import { emoji } from '../../emoji';
import { definePlugin, type MarkdownPlugin } from '../../plugins/definePlugin';
import type { ElementProps } from '../../render/elements';
import { Markdown } from '../Markdown';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

/** `[code, open]` per CodeBlock render, in order. */
const seen: [string, boolean][] = [];
function CodeBlock({ code, open }: ElementProps<'CodeBlock'>) {
  seen.push([code, open]);
  return null;
}
const components = { CodeBlock };
const componentsOnly = definePlugin({
  name: 'components-only',
  components: { CodeBlock },
});

const probe = {} as { current: UseMarkdownStreamResult };
function Streamed({
  plugins,
}: {
  readonly plugins?: readonly MarkdownPlugin[];
}) {
  const stream = useMarkdownStream({ plugins });
  useEffect(() => {
    probe.current = stream;
  });
  return (
    <Markdown
      document={stream.document}
      plugins={plugins}
      components={components}
    />
  );
}

const run = async (f: (s: UseMarkdownStreamResult) => void) => {
  await act(async () => f(probe.current));
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
};
/** The `open` of the latest render of the code block whose code starts with `prefix`. */
const lastOpen = (prefix: string) =>
  [...seen].reverse().find(([code]) => code.startsWith(prefix))?.[1];

beforeEach(() => {
  seen.length = 0;
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'web');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CodeBlock open', () => {
  it.each([
    ['no plugin', undefined],
    ['a syntax plugin', [emoji()]],
    ['a components-only plugin', [componentsOnly]],
  ])('streams with %s: true while open, false once closed', async (_, p) => {
    await renderTree(<Streamed plugins={p} />);
    await run((s) => s.append('intro\n\n```ts\nlet a = 1;\n'));
    expect(lastOpen('let a')).toBe(true);
    await run((s) => s.append('let b'));
    expect(lastOpen('let a')).toBe(true);
    await run((s) => s.append(' = 2;\n```\n'));
    expect(lastOpen('let a')).toBe(false);
  });

  it('turns false on done() even though the fence never closed', async () => {
    await renderTree(<Streamed />);
    await run((s) => s.append('```ts\nlet a = 1;\n'));
    await run((s) => s.append('let b'));
    expect(lastOpen('let a')).toBe(true);
    await run((s) => s.done());
    // Same text as before: the memo must not skip the block.
    expect(seen[seen.length - 1]).toEqual(['let a = 1;\nlet b', false]);
  });

  it('a closed code block earlier in the stream is false', async () => {
    await renderTree(<Streamed />);
    await run((s) => s.append('```\nfirst\n```\n\n```\nsecond\n'));
    expect(lastOpen('first')).toBe(false);
    expect(lastOpen('second')).toBe(true);
  });

  it('a static source ending in an unclosed fence is false', async () => {
    await renderTree(
      <Markdown source={'```ts\nnever closed\n'} components={components} />
    );
    expect(seen).toEqual([['never closed', false]]);
  });
});
