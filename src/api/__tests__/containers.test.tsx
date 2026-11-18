/**
 * The owned scroll containers (P3-2, P3-4): `scroll` renders every block in
 * one `ScrollView`, `virtualize` a `FlatList` that mounts a window of
 * blocks. Both render the same blocks as the default `View`, take a
 * component slot, and stream with only the open block re-rendering.
 * Spec: docs/rewrite/phase-3/virtualization.md
 */
import { createElement, createRef, useEffect, type ReactNode } from 'react';
import { Animated, FlatList, ScrollView, Text } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type JsonElement,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import type { Components } from '../../render/elements';
import { ELEMENT_NAMES } from '../../theme';
import { LIST_DEFAULTS } from '../containers';
import { Markdown, type MarkdownProps } from '../Markdown';
import {
  AUTO_SCROLL_THROTTLE,
  SCROLL_RETRY_LIMIT,
  SCROLL_RETRY_MS,
} from '../scrollControl';
import type {
  MarkdownListComponentProps,
  MarkdownListRef,
  MarkdownScrollComponentProps,
  ScrollOptions,
} from '../scrollOptions';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const SOURCE = [
  '# Title',
  'Some *text* and a [link](https://example.com).',
  '> quoted',
  '- a\n- b',
  '```js\ncode\n```',
  '---',
  '| a | b |\n|---|---|\n| 1 | 2 |',
  'Note[^1].\n\n[^1]: The note.',
].join('\n\n');

/** 100 paragraphs: more than any initial window. */
const LONG = Array.from({ length: 100 }, (_, i) => `Block ${i}.`).join('\n\n');

const components = hostComponents();
const ELEMENTS = new Set<string>(ELEMENT_NAMES);

/** Top-level element hosts below `node` (as `hostComponents()` names them). */
function topBlocks(node: TestInstance): JsonElement[] {
  const out: JsonElement[] = [];
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (ELEMENTS.has(child.type)) out.push(child.toJSON()!);
    else out.push(...topBlocks(child));
  }
  return out;
}

/** The single host element at the root. */
function rootOf(tree: Tree): TestInstance {
  const [root, ...rest] = tree.container.children;
  expect(rest).toHaveLength(0);
  if (typeof root !== 'object') throw new Error('no root element');
  return root;
}

const mount = (props: MarkdownProps) =>
  renderTree(<Markdown components={components} {...props} />);

const scrollEvent = (y: number, content = 2000, viewport = 600) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 300, height: content },
    layoutMeasurement: { width: 300, height: viewport },
    contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    zoomScale: 1,
  },
  timeStamp: 1,
});

async function fireScroll(host: TestInstance, y: number) {
  await act(async () => {
    (host.props as { onScroll(e: unknown): void }).onScroll(scrollEvent(y));
  });
}

/** Whether a component of type `type` rendered `host`. */
function renderedBy(host: TestInstance, type: unknown): boolean {
  type Fiber = { type: unknown; return: Fiber | null };
  let fiber = host.unstable_fiber as Fiber | null;
  for (; fiber !== null; fiber = fiber.return) {
    if (fiber.type === type) return true;
  }
  return false;
}

const paragraphs = (tree: Tree) => tree.findAll('Paragraph').map(textOf);

describe('default container', () => {
  it('is a View, and scroll={false} / virtualize={false} change nothing', async () => {
    const plain = await mount({ source: SOURCE });
    expect(rootOf(plain).type).toBe('View');
    const json = plain.toJSON();
    expect((await mount({ source: SOURCE, scroll: false })).toJSON()).toEqual(
      json
    );
    expect(
      (await mount({ source: SOURCE, virtualize: false })).toJSON()
    ).toEqual(json);
  });
});

describe('scroll', () => {
  it('renders every block in one ScrollView, as the View does', async () => {
    const scroll = await mount({ source: LONG, scroll: true });
    const root = rootOf(scroll);
    expect(root.type).toBe('RCTScrollView');
    expect(renderedBy(root, ScrollView)).toBe(true);
    expect(renderedBy(root, FlatList)).toBe(false);
    expect(root.children).toHaveLength(1); // the content container
    expect(paragraphs(scroll)).toHaveLength(100);

    const plain = await mount({ source: SOURCE });
    const scrolled = await mount({ source: SOURCE, scroll: true });
    expect(topBlocks(scrolled.container)).toEqual(topBlocks(plain.container));
  });

  it('renders the default elements with the same text', async () => {
    const plain = await renderTree(<Markdown source={SOURCE} />);
    const scrolled = await renderTree(<Markdown source={SOURCE} scroll />);
    expect(textOf(scrolled.container)).toBe(textOf(plain.container));
  });

  it.each([{ scroll: true }, { virtualize: true }] as const)(
    'keeps the horizontal code and table scrollers unchanged (%o)',
    async (container) => {
      const horizontal = (tree: Tree) =>
        tree
          .findAll((n) => n.type === 'RCTScrollView' && n.props.horizontal)
          // JSON text: `onLayout` closures differ between mounts.
          .map((n) => JSON.stringify(n.toJSON()));
      const plain = await renderTree(<Markdown source={SOURCE} />);
      const inner = horizontal(plain);
      expect(inner).toHaveLength(2); // code block, table
      const tree = await renderTree(
        <Markdown source={SOURCE} {...container} />
      );
      expect(horizontal(tree)).toEqual(inner);
      // The outer scroller sets nothing that reaches them.
      expect(rootOf(tree).props.horizontal).toBeUndefined();
      expect(rootOf(tree).props.nestedScrollEnabled).toBeUndefined();
    }
  );

  it('applies header, footer and styles', async () => {
    const tree = await mount({
      source: 'a\n\nb',
      scroll: {
        header: <Text testID="header">top</Text>,
        footer: <Text testID="footer">end</Text>,
        style: { flex: 1 },
        contentContainerStyle: { padding: 16 },
      },
    });
    const root = rootOf(tree);
    expect(root.props.style).toEqual({ flex: 1 });
    expect(root.props.contentContainerStyle).toEqual({ padding: 16 });
    const content = root.children[0] as TestInstance;
    expect(
      content.children.map((c) =>
        typeof c === 'string' ? c : (c.props.testID ?? c.type)
      )
    ).toEqual(['header', 'Paragraph', 'Paragraph', 'footer']);
  });

  it('calls the scroll callback with the throttle passed through', async () => {
    const onScroll = jest.fn();
    const tree = await mount({
      source: 'a',
      scroll: { onScroll, scrollEventThrottle: 32 },
    });
    const root = rootOf(tree);
    expect(root.props.scrollEventThrottle).toBe(32);
    await fireScroll(root, 42);
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll.mock.calls[0][0].nativeEvent.contentOffset.y).toBe(42);
  });

  it('renders the component slot: Animated.ScrollView', async () => {
    const offset = new Animated.Value(0);
    const tree = await mount({
      source: 'a\n\nb',
      scroll: {
        component: Animated.ScrollView,
        onScroll: Animated.event(
          [{ nativeEvent: { contentOffset: { y: offset } } }],
          { useNativeDriver: false }
        ),
      },
    });
    expect(rootOf(tree).type).toBe('RCTScrollView');
    expect(renderedBy(rootOf(tree), Animated.ScrollView)).toBe(true);
    expect(paragraphs(tree)).toEqual(['a', 'b']);
    await fireScroll(rootOf(tree), 42);
    expect((offset as unknown as { __getValue(): number }).__getValue()).toBe(
      42
    );
  });

  it('renders the component slot: a custom wrapper', async () => {
    const received: MarkdownScrollComponentProps[] = [];
    function Wrapper(props: MarkdownScrollComponentProps) {
      received.push(props);
      return <ScrollView {...props} testID="wrapper" />;
    }
    const tree = await mount({
      source: 'a\n\nb',
      scroll: { component: Wrapper, contentContainerStyle: { padding: 2 } },
    });
    expect(rootOf(tree).props.testID).toBe('wrapper');
    expect(paragraphs(tree)).toEqual(['a', 'b']);
    expect(received.at(-1)!.contentContainerStyle).toEqual({ padding: 2 });
  });
});

describe('virtualize', () => {
  it('renders a FlatList that mounts only the initial window', async () => {
    const tree = await mount({ source: LONG, virtualize: true });
    const root = rootOf(tree);
    expect(root.type).toBe('RCTScrollView');
    expect(renderedBy(root, FlatList)).toBe(true);
    expect(root.props.data).toHaveLength(100);
    expect(paragraphs(tree)).toHaveLength(LIST_DEFAULTS.initialNumToRender);
    expect(paragraphs(tree)[0]).toBe('Block 0.');
  });

  it('uses the documented defaults, with removeClippedSubviews off', async () => {
    expect(LIST_DEFAULTS).toEqual({
      initialNumToRender: 10,
      windowSize: 11,
      removeClippedSubviews: false,
    });
    const root = rootOf(await mount({ source: LONG, virtualize: true }));
    expect(root.props.windowSize).toBe(11);
    expect(root.props.initialNumToRender).toBe(10);
    expect(root.props.removeClippedSubviews).toBe(false);
  });

  it('passes the tuning options through', async () => {
    const tree = await mount({
      source: LONG,
      virtualize: { initialNumToRender: 4, windowSize: 3 },
    });
    expect(paragraphs(tree)).toHaveLength(4);
    expect(rootOf(tree).props.windowSize).toBe(3);
  });

  it('works alone, with scroll, and with scroll={false}', async () => {
    for (const scroll of [undefined, true, false]) {
      const tree = await mount({ source: 'a\n\nb', scroll, virtualize: true });
      expect(rootOf(tree).props.data).toHaveLength(2);
      expect(paragraphs(tree)).toEqual(['a', 'b']);
    }
  });

  it('renders the same blocks as the View', async () => {
    const plain = await mount({ source: SOURCE });
    const list = await mount({ source: SOURCE, virtualize: true });
    expect(topBlocks(list.container)).toEqual(topBlocks(plain.container));
    const defaults = await renderTree(<Markdown source={SOURCE} virtualize />);
    const view = await renderTree(<Markdown source={SOURCE} />);
    expect(textOf(defaults.container)).toBe(textOf(view.container));
  });

  it('applies header, footer, styles and the scroll callback', async () => {
    const onScroll = jest.fn();
    const tree = await mount({
      source: 'a',
      virtualize: {
        header: <Text testID="header">top</Text>,
        footer: <Text testID="footer">end</Text>,
        style: { flex: 1 },
        contentContainerStyle: { padding: 16 },
        onScroll,
        scrollEventThrottle: 32,
      },
    });
    const root = rootOf(tree);
    expect(tree.findAll((n) => n.props.testID === 'header')).toHaveLength(1);
    expect(tree.findAll((n) => n.props.testID === 'footer')).toHaveLength(1);
    expect(textOf(root)).toBe('topaend');
    expect(root.props.style).toEqual({ flex: 1 });
    expect(root.props.contentContainerStyle).toEqual({ padding: 16 });
    expect(root.props.scrollEventThrottle).toBe(32);
    await fireScroll(root, 42);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('merges scroll options under virtualize options, field by field', async () => {
    const onScroll = jest.fn();
    const tree = await mount({
      source: 'a',
      scroll: {
        header: <Text testID="scroll-header">h</Text>,
        footer: <Text testID="scroll-footer">f</Text>,
        contentContainerStyle: { padding: 1 },
        onScroll,
      },
      virtualize: {
        footer: <Text testID="virtualize-footer">F</Text>,
        contentContainerStyle: { padding: 2 },
        initialNumToRender: 5,
      },
    });
    const root = rootOf(tree);
    const ids = tree
      .findAll((n) => typeof n.props.testID === 'string')
      .map((n) => n.props.testID);
    expect(ids).toEqual(['scroll-header', 'virtualize-footer']);
    expect(root.props.contentContainerStyle).toEqual({ padding: 2 });
    expect(root.props.initialNumToRender).toBe(5);
    await fireScroll(root, 1);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('never renders scroll.component as the list (untyped code)', async () => {
    const props = {
      source: 'a',
      scroll: { component: ScrollView },
      virtualize: true,
    } as unknown as MarkdownProps;
    const root = rootOf(await mount(props));
    expect(renderedBy(root, FlatList)).toBe(true);
    expect(root.props.data).toHaveLength(1);
  });

  it('renders the component slot: Animated.FlatList', async () => {
    const tree = await mount({
      source: LONG,
      virtualize: { component: Animated.FlatList, initialNumToRender: 3 },
    });
    expect(rootOf(tree).type).toBe('RCTScrollView');
    expect(renderedBy(rootOf(tree), Animated.FlatList)).toBe(true);
    expect(paragraphs(tree)).toEqual(['Block 0.', 'Block 1.', 'Block 2.']);
  });

  it('renders the component slot: a custom wrapper', async () => {
    const received: MarkdownListComponentProps[] = [];
    function Wrapper(props: MarkdownListComponentProps) {
      received.push(props);
      return <FlatList {...props} testID="wrapper" />;
    }
    const tree = await mount({
      source: 'a\n\nb',
      virtualize: { component: Wrapper },
    });
    expect(rootOf(tree).props.testID).toBe('wrapper');
    expect(paragraphs(tree)).toEqual(['a', 'b']);
    const props = received.at(-1)!;
    expect(props.data.map((item) => props.keyExtractor(item, 0))).toEqual([
      '0',
      '1',
    ]);
    expect(props.removeClippedSubviews).toBe(false);
  });
});

describe.each([
  ['scroll', { scroll: true }],
  ['virtualize', { virtualize: true }],
] as const)('streaming in %s mode', (_name, container) => {
  /** Paragraph renders, by text, since the last reset. */
  const renders: string[] = [];
  const spied = {
    Paragraph: ({ children }: { children?: ReactNode }) => {
      renders.push(String(children));
      return createElement('Paragraph', null, children);
    },
  } as unknown as Partial<Components>;

  const probe = {} as { current: UseMarkdownStreamResult };

  function Streamed() {
    const stream = useMarkdownStream();
    useEffect(() => {
      probe.current = stream;
    });
    return (
      <Markdown document={stream.document} components={spied} {...container} />
    );
  }

  const flush = async (chunk: string) => {
    renders.length = 0;
    await act(async () => probe.current.append(chunk));
    await act(() => jest.advanceTimersByTime(100));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    renders.length = 0;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates the open block on every flush and skips closed blocks', async () => {
    const root = await renderTree(<Streamed />);
    await flush('One.\n\nTwo.\n\nThr');
    expect(paragraphs(root)).toEqual(['One.', 'Two.', 'Thr']);

    for (const [chunk, tail] of [
      ['ee', 'Three'],
      [' and', 'Three and'],
      [' more.', 'Three and more.'],
    ] as const) {
      await flush(chunk);
      expect(paragraphs(root)).toEqual(['One.', 'Two.', tail]);
      expect(renders).toEqual([tail]);
    }

    await flush('\n\nFour');
    expect(paragraphs(root)).toEqual([
      'One.',
      'Two.',
      'Three and more.',
      'Four',
    ]);
    expect(renders).not.toContain('One.');
    expect(renders).not.toContain('Two.');
    expect(renders).toContain('Four');
  });
});

// -- Scroll control (#50): MarkdownListRef and follow-tail --------------------

/**
 * The scroll view's methods: React Native's Jest setup mocks `ScrollView`
 * with `jest.fn()` methods on its prototype, shared by every instance, and
 * `FlatList` scrolls through them. Both containers end in these calls.
 */
const scrollView = ScrollView.prototype as unknown as Record<
  'scrollTo' | 'scrollToEnd',
  jest.Mock
>;

type Mode = 'scroll' | 'virtualize';
const MODES: readonly Mode[] = ['scroll', 'virtualize'];
type Options = Omit<ScrollOptions, 'component'>;

/** `<Markdown>` props for `source` in `mode` with `options`. */
const propsIn = (mode: Mode, options: Options, source = LONG): MarkdownProps =>
  mode === 'scroll'
    ? { source, scroll: options }
    : { source, virtualize: options };

const mountIn = (mode: Mode, options: Options, source = LONG) =>
  mount(propsIn(mode, options, source));

async function fire(host: TestInstance, name: string, ...args: unknown[]) {
  await act(async () => {
    (host.props as Record<string, (...a: unknown[]) => void>)[name]!(...args);
  });
}

const layoutEvent = (y: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y, width: 300, height } },
});

/** Viewport `viewport`, content `content`: what a device reports on mount. */
async function laidOut(host: TestInstance, viewport: number, content: number) {
  await fire(host, 'onLayout', layoutEvent(0, viewport));
  await fire(host, 'onContentSizeChange', 300, content);
}

/** A drag from `from` to `to`, released with no fling. */
async function drag(
  host: TestInstance,
  from: number,
  to: number,
  content: number
) {
  await fire(host, 'onScrollBeginDrag', scrollEvent(from, content));
  await fire(host, 'onScroll', scrollEvent(to, content));
  await fire(host, 'onScrollEndDrag', scrollEvent(to, content));
}

const endCalls = () => scrollView.scrollToEnd.mock.calls.map((c) => c[0]);

describe('scroll control', () => {
  beforeEach(() => {
    scrollView.scrollTo.mockClear();
    scrollView.scrollToEnd.mockClear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each(MODES)('MarkdownListRef in %s mode', (mode) => {
    it('scrollToEnd and scrollToOffset call through', async () => {
      const ref = createRef<MarkdownListRef>();
      await mountIn(mode, { ref });
      ref.current!.scrollToEnd();
      ref.current!.scrollToEnd({ animated: false });
      expect(endCalls()).toEqual([{ animated: true }, { animated: false }]);
      // On a list with unmeasured blocks, `scrollToEnd` also jumps to an
      // estimate first (see "scrollToEnd on a list" below).
      scrollView.scrollTo.mockClear();

      ref.current!.scrollToOffset(120);
      ref.current!.scrollToOffset(-5, { animated: false });
      ref.current!.scrollToOffset(Number.NaN);
      expect(scrollView.scrollTo.mock.calls.map((c) => c[0])).toEqual([
        { y: 120, animated: true },
        { y: 0, animated: false },
      ]);
    });

    it('scrollToBlock does nothing with no blocks or a non-number', async () => {
      const ref = createRef<MarkdownListRef>();
      const tree = await mountIn(mode, { ref }, '');
      expect(() => ref.current!.scrollToBlock(0)).not.toThrow();
      expect(() => ref.current!.scrollToBlock(3)).not.toThrow();
      await tree.rerender(
        <Markdown components={components} {...propsIn(mode, { ref })} />
      );
      ref.current!.scrollToBlock(Number.NaN);
      expect(scrollView.scrollTo).not.toHaveBeenCalled();
    });

    it('passes the instance to componentRef, with ours still working', async () => {
      const componentRef = { current: null as unknown };
      const seen: unknown[] = [];
      const ref = createRef<MarkdownListRef>();
      await mountIn(mode, { componentRef, ref });
      const Expected = mode === 'scroll' ? ScrollView : FlatList;
      expect(componentRef.current).toBeInstanceOf(Expected);
      await mountIn(mode, {
        componentRef: (i: unknown) => {
          seen.push(i);
        },
      });
      expect(seen.at(-1)).toBeInstanceOf(Expected);
      ref.current!.scrollToEnd();
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
    });

    it('reaches the instance through Animated components in the slot', async () => {
      const componentRef = { current: null as unknown };
      const ref = createRef<MarkdownListRef>();
      if (mode === 'scroll') {
        await mount({
          source: LONG,
          scroll: { component: Animated.ScrollView, componentRef, ref },
        });
        expect(componentRef.current).toBeInstanceOf(ScrollView);
      } else {
        await mount({
          source: LONG,
          virtualize: { component: Animated.FlatList, componentRef, ref },
        });
        expect(componentRef.current).toBeInstanceOf(FlatList);
      }
      ref.current!.scrollToEnd({ animated: false });
      ref.current!.scrollToOffset(10);
      expect(endCalls()).toEqual([{ animated: false }]);
      expect(scrollView.scrollTo).toHaveBeenCalledWith({
        y: 10,
        animated: true,
      });
    });
  });

  describe('scrollToBlock in scroll mode', () => {
    /** Ten blocks of 100 px each, in a 600 px viewport. */
    async function measured() {
      const ref = createRef<MarkdownListRef>();
      const source = 'abcdefghij'.split('').join('\n\n');
      const tree = await mount({ source, scroll: { ref } });
      const root = rootOf(tree);
      const content = root.children[0] as TestInstance;
      const wrappers = content.children.filter(
        (c): c is TestInstance => typeof c !== 'string' && c.type === 'View'
      );
      expect(wrappers).toHaveLength(10);
      for (const [i, w] of wrappers.entries()) {
        await fire(w, 'onLayout', layoutEvent(i * 100, 100));
      }
      await laidOut(root, 600, 1000);
      scrollView.scrollTo.mockClear();
      return ref.current!;
    }

    const targets = () => scrollView.scrollTo.mock.calls.map((c) => c[0].y);

    it('lands on the measured offset, with viewPosition and viewOffset', async () => {
      const ref = await measured();
      ref.scrollToBlock(3);
      ref.scrollToBlock(3, { viewPosition: 0.5 });
      ref.scrollToBlock(3, { viewOffset: 10, animated: false });
      expect(scrollView.scrollTo.mock.calls.map((c) => c[0])).toEqual([
        { y: 300, animated: true },
        { y: 50, animated: true },
        { y: 290, animated: false },
      ]);
    });

    it('clamps to the end of the content and the index into range', async () => {
      const ref = await measured();
      ref.scrollToBlock(9); // y 900, but the end is 1000 - 600
      ref.scrollToBlock(42);
      ref.scrollToBlock(-3);
      ref.scrollToBlock(2.7);
      expect(targets()).toEqual([400, 400, 0, 200]);
    });

    it('does nothing for a block not laid out yet', async () => {
      const ref = createRef<MarkdownListRef>();
      await mount({ source: 'a\n\nb', scroll: { ref } });
      ref.current!.scrollToBlock(1);
      expect(scrollView.scrollTo).not.toHaveBeenCalled();
    });

    it('wraps blocks in a measuring View only with a ref', async () => {
      const plain = await mount({ source: SOURCE, scroll: true });
      const followed = await mount({
        source: SOURCE,
        scroll: { autoScroll: true },
      });
      expect(topBlocks(followed.container)).toEqual(topBlocks(plain.container));
      const content = (tree: Tree) =>
        (rootOf(tree).children[0] as TestInstance).children.map((c) =>
          typeof c === 'string' ? c : c.type
        );
      expect(content(followed)).toEqual(content(plain));
      const withRef = await mount({
        source: SOURCE,
        scroll: { ref: createRef<MarkdownListRef>() },
      });
      expect(topBlocks(withRef.container)).toEqual(topBlocks(plain.container));
      expect(new Set(content(withRef))).toEqual(new Set(['View']));
    });
  });

  describe('scrollToBlock in virtualize mode', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    /** LONG, with the first `count` cells measured at 50 px. */
    async function list(count: number) {
      const ref = createRef<MarkdownListRef>();
      const tree = await mount({ source: LONG, virtualize: { ref } });
      const root = rootOf(tree);
      await laidOut(root, 600, 5000);
      const content = root.children[0] as TestInstance;
      const cells = content.children.filter(
        (c): c is TestInstance => typeof c !== 'string' && !!c.props.onLayout
      );
      for (const [i, cell] of cells.slice(0, count).entries()) {
        await fire(cell, 'onLayout', layoutEvent(i * 50, 50));
      }
      scrollView.scrollTo.mockClear();
      const toIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const toOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
      return { ref: ref.current!, toIndex, toOffset, root };
    }

    /**
     * Makes `scrollToIndex` fail like a list that measures `step` more
     * blocks between attempts, until the target is measured.
     */
    function measuring(toIndex: jest.SpyInstance, from: number, step: number) {
      let measured = from;
      toIndex.mockImplementation(function (
        this: {
          props: {
            onScrollToIndexFailed?: (info: {
              index: number;
              averageItemLength: number;
              highestMeasuredFrameIndex: number;
            }) => void;
          };
        },
        params: { index: number }
      ) {
        if (params.index <= measured) return;
        const info = {
          index: params.index,
          averageItemLength: 50,
          highestMeasuredFrameIndex: measured,
        };
        measured += step;
        this.props.onScrollToIndexFailed?.(info);
      });
    }

    it('scrolls a measured block by index, with no retry', async () => {
      const { ref, toIndex } = await list(10);
      ref.scrollToBlock(2, { animated: false });
      expect(toIndex).toHaveBeenCalledWith({
        index: 2,
        animated: false,
        viewPosition: 0,
        viewOffset: 0,
      });
      expect(scrollView.scrollTo).toHaveBeenLastCalledWith({
        y: 100,
        animated: false,
      });
      await act(() => jest.advanceTimersByTime(10 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(1);
    });

    it('scrolls to an estimate for an unmeasured block, then retries, bounded', async () => {
      const { ref, toIndex, toOffset } = await list(10);
      ref.scrollToBlock(50);
      expect(toIndex).toHaveBeenCalledTimes(1);
      // averageItemLength (50) × index.
      expect(toOffset).toHaveBeenLastCalledWith({
        offset: 2500,
        animated: false,
      });
      for (let retry = 1; retry <= SCROLL_RETRY_LIMIT; retry++) {
        await act(() => jest.advanceTimersByTime(SCROLL_RETRY_MS));
        expect(toIndex).toHaveBeenCalledTimes(1 + retry);
        expect(toIndex).toHaveBeenLastCalledWith(
          expect.objectContaining({ index: 50, animated: true })
        );
      }
      await act(() => jest.advanceTimersByTime(10 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(1 + SCROLL_RETRY_LIMIT);
    });

    it('replaces a pending retry with a new call', async () => {
      const { ref, toIndex } = await list(10);
      ref.scrollToBlock(50);
      ref.scrollToBlock(3);
      await act(() => jest.advanceTimersByTime(10 * SCROLL_RETRY_MS));
      expect(toIndex.mock.calls.map((c) => c[0].index)).toEqual([50, 3]);
    });

    it('clamps out-of-range indices without throwing', async () => {
      const { ref, toIndex } = await list(10);
      expect(() => ref.scrollToBlock(1000)).not.toThrow();
      expect(() => ref.scrollToBlock(-1)).not.toThrow();
      expect(toIndex.mock.calls.map((c) => c[0].index)).toEqual([99, 0]);
    });

    // Seen on a device (S25 FE): a list measures unmeasured blocks in
    // batches, so a long jump fails many more times than a fixed retry
    // count allows, and stopped part-way.
    it('keeps retrying while the list measures further blocks', async () => {
      const { ref, toIndex } = await list(10);
      // 9 measured, 5 more per attempt: block 50 is measured on attempt 10.
      measuring(toIndex, 9, 5);
      ref.scrollToBlock(50);
      await act(() => jest.advanceTimersByTime(50 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(10);
      expect(toIndex.mock.calls.length).toBeGreaterThan(1 + SCROLL_RETRY_LIMIT);
    });

    it('stops retrying when the list measures nothing further', async () => {
      const { ref, toIndex } = await list(10);
      measuring(toIndex, 9, 0);
      ref.scrollToBlock(50);
      await act(() => jest.advanceTimersByTime(50 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(1 + SCROLL_RETRY_LIMIT);
    });

    it('scrollToEnd reaches the last block by index, then the end', async () => {
      const { ref, toIndex } = await list(10);
      measuring(toIndex, 9, 30);
      ref.scrollToEnd();
      expect(toIndex).toHaveBeenLastCalledWith({
        index: 99,
        animated: true,
        viewPosition: 1,
        viewOffset: 0,
      });
      // At once: the end as the list knows it now.
      expect(endCalls()).toEqual([{ animated: true }]);
      await act(() => jest.advanceTimersByTime(50 * SCROLL_RETRY_MS));
      // 9, 39, 69, 99: measured on the fourth attempt, then the true end.
      expect(toIndex).toHaveBeenCalledTimes(4);
      expect(endCalls()).toEqual([{ animated: true }, { animated: true }]);
    });

    it('scrollToEnd still scrolls to the end when the list stalls', async () => {
      const { ref, toIndex } = await list(10);
      measuring(toIndex, 9, 0);
      ref.scrollToEnd();
      await act(() => jest.advanceTimersByTime(50 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(1 + SCROLL_RETRY_LIMIT);
      expect(endCalls()).toEqual([{ animated: true }, { animated: false }]);
    });

    it('a drag or scrollToOffset cancels the pending retries', async () => {
      const { ref, toIndex, root } = await list(10);
      measuring(toIndex, 9, 1);
      ref.scrollToBlock(50);
      await fire(root, 'onScrollBeginDrag', scrollEvent(0, 5000));
      await act(() => jest.advanceTimersByTime(50 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(1);

      ref.scrollToEnd();
      ref.scrollToOffset(0);
      await act(() => jest.advanceTimersByTime(50 * SCROLL_RETRY_MS));
      expect(toIndex).toHaveBeenCalledTimes(2);
    });
  });

  describe.each(MODES)('autoScroll in %s mode', (mode) => {
    const follow = async (options: Options = { autoScroll: true }) =>
      rootOf(await mountIn(mode, options));

    it('starts at the bottom and follows growth, not animated', async () => {
      const root = await follow();
      await laidOut(root, 600, 1000);
      expect(endCalls()).toEqual([{ animated: false }]);
      await fire(root, 'onScroll', scrollEvent(400, 1000));
      await fire(root, 'onContentSizeChange', 300, 1200);
      await fire(root, 'onContentSizeChange', 300, 1300);
      expect(endCalls()).toEqual(Array(3).fill({ animated: false }));
    });

    it('pauses when the user drags away, and resumes on return', async () => {
      const root = await follow();
      await laidOut(root, 600, 1000);
      await drag(root, 400, 100, 1000);
      await fire(root, 'onContentSizeChange', 300, 1400);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      // Back to 20 px from the end (default threshold 40).
      await drag(root, 100, 780, 1400);
      await fire(root, 'onContentSizeChange', 300, 1600);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(2);
    });

    it('never scrolls while the user is dragging or flinging', async () => {
      const root = await follow();
      await laidOut(root, 600, 1000);
      await fire(root, 'onScrollBeginDrag', scrollEvent(400, 1000));
      await fire(root, 'onContentSizeChange', 300, 1100);
      await fire(root, 'onScrollEndDrag', scrollEvent(480, 1100));
      await fire(root, 'onMomentumScrollBegin', scrollEvent(480, 1100));
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      // A fling that ends away from the end pauses.
      await fire(root, 'onScroll', scrollEvent(200, 1200));
      await fire(root, 'onMomentumScrollEnd', scrollEvent(100, 1200));
      await fire(root, 'onContentSizeChange', 300, 1300);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
    });

    it('honors a custom threshold', async () => {
      const near = async (autoScroll: Options['autoScroll']) => {
        scrollView.scrollToEnd.mockClear();
        const root = await follow({ autoScroll });
        await laidOut(root, 600, 1000);
        await drag(root, 400, 320, 1000); // 80 px from the end
        await fire(root, 'onContentSizeChange', 300, 1100);
        return scrollView.scrollToEnd.mock.calls.length;
      };
      expect(await near(true)).toBe(1);
      expect(await near({ threshold: 100 })).toBe(2);
    });

    it('does not read its own scrolls as the user leaving', async () => {
      const root = await follow();
      await laidOut(root, 600, 1000);
      // Content grew, the scroll lags: not at the end, but not the user.
      await fire(root, 'onScroll', scrollEvent(400, 1500));
      await fire(root, 'onScroll', scrollEvent(700, 1500));
      await fire(root, 'onContentSizeChange', 300, 1600);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(2);
    });

    it('pauses on an upward scroll that is not a drag (wheel, web)', async () => {
      const root = await follow();
      await laidOut(root, 600, 1000);
      await fire(root, 'onScroll', scrollEvent(400, 1000));
      await fire(root, 'onScroll', scrollEvent(200, 1000));
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      // Scrolling back down to the end resumes.
      await fire(root, 'onScroll', scrollEvent(590, 1200));
      await fire(root, 'onContentSizeChange', 300, 1300);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(2);
    });

    it('survives shrinking content, resizes and short content', async () => {
      const root = await follow();
      await laidOut(root, 600, 300); // shorter than the viewport
      await fire(root, 'onContentSizeChange', 300, 500);
      expect(scrollView.scrollToEnd).not.toHaveBeenCalled();
      await fire(root, 'onContentSizeChange', 300, 900);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      // Shrinks: the scroll view clamps to the new end, still pinned.
      await fire(root, 'onContentSizeChange', 300, 800);
      await fire(root, 'onScroll', scrollEvent(200, 800));
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      // The keyboard shrinks the viewport: keep the end in view.
      await fire(root, 'onLayout', layoutEvent(0, 300));
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(2);
      await fire(root, 'onContentSizeChange', 300, 1000);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(3);
    });

    it('resumes on ref.scrollToEnd, pauses on scrollToOffset away', async () => {
      const ref = createRef<MarkdownListRef>();
      const root = await follow({ autoScroll: true, ref });
      await laidOut(root, 600, 1000);
      await drag(root, 400, 0, 1000);
      ref.current!.scrollToEnd({ animated: false });
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(3);
      ref.current!.scrollToOffset(100);
      await fire(root, 'onContentSizeChange', 300, 1400);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(3);
    });

    it('keeps calling a function onScroll', async () => {
      const onScroll = jest.fn();
      const root = await follow({ autoScroll: true, onScroll });
      await laidOut(root, 600, 1000);
      await drag(root, 400, 100, 1000);
      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onScroll.mock.calls[0][0].nativeEvent.contentOffset.y).toBe(100);
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1); // paused
    });
  });

  describe.each(MODES)('scroll props in %s mode', (mode) => {
    /** The props the slot receives with `options`, and the host. */
    async function propsWith(options: Options, animated = false) {
      const received: Record<string, unknown>[] = [];
      function SpyScroll(props: MarkdownScrollComponentProps) {
        received.push({ ...props });
        const Scroll = animated ? Animated.ScrollView : ScrollView;
        return <Scroll {...props} />;
      }
      function SpyList(props: MarkdownListComponentProps) {
        received.push({ ...props });
        const List = animated ? Animated.FlatList : FlatList;
        return <List {...props} />;
      }
      const tree = await mount(
        mode === 'scroll'
          ? { source: 'a', scroll: { ...options, component: SpyScroll } }
          : { source: 'a', virtualize: { ...options, component: SpyList } }
      );
      return { props: received.at(-1)!, root: rootOf(tree) };
    }
    const own = [
      'onContentSizeChange',
      'onLayout',
      'onMomentumScrollBegin',
      'onMomentumScrollEnd',
      'onScrollBeginDrag',
      'onScrollEndDrag',
      'onScrollToIndexFailed',
      'ref',
    ];

    it('are exactly the user options with autoScroll off and no ref', async () => {
      const onScroll = jest.fn();
      for (const options of [{}, { autoScroll: false, onScroll }]) {
        const { props, root } = await propsWith(options);
        expect(Object.keys(props).sort()).toEqual(
          mode === 'scroll'
            ? [
                'children',
                'contentContainerStyle',
                // Dev only: the nested-scroller warning (devWarnings.test).
                'onContentSizeChange',
                'onLayout',
                'onScroll',
                'scrollEventThrottle',
                'style',
              ]
            : [
                'ListFooterComponent',
                'ListHeaderComponent',
                'contentContainerStyle',
                'data',
                'initialNumToRender',
                'keyExtractor',
                'onScroll',
                'removeClippedSubviews',
                'renderItem',
                'scrollEventThrottle',
                'style',
                'windowSize',
              ]
        );
        expect(props.onScroll).toBe(
          'onScroll' in options ? options.onScroll : undefined
        );
        // FlatList has its own handlers; `scroll` has the dev warning's.
        await laidOut(root, 600, 1000);
        await fire(root, 'onContentSizeChange', 300, 2000);
      }
      expect(scrollView.scrollToEnd).not.toHaveBeenCalled();
    });

    it('add the follow-tail handlers with autoScroll', async () => {
      const { props } = await propsWith({ autoScroll: true });
      for (const name of own.filter((n) => n !== 'onScrollToIndexFailed')) {
        expect(props).toHaveProperty(name);
      }
      expect(props).not.toHaveProperty('onScrollToIndexFailed');
      expect(typeof props.onScroll).toBe('function');
      expect(props.scrollEventThrottle).toBe(AUTO_SCROLL_THROTTLE);
      const given = await propsWith({
        autoScroll: true,
        scrollEventThrottle: 50,
      });
      expect(given.props.scrollEventThrottle).toBe(50);
    });

    it('pass a non-function onScroll through untouched', async () => {
      const offset = new Animated.Value(0);
      const nativeDriven = Animated.event(
        [{ nativeEvent: { contentOffset: { y: offset } } }],
        { useNativeDriver: true }
      );
      expect(typeof nativeDriven).toBe('object');
      const { props } = await propsWith(
        { autoScroll: true, onScroll: nativeDriven },
        true
      );
      expect(props.onScroll).toBe(nativeDriven);
      // A Reanimated handler: a function object with `workletEventHandler`.
      const worklet = Object.assign(jest.fn(), { workletEventHandler: {} });
      const second = await propsWith({ autoScroll: true, onScroll: worklet });
      expect(second.props.onScroll).toBe(worklet);
    });

    it('follow from drag ends when onScroll is not a function', async () => {
      const worklet = Object.assign(jest.fn(), { workletEventHandler: {} });
      const { root } = await propsWith({ autoScroll: true, onScroll: worklet });
      await laidOut(root, 600, 1000);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      await fire(root, 'onScrollBeginDrag', scrollEvent(400, 1000));
      await fire(root, 'onScrollEndDrag', scrollEvent(100, 1000));
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      await fire(root, 'onScrollBeginDrag', scrollEvent(100, 1200));
      await fire(root, 'onScrollEndDrag', scrollEvent(590, 1200));
      await fire(root, 'onContentSizeChange', 300, 1300);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(2);
    });
  });

  describe('scroll and virtualize option merging', () => {
    it('takes autoScroll and ref from scroll under virtualize', async () => {
      const ref = createRef<MarkdownListRef>();
      const root = rootOf(
        await mount({
          source: LONG,
          scroll: { autoScroll: true, ref },
          virtualize: { initialNumToRender: 3 },
        })
      );
      expect(renderedBy(root, FlatList)).toBe(true);
      await laidOut(root, 600, 1000);
      expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(1);
      ref.current!.scrollToOffset(5);
      expect(scrollView.scrollTo).toHaveBeenCalledWith({
        y: 5,
        animated: true,
      });
    });

    it('lets virtualize win, field by field', async () => {
      const scrollRef = createRef<MarkdownListRef>();
      const listRef = createRef<MarkdownListRef>();
      const root = rootOf(
        await mount({
          source: LONG,
          scroll: { autoScroll: true, ref: scrollRef },
          virtualize: { autoScroll: false, ref: listRef },
        })
      );
      await laidOut(root, 600, 1000);
      expect(scrollView.scrollToEnd).not.toHaveBeenCalled();
      expect(scrollRef.current).toBeNull();
      expect(listRef.current).not.toBeNull();
    });
  });

  describe.each(MODES)('streaming with autoScroll in %s mode', (mode) => {
    const renders: string[] = [];
    const spied = {
      Paragraph: ({ children }: { children?: ReactNode }) => {
        renders.push(String(children));
        return createElement('Paragraph', null, children);
      },
    } as unknown as Partial<Components>;
    const probe = {} as { current: UseMarkdownStreamResult };
    const ref = createRef<MarkdownListRef>();

    function Streamed() {
      const stream = useMarkdownStream();
      useEffect(() => {
        probe.current = stream;
      });
      const options = { autoScroll: true, ref };
      return (
        <Markdown
          document={stream.document}
          components={spied}
          {...(mode === 'scroll'
            ? { scroll: options }
            : { virtualize: options })}
        />
      );
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('scrolls once per growth and re-renders only the open block', async () => {
      const tree = await renderTree(<Streamed />);
      const root = rootOf(tree);
      await laidOut(root, 500, 0);
      let height = 200;
      const flush = async (chunk: string) => {
        renders.length = 0;
        await act(async () => probe.current.append(chunk));
        await act(() => jest.advanceTimersByTime(100));
        // What the device reports after the flush.
        await fire(root, 'onContentSizeChange', 300, height);
        height += 400;
      };
      await flush('One.\n\nTwo.\n\nThr');
      expect(scrollView.scrollToEnd).not.toHaveBeenCalled(); // fits
      const steps = [
        ['ee', 'Three'],
        [' and', 'Three and'],
        [' more.', 'Three and more.'],
      ] as const;
      for (const [i, [chunk, tail]] of steps.entries()) {
        await flush(chunk);
        expect(renders).toEqual([tail]);
        expect(paragraphs(tree)).toEqual(['One.', 'Two.', tail]);
        expect(scrollView.scrollToEnd).toHaveBeenCalledTimes(i + 1);
        expect(scrollView.scrollToEnd).toHaveBeenLastCalledWith({
          animated: false,
        });
      }
    });
  });
});
