/**
 * `streamingConfig.animation` (P2b-5): new blocks of a live stream fade in.
 * Spec: docs/rewrite/phase-2b/decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade
 *
 * A fading block is wrapped in an `Animated.View` whose host `View` has an
 * `opacity` style; nothing else in these trees has one. Most tests run on the
 * web schedule (`Platform.OS` `'web'`: a leading flush per append, and the
 * JS animation driver, so the host opacity really moves); the native driver
 * is checked through `Animated.timing`'s config, since React Native's Jest
 * setup does not run native animations.
 */
import { StrictMode, useEffect } from 'react';
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import { createDocument, tableOf, type MarkdownDocument } from '../document';
import { resetReduceMotionCache } from '../fade';
import { Markdown } from '../Markdown';
import { useMarkdownBlocks } from '../useMarkdownBlocks';
import {
  useMarkdownStream,
  type StreamAnimation,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';
import { layOutList, rootOf, scrollListTo } from './listHelpers';

const components = hostComponents();

const probe = {} as { current: UseMarkdownStreamResult };

type Mode = 'plain' | 'scroll' | 'scroll-ref' | 'virtualize' | 'hook';

function HookList({ document }: { readonly document: MarkdownDocument }) {
  const blocks = useMarkdownBlocks({ document, components });
  return (
    <FlatList
      data={blocks.data}
      keyExtractor={blocks.keyExtractor}
      renderItem={blocks.renderItem}
      initialNumToRender={50}
    />
  );
}

function View({
  document,
  mode,
}: {
  readonly document: MarkdownDocument;
  readonly mode: Mode;
}) {
  switch (mode) {
    case 'plain':
      return <Markdown document={document} components={components} />;
    case 'scroll':
      return <Markdown document={document} components={components} scroll />;
    case 'scroll-ref':
      return (
        <Markdown
          document={document}
          components={components}
          scroll={{ ref: { current: null } }}
        />
      );
    case 'virtualize':
      return (
        <Markdown
          document={document}
          components={components}
          virtualize={{ initialNumToRender: 50 }}
        />
      );
    case 'hook':
      return <HookList document={document} />;
  }
}

function Streamed({
  animation = 'fade',
  mode = 'plain',
  show = true,
}: {
  readonly animation?: StreamAnimation;
  readonly mode?: Mode;
  readonly show?: boolean;
}) {
  const stream = useMarkdownStream({ streamingConfig: { animation } });
  useEffect(() => {
    probe.current = stream;
  });
  return show ? <View document={stream.document} mode={mode} /> : null;
}

/** The hook with no `streamingConfig` at all. */
function Unanimated() {
  const stream = useMarkdownStream();
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown document={stream.document} components={components} />;
}

/** Host opacity of a fade wrapper, or undefined for any other host. */
function opacityOf(node: TestInstance): number | undefined {
  if (node.type !== 'View') return undefined;
  const style = StyleSheet.flatten(node.props.style as ViewStyle) as
    | ViewStyle
    | undefined;
  return typeof style?.opacity === 'number' ? style.opacity : undefined;
}

const wrappers = (tree: Tree) =>
  tree.findAll((node) => opacityOf(node) !== undefined);

/** The text of every block inside a fade wrapper. */
const faded = (tree: Tree) => wrappers(tree).map((node) => textOf(node));

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
/**
 * Appends with a leading flush: the web schedule flushes the first append of
 * a 16 ms window at once, so the window is let run out first.
 */
const append = async (chunk: string) => {
  await advance(20);
  await act(async () => probe.current.append(chunk));
};

/**
 * React Native's Jest setup makes these `jest.fn()`s already, so `spyOn`
 * returns the shared mock: reset it per test.
 */
const a11y = AccessibilityInfo as unknown as {
  isReduceMotionEnabled: jest.Mock;
  addEventListener: jest.Mock;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'web');
  resetReduceMotionCache();
  a11y.isReduceMotionEnabled.mockReset().mockResolvedValue(false);
  a11y.addEventListener
    .mockReset()
    .mockImplementation(() => ({ remove: jest.fn() }));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('animation off', () => {
  it.each(['default', 'none'] as const)(
    '%s: no wrapper, and the same tree as the plain path',
    async (animation) => {
      const tree = await renderTree(
        animation === 'default' ? <Unanimated /> : <Streamed animation="none" />
      );
      await append('One.\n\nTwo.\n\nThree');
      await advance(100);
      expect(wrappers(tree)).toHaveLength(0);
      // The same table through a handle with no stream state: today's path.
      const plain = await renderTree(
        <Markdown
          document={createDocument(tableOf(probe.current.document))}
          components={components}
        />
      );
      expect(tree.toJSON()).toEqual(plain.toJSON());
    }
  );

  it('does not watch Reduce Motion', async () => {
    await renderTree(<Streamed animation="none" />);
    await append('One.\n\nTwo');
    expect(a11y.addEventListener).not.toHaveBeenCalled();
    expect(a11y.isReduceMotionEnabled).not.toHaveBeenCalled();
  });
});

describe('animation fade', () => {
  it('fades only blocks that appear in a live update, once, over 200 ms', async () => {
    const tree = await renderTree(<Streamed />);
    await append('First para.\n\nSecond');
    expect(faded(tree)).toEqual(['First para.', 'Second']);
    expect(wrappers(tree).map(opacityOf)).toEqual([0, 0]);
    await advance(100);
    expect(opacityOf(wrappers(tree)[0]!)).toBeCloseTo(0.5, 1);
    await advance(150);
    expect(wrappers(tree).map(opacityOf)).toEqual([1, 1]);

    // Growing the open block adds no wrapper; a new block gets one.
    await append(' para.\n\nThird');
    expect(faded(tree)).toEqual(['First para.', 'Second para.', 'Third']);
    expect(opacityOf(wrappers(tree)[2]!)).toBe(0);
  });

  it('does not fade blocks present when <Markdown> first renders', async () => {
    const tree = await renderTree(<Streamed show={false} />);
    await append('Before one.\n\nBefore two.\n\n');
    await tree.rerender(<Streamed show />);
    expect(textOf(tree.container)).toContain('Before two.');
    expect(wrappers(tree)).toHaveLength(0);
    await append('After.');
    expect(faded(tree)).toEqual(['After.']);
  });

  it('does not fade what done() reveals, and remounts nothing', async () => {
    const tree = await renderTree(<Streamed />);
    await append('Para.\n\n| a | b |\n');
    // A table header waits for its delimiter row (P2b-3): hidden while live.
    const para = tree.find('Paragraph');
    expect(textOf(tree.container)).toBe('Para.');
    await act(async () => probe.current.done());
    // At done() it is a paragraph, new but not faded.
    expect(textOf(tree.container)).toContain('| a | b |');
    expect(tree.findAll('Paragraph')).toHaveLength(2);
    expect(faded(tree)).toEqual(['Para.']);
    expect(tree.findAll('Paragraph')[0]).toBe(para);
    // Text appended after done() does not fade either.
    await append('\n\nLate.');
    expect(textOf(tree.container)).toContain('Late.');
    expect(faded(tree)).toEqual(['Para.']);
  });

  it('reset(): no fade until genuinely new blocks appear', async () => {
    const tree = await renderTree(<Streamed />);
    await append('A.\n\nB.');
    expect(faded(tree)).toEqual(['A.', 'B.']);
    await act(async () => probe.current.reset('X.\n\nY.\n\nZ.\n\n'));
    // Blocks 0 and 1 stay mounted (keyed by index) with their old wrapper;
    // block 2 is new but arrived with the reset: no fade.
    expect(wrappers(tree)).toHaveLength(2);
    expect(textOf(tree.container)).toContain('Z.');
    await append('New.');
    expect(faded(tree)).toEqual(['X.', 'Y.', 'New.']);
  });

  it('reset() after done() fades again in the next stream', async () => {
    const tree = await renderTree(<Streamed />);
    await append('A.');
    await act(async () => probe.current.done());
    await act(async () => probe.current.reset());
    expect(textOf(tree.container)).toBe('');
    await append('B.');
    expect(faded(tree)).toEqual(['B.']);
  });

  it('takes a custom duration', async () => {
    const tree = await renderTree(
      <Streamed animation={{ type: 'fade', duration: 400 }} />
    );
    await append('Slow.');
    await advance(200);
    expect(opacityOf(wrappers(tree)[0]!)).toBeCloseTo(0.5, 1);
    await advance(250);
    expect(opacityOf(wrappers(tree)[0]!)).toBe(1);
  });

  it.each([
    [{ type: 'fade' } as const, 200],
    [{ type: 'fade', duration: 0 } as const, null],
    [{ type: 'fade', duration: -5 } as const, null],
  ])('%j: duration %s', async (animation, duration) => {
    const timing = jest.spyOn(Animated, 'timing');
    await renderTree(<Streamed animation={animation} />);
    await append('Text.');
    if (duration === null) expect(timing).not.toHaveBeenCalled();
    else expect(timing.mock.calls[0]![1].duration).toBe(duration);
  });

  it.each([
    ['ios', true],
    ['android', true],
    ['web', false],
  ] as const)('%s: useNativeDriver %s, no warning', async (os, native) => {
    jest.replaceProperty(Platform, 'OS', os);
    const warn = jest.spyOn(console, 'warn');
    const error = jest.spyOn(console, 'error');
    const timing = jest.spyOn(Animated, 'timing');
    await renderTree(<Streamed />);
    await append('Text.');
    await advance(20); // one frame on native
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0]![1]).toMatchObject({
      toValue: 1,
      duration: 200,
      useNativeDriver: native,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('Reduce Motion', () => {
  function mockReduceMotion(initial: boolean) {
    let handler: ((value: boolean) => void) | null = null;
    const remove = jest.fn();
    a11y.isReduceMotionEnabled.mockResolvedValue(initial);
    a11y.addEventListener.mockImplementation(
      (event: string, fn: (value: boolean) => void) => {
        if (event === 'reduceMotionChanged') handler = fn;
        return { remove };
      }
    );
    const change = (value: boolean) => act(async () => handler!(value));
    return { listen: a11y.addEventListener, remove, change };
  }

  it('no fade before the setting is known', async () => {
    a11y.isReduceMotionEnabled.mockReturnValue(new Promise(() => {}));
    const tree = await renderTree(<Streamed />);
    await act(async () => probe.current.append('First.\n\nSecond.'));
    expect(textOf(tree.container)).toContain('Second.');
    expect(wrappers(tree)).toHaveLength(0);
  });

  it('turns the fade off, follows changes, and cleans up', async () => {
    const { listen, remove, change } = mockReduceMotion(true);
    const tree = await renderTree(<Streamed />);
    expect(listen).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function)
    );
    await append('One.\n\nTwo.\n\n');
    expect(wrappers(tree)).toHaveLength(0);
    await change(false);
    await append('Three.');
    expect(faded(tree)).toEqual(['Three.']);
    await change(true);
    await append('\n\nFour.');
    expect(faded(tree)).toEqual(['Three.']);
    expect(remove).not.toHaveBeenCalled();
    await tree.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('containers', () => {
  it.each(['plain', 'scroll', 'scroll-ref', 'virtualize', 'hook'] as const)(
    '%s: new blocks fade, earlier ones do not',
    async (mode) => {
      const tree = await renderTree(<Streamed show={false} mode={mode} />);
      await append('Old.\n\n');
      await tree.rerender(<Streamed show mode={mode} />);
      await append('New one.\n\nNew two.');
      // A list mounts new cells in a later batch, within the mount window.
      await advance(100);
      expect(textOf(tree.container)).toContain('New two.');
      expect(faded(tree)).toEqual(['New one.', 'New two.']);
      await advance(200);
      expect(wrappers(tree).map(opacityOf)).toEqual([1, 1]);
    }
  );

  it('virtualize: blocks that mount later by a scroll do not fade', async () => {
    function Windowed() {
      const stream = useMarkdownStream({
        streamingConfig: { animation: 'fade' },
      });
      useEffect(() => {
        probe.current = stream;
      });
      return (
        <Markdown
          document={stream.document}
          components={components}
          virtualize={{ initialNumToRender: 3, windowSize: 3 }}
        />
      );
    }
    const COUNT = 40;
    const tree = await renderTree(<Windowed />);
    const root = rootOf(tree);
    let text = '';
    for (let i = 0; i < COUNT; i++) text += `Block ${i}.\n\n`;
    await append(text);
    await layOutList(root, COUNT);
    const early = faded(tree);
    // More than the 3 cells of the first commit: cells the next layout batch
    // mounts, within the window, fade too.
    expect(early.length).toBeGreaterThan(3);
    expect(early).not.toContain('Block 30.');
    // Long after their birth, blocks scrolled into view mount without a fade.
    await advance(1000);
    await scrollListTo(root, 3000, COUNT);
    expect(textOf(tree.container)).toContain('Block 30.');
    expect(faded(tree)).not.toContain('Block 30.');
    expect(faded(tree).every((t) => early.includes(t))).toBe(true);
  });
});

describe('StrictMode', () => {
  it('fades new blocks and keeps the wrapper', async () => {
    const tree = await renderTree(
      <StrictMode>
        <Streamed />
      </StrictMode>
    );
    await append('One.\n\nTwo');
    expect(faded(tree)).toEqual(['One.', 'Two']);
    await advance(300);
    expect(wrappers(tree).map(opacityOf)).toEqual([1, 1]);
  });
});

describe('switching documents', () => {
  it('a parse() document after a stream renders plain blocks', async () => {
    function Switch({ doc }: { readonly doc?: MarkdownDocument }) {
      const stream = useMarkdownStream({
        streamingConfig: { animation: 'fade' },
      });
      useEffect(() => {
        probe.current = stream;
      });
      return (
        <Markdown document={doc ?? stream.document} components={components} />
      );
    }
    const tree = await renderTree(<Switch />);
    await append('Streamed.');
    expect(faded(tree)).toEqual(['Streamed.']);
    await tree.rerender(
      <Switch doc={createDocument(tableOf(probe.current.document))} />
    );
    expect(wrappers(tree)).toHaveLength(0);
  });
});
