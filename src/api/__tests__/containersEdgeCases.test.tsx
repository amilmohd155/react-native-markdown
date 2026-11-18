/**
 * Edge cases of the owned containers (#51): what the feature tests assume
 * rather than prove. Block counts that change under the list, a render
 * context that changes mid-stream, switching containers at runtime, empty
 * documents, stale `scrollToBlock` offsets, timers outliving the component,
 * follow-tail under awkward event orders, native-driver `Animated.event`,
 * and a 5,000-block document.
 *
 * Events are what a device would send, fired by hand: nothing here is laid
 * out by a real layout engine.
 */
import {
  createElement,
  createRef,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import { ELEMENT_NAMES } from '../../theme';
import { createDocument, tableOf } from '../document';
import { streamView } from '../../../test/stream/harness';
import { Markdown, type MarkdownProps } from '../Markdown';
import { SCROLL_RETRY_MS } from '../scrollControl';
import type {
  MarkdownListRef,
  ScrollOptions,
  VirtualizeOptions,
} from '../scrollOptions';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';
import {
  fire,
  layoutEvent,
  layOutList,
  mountedIndices,
  rootOf,
  scrollEvent,
  scrollListTo,
  scrollViewMocks,
  spyScrollCalls,
} from './listHelpers';

type Options = Omit<ScrollOptions, 'component'>;
type Container = 'view' | 'scroll' | 'virtualize';

const ELEMENTS = new Set<string>(ELEMENT_NAMES);

/** Top-level element hosts, in block order. */
function topHosts(node: TestInstance): TestInstance[] {
  const out: TestInstance[] = [];
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (ELEMENTS.has(child.type)) out.push(child);
    else out.push(...topHosts(child));
  }
  return out;
}

const shape = (tree: Tree) =>
  topHosts(tree.container).map((h) => `${h.type}: ${textOf(h)}`);

type ContainerProps =
  | { readonly scroll?: Options; readonly virtualize?: undefined }
  | { readonly virtualize: VirtualizeOptions; readonly scroll?: undefined };

/** Container props for `container` with `options`. */
function inContainer(
  container: Container,
  options: Options = {}
): ContainerProps {
  if (container === 'scroll') return { scroll: options };
  if (container === 'virtualize') {
    return { virtualize: { initialNumToRender: 1000, ...options } };
  }
  return {};
}

/** Mount and unmount logging, by instance id fixed at mount. */
const log = { renders: [] as number[], unmounts: [] as number[] };
let nextId = 0;
function tracked(name: string) {
  return function Tracked({
    children,
    style: _style,
    ...props
  }: {
    children?: ReactNode;
    style?: unknown;
  }) {
    const [id] = useState(() => ++nextId);
    log.renders.push(id);
    useEffect(
      () => () => {
        log.unmounts.push(id);
      },
      [id]
    );
    return createElement(name, { ...props, mountId: id }, children);
  };
}
const components = hostComponents({
  Paragraph: tracked('Paragraph') as ComponentType<never>,
  Heading: tracked('Heading') as ComponentType<never>,
});
const plain = hostComponents();
const mountIds = (tree: Tree) =>
  topHosts(tree.container).map((h) => h.props.mountId as number);

const probe = {} as { current: UseMarkdownStreamResult };

function Streamed(props: Omit<MarkdownProps, 'document' | 'source'>) {
  const stream = useMarkdownStream();
  useEffect(() => {
    probe.current = stream;
  });
  return <Markdown {...(props as object)} document={stream.document} />;
}

async function flush(chunk: string) {
  await act(async () => probe.current.append(chunk));
  await act(async () => {
    jest.advanceTimersByTime(60);
  });
}

const paragraphs = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `Block ${from + i}.`).join('\n\n');

beforeEach(() => {
  jest.useFakeTimers();
  log.renders.length = 0;
  log.unmounts.length = 0;
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// -- Block count changes: a full re-parse mid-stream --------------------------

describe('a late definition re-parses the whole document', () => {
  const cases = [
    [
      'footnote definition',
      'Intro with a note[^n].\n\nMiddle.\n\nMore text.\n\n[^n]: The note.\n',
    ],
    [
      'reference definition',
      'See [the docs][d] and [again][d].\n\nMiddle.\n\n[d]: https://x.dev\n',
    ],
  ] as const;

  it.each(cases)(
    'virtualize: %s, every block correct afterwards, nothing stale',
    async (_name, source) => {
      const tree = await renderTree(
        <Streamed components={plain} {...inContainer('virtualize')} />
      );
      const reference = await renderTree(
        <Markdown source="" components={plain} />
      );
      let text = '';
      let fullReparses = 0;
      // Three characters at a time: the definition lands late.
      for (let i = 0; i < source.length; i += 3) {
        const chunk = source.slice(i, i + 3);
        const before = tableOf(probe.current.document);
        text += chunk;
        await flush(chunk);
        const after = tableOf(probe.current.document);
        if (after.prefixId !== before.prefixId) fullReparses++;
        await reference.rerender(
          <Markdown
            document={createDocument(streamView(text))}
            components={plain}
          />
        );
        expect(shape(tree)).toEqual(shape(reference));
      }
      expect(fullReparses).toBeGreaterThan(0);
      // The first paragraph changed after it closed: no `[^n]` / `[d]` left.
      expect(textOf(topHosts(tree.container)[0]!)).not.toMatch(
        /\[\^n\]|\]\[d\]/
      );
      await act(async () => probe.current.done());
      await reference.rerender(<Markdown source={source} components={plain} />);
      expect(shape(tree)).toEqual(shape(reference));
    }
  );

  it('virtualize: a block re-parsed while out of the window comes back current', async () => {
    // 40 blocks; block 5 waits for its footnote definition.
    const head =
      paragraphs(5) + '\n\nNote[^n] here.\n\n' + paragraphs(34, 6) + '\n\n';
    const tree = await renderTree(
      <Streamed
        components={plain}
        virtualize={{ initialNumToRender: 1, windowSize: 3 }}
      />
    );
    const root = rootOf(tree);
    await flush(head);
    await layOutList(root, 40);
    expect(mountedIndices(root)).toContain(5);
    expect(textOf(tree.container)).toContain('Note[^n] here.');

    await scrollListTo(root, 3000, 40);
    expect(mountedIndices(root)).not.toContain(5);
    await flush('[^n]: Defined late.\n');
    // Back to the top: block 5 remounts from the re-parsed table.
    await scrollListTo(root, 0, 41);
    expect(mountedIndices(root)).toContain(5);
    expect(textOf(tree.container)).not.toContain('[^n]');
    expect(tree.findAll('FootnoteReference')).toHaveLength(1);
  });
});

// -- ctx changes mid-stream ---------------------------------------------------

describe.each(['scroll', 'virtualize'] as const)(
  'render context change mid-stream in %s mode',
  (container) => {
    const colorOf = (host: TestInstance) =>
      (StyleSheet.flatten(host.props.style) as { color?: string }).color;
    /** The default Paragraph renders a host Text with the theme color. */
    const paragraphColors = (tree: Tree) =>
      tree
        .findAll(
          (n) =>
            n.type === 'Text' &&
            typeof n.parent?.type === 'string' &&
            n.parent.type !== 'Text'
        )
        .map(colorOf);

    it('a theme switch restyles every mounted block, closed ones too', async () => {
      const options =
        container === 'scroll' ? { ref: createRef<MarkdownListRef>() } : {};
      const tree = await renderTree(
        <Streamed theme="light" {...inContainer(container, options)} />
      );
      await flush('One.\n\nTwo.\n\nThr');
      await flush('ee.\n\nFo');
      const light = paragraphColors(tree);
      expect(light).toHaveLength(4);
      expect(new Set(light).size).toBe(1);

      await tree.rerender(
        <Streamed theme="dark" {...inContainer(container, options)} />
      );
      const dark = paragraphColors(tree);
      expect(dark).toHaveLength(4);
      expect(new Set(dark).size).toBe(1);
      expect(dark[0]).not.toBe(light[0]);
      // And the stream goes on in the new theme.
      await flush('ur.\n\nFive');
      expect(paragraphColors(tree)).toEqual(Array(5).fill(dark[0]));
    });

    it('a components change re-renders every mounted block with the new ones', async () => {
      const a = hostComponents({
        Paragraph: (({ children }: { children?: ReactNode }) =>
          createElement('A', null, children)) as ComponentType<never>,
      });
      const b = hostComponents({
        Paragraph: (({ children }: { children?: ReactNode }) =>
          createElement('B', null, children)) as ComponentType<never>,
      });
      const tree = await renderTree(
        <Streamed components={a} {...inContainer(container)} />
      );
      await flush('One.\n\nTwo.\n\nThr');
      await flush('ee.\n\nFo');
      expect(tree.findAll('A').map(textOf)).toEqual([
        'One.',
        'Two.',
        'Three.',
        'Fo',
      ]);
      await tree.rerender(
        <Streamed components={b} {...inContainer(container)} />
      );
      expect(tree.findAll('A')).toHaveLength(0);
      expect(tree.findAll('B').map(textOf)).toEqual([
        'One.',
        'Two.',
        'Three.',
        'Fo',
      ]);
      await flush('ur');
      expect(tree.findAll('B').map(textOf).at(-1)).toBe('Four');
    });
  }
);

// -- Switching containers at runtime ------------------------------------------

describe('switching container at runtime', () => {
  const SOURCE = '# Title\n\n' + paragraphs(5);

  it('scroll → virtualize → none: content stays right, every block remounts each time', async () => {
    const tree = await renderTree(
      <Markdown source={SOURCE} components={components} scroll />
    );
    const expected = shape(tree);
    expect(expected).toHaveLength(6);
    let ids = mountIds(tree);

    for (const next of [
      { virtualize: true },
      {},
      { scroll: { autoScroll: true } },
    ] as const) {
      log.unmounts.length = 0;
      await tree.rerender(
        <Markdown source={SOURCE} components={components} {...next} />
      );
      expect(shape(tree)).toEqual(expected);
      // A different container component: React remounts the subtree.
      expect(log.unmounts.sort()).toEqual([...ids].sort());
      expect(mountIds(tree).some((id) => ids.includes(id))).toBe(false);
      ids = mountIds(tree);
    }
  });

  it('scroll: toggling ref swaps the measuring wrapper and remounts every block', async () => {
    const ref = createRef<MarkdownListRef>();
    const tree = await renderTree(
      <Markdown source={SOURCE} components={components} scroll />
    );
    const expected = shape(tree);
    const first = mountIds(tree);

    await tree.rerender(
      <Markdown source={SOURCE} components={components} scroll={{ ref }} />
    );
    expect(shape(tree)).toEqual(expected);
    expect(ref.current).not.toBeNull();
    const second = mountIds(tree);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(log.unmounts.sort()).toEqual([...first].sort());

    log.unmounts.length = 0;
    await tree.rerender(
      <Markdown source={SOURCE} components={components} scroll />
    );
    expect(shape(tree)).toEqual(expected);
    expect(ref.current).toBeNull();
    expect(log.unmounts.sort()).toEqual([...second].sort());
  });

  it.each([
    ['scroll', 'autoScroll', { autoScroll: true }],
    ['scroll', 'componentRef', { componentRef: { current: null } }],
    ['virtualize', 'ref', { ref: createRef<MarkdownListRef>() }],
    ['virtualize', 'autoScroll', { autoScroll: true }],
  ] as const)(
    '%s: toggling %s remounts nothing',
    async (container, _name, options) => {
      const tree = await renderTree(
        <Markdown
          source={SOURCE}
          components={components}
          {...inContainer(container)}
        />
      );
      const ids = mountIds(tree);
      log.renders.length = 0;
      await tree.rerender(
        <Markdown
          source={SOURCE}
          components={components}
          {...inContainer(container, options)}
        />
      );
      await tree.rerender(
        <Markdown
          source={SOURCE}
          components={components}
          {...inContainer(container)}
        />
      );
      expect(mountIds(tree)).toEqual(ids);
      expect(log.unmounts).toEqual([]);
      // Not even a render: only the scroll view's props changed.
      expect(log.renders).toEqual([]);
    }
  );
});

// -- Empty, single block, shrinking to zero -----------------------------------

describe.each(['view', 'scroll', 'virtualize'] as const)(
  'empty and tiny documents in %s',
  (container) => {
    const ref = createRef<MarkdownListRef>();
    const options: Options = { autoScroll: true, ref };
    const element = (source: string) => (
      <Markdown
        source={source}
        components={plain}
        {...inContainer(container, options)}
      />
    );

    /** Exercises the ref; no scroll call may reach a block that isn't there. */
    async function poke(tree: Tree) {
      if (container === 'view') {
        expect(ref.current).toBeNull();
        return;
      }
      const spies = spyScrollCalls();
      const root = rootOf(tree);
      await fire(root, 'onLayout', layoutEvent(0, 600));
      await fire(root, 'onContentSizeChange', 300, 0);
      expect(() => {
        ref.current!.scrollToBlock(0);
        ref.current!.scrollToBlock(5, { viewPosition: 0.5 });
        ref.current!.scrollToOffset(0, { animated: false });
        ref.current!.scrollToEnd({ animated: false });
      }).not.toThrow();
      await act(async () => {
        jest.advanceTimersByTime(10 * SCROLL_RETRY_MS);
      });
      expect(spies.toIndex).not.toHaveBeenCalled();
      // Content shorter than the viewport: follow-tail never scrolled.
      expect(scrollViewMocks.scrollToEnd.mock.calls).toEqual([
        [{ animated: false }], // the explicit ref.scrollToEnd only
      ]);
    }

    it('renders an empty document', async () => {
      const tree = await renderTree(element(''));
      expect(shape(tree)).toEqual([]);
      await poke(tree);
    });

    it('renders a single block', async () => {
      const tree = await renderTree(element('Only.'));
      expect(shape(tree)).toEqual(['Paragraph: Only.']);
    });

    it('shrinks to zero blocks and grows again', async () => {
      const tree = await renderTree(element(paragraphs(12)));
      expect(shape(tree)).toHaveLength(12);
      await tree.rerender(element(''));
      expect(shape(tree)).toEqual([]);
      await poke(tree);
      await tree.rerender(element('Back.'));
      expect(shape(tree)).toEqual(['Paragraph: Back.']);
    });
  }
);

it('virtualize: a pending scrollToBlock retry after the document empties does nothing', async () => {
  const ref = createRef<MarkdownListRef>();
  const element = (source: string) => (
    <Markdown source={source} components={plain} virtualize={{ ref }} />
  );
  const tree = await renderTree(element(paragraphs(100)));
  const root = rootOf(tree);
  await layOutList(root, 100, 600, 50);
  const spies = spyScrollCalls();
  ref.current!.scrollToBlock(80); // beyond the measured cells: retries
  expect(spies.toIndex).toHaveBeenCalledTimes(1);
  await tree.rerender(element(''));
  await act(async () => {
    jest.advanceTimersByTime(10 * SCROLL_RETRY_MS);
  });
  expect(spies.toIndex).toHaveBeenCalledTimes(1);
});

// -- scrollToBlock in scroll mode: stale offsets ------------------------------

describe('scrollToBlock in scroll mode with changing blocks', () => {
  /** The measuring wrappers (one View per block), in order. */
  const wrappers = (tree: Tree) =>
    (rootOf(tree).children[0] as TestInstance).children.filter(
      (c): c is TestInstance => typeof c !== 'string' && c.type === 'View'
    );

  async function measure(tree: Tree, height = 100) {
    for (const [i, w] of wrappers(tree).entries()) {
      await fire(w, 'onLayout', layoutEvent(i * height, height));
    }
    const root = rootOf(tree);
    await fire(root, 'onLayout', layoutEvent(0, 600));
    await fire(
      root,
      'onContentSizeChange',
      300,
      wrappers(tree).length * height
    );
  }

  const element = (source: string, ref: React.Ref<MarkdownListRef>) => (
    <Markdown source={source} components={plain} scroll={{ ref }} />
  );

  it('uses the new offsets once blocks inserted before the target are laid out', async () => {
    const ref = createRef<MarkdownListRef>();
    const tree = await renderTree(element(paragraphs(10), ref));
    await measure(tree);
    // Two blocks inserted at the top: every later block moves down.
    await tree.rerender(element('New A.\n\nNew B.\n\n' + paragraphs(10), ref));
    await measure(tree);
    scrollViewMocks.scrollTo.mockClear();
    ref.current!.scrollToBlock(5, { animated: false });
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 500,
      animated: false,
    });
  });

  it('does not use the offsets of blocks that no longer exist', async () => {
    const ref = createRef<MarkdownListRef>();
    const tree = await renderTree(element(paragraphs(10), ref));
    await measure(tree);
    // Shrink to 3 blocks, then grow to 10 different ones. Blocks 3..9 are
    // new and not laid out yet: scrollToBlock(8) must wait for its layout,
    // not reuse the old block 8's offset.
    await tree.rerender(element(paragraphs(3, 100), ref));
    await tree.rerender(element(paragraphs(10, 200), ref));
    scrollViewMocks.scrollTo.mockClear();
    ref.current!.scrollToBlock(8, { animated: false });
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();
    // Once laid out (50 px each now), it lands on the new offset.
    await measure(tree, 50);
    ref.current!.scrollToBlock(8, { animated: false });
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 400,
      animated: false,
    });
  });

  it('does not use offsets measured before ref was toggled off and on', async () => {
    const ref = createRef<MarkdownListRef>();
    const tree = await renderTree(element(paragraphs(10), ref));
    await measure(tree);
    await tree.rerender(
      <Markdown source={paragraphs(10)} components={plain} scroll />
    );
    await tree.rerender(element(paragraphs(10), ref));
    // New wrappers, not laid out yet.
    scrollViewMocks.scrollTo.mockClear();
    ref.current!.scrollToBlock(4, { animated: false });
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();
  });
});

// -- Unmount during a pending retry -------------------------------------------

it('virtualize: unmounting during a pending scrollToBlock retry stops it', async () => {
  const ref = createRef<MarkdownListRef>();
  const tree = await renderTree(
    <Markdown
      source={paragraphs(100)}
      components={plain}
      virtualize={{ ref }}
    />
  );
  await layOutList(rootOf(tree), 100, 600, 50);
  const handle = ref.current!;
  const spies = spyScrollCalls();
  const errors = jest.spyOn(console, 'error');
  handle.scrollToBlock(90);
  expect(spies.toIndex).toHaveBeenCalledTimes(1);
  await tree.unmount();
  expect(ref.current).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(10 * SCROLL_RETRY_MS);
  });
  expect(spies.toIndex).toHaveBeenCalledTimes(1);
  // A handle kept past unmount does nothing.
  expect(() => {
    handle.scrollToBlock(3);
    handle.scrollToEnd();
    handle.scrollToOffset(10);
  }).not.toThrow();
  await act(async () => {
    jest.advanceTimersByTime(10 * SCROLL_RETRY_MS);
  });
  expect(spies.all()).toMatchObject({ scrollToIndex: 1, scrollToEnd: 0 });
  expect(errors).not.toHaveBeenCalled();
});

// -- Follow-tail under awkward event orders -----------------------------------

describe.each(['scroll', 'virtualize'] as const)(
  'follow-tail in %s',
  (container) => {
    const element = (options: Options) => (
      <Markdown
        source={paragraphs(3)}
        components={plain}
        {...inContainer(container, options)}
      />
    );
    const ends = () => scrollViewMocks.scrollToEnd.mock.calls.length;

    beforeEach(() => {
      scrollViewMocks.scrollToEnd.mockClear();
      scrollViewMocks.scrollTo.mockClear();
    });

    async function pinned(options: Options = { autoScroll: true }) {
      const tree = await renderTree(element(options));
      const root = rootOf(tree);
      await fire(root, 'onLayout', layoutEvent(0, 600));
      await fire(root, 'onContentSizeChange', 300, 1000);
      await fire(root, 'onScroll', scrollEvent(400, 1000));
      expect(ends()).toBe(1);
      return { tree, root };
    }

    it('a drag in the middle of a burst of flushes pauses, and stays paused', async () => {
      const { root } = await pinned();
      let height = 1000;
      const grow = () => fire(root, 'onContentSizeChange', 300, (height += 50));
      await grow();
      await grow();
      expect(ends()).toBe(3);
      await fire(root, 'onScrollBeginDrag', scrollEvent(500, height));
      await grow(); // while touching: no scroll
      await fire(root, 'onScroll', scrollEvent(450, height));
      await grow();
      await fire(root, 'onScroll', scrollEvent(300, height));
      await grow();
      await fire(root, 'onScrollEndDrag', scrollEvent(300, height));
      expect(ends()).toBe(3);
      for (let i = 0; i < 10; i++) await grow();
      expect(ends()).toBe(3);
    });

    it('content that shrinks and grows again keeps following', async () => {
      const { root } = await pinned();
      await fire(root, 'onContentSizeChange', 300, 800); // shrinks
      // The scroll view clamps: an upward move, but the content shrank.
      await fire(root, 'onScroll', scrollEvent(200, 800));
      expect(ends()).toBe(1);
      await fire(root, 'onContentSizeChange', 300, 900); // grows, under 1000
      expect(ends()).toBe(2);
    });

    it('a viewport resize while pinned keeps the end in view; while paused it does not', async () => {
      const { root } = await pinned();
      await fire(root, 'onLayout', layoutEvent(0, 300)); // keyboard
      expect(ends()).toBe(2);
      await fire(root, 'onScroll', scrollEvent(700, 1000));
      await fire(root, 'onScrollBeginDrag', scrollEvent(700, 1000));
      await fire(root, 'onScrollEndDrag', scrollEvent(100, 1000));
      await fire(root, 'onLayout', layoutEvent(0, 600));
      expect(ends()).toBe(2);
    });

    it('autoScroll turned on mid-stream follows from the next growth', async () => {
      // With autoScroll off the controller sees no scroll events, so when it
      // is turned on it cannot know where the user is: it starts pinned, as a
      // new document does (P3-5), and the next growth scrolls to the end.
      const tree = await renderTree(element({}));
      const root = rootOf(tree);
      await fire(root, 'onLayout', layoutEvent(0, 600));
      await fire(root, 'onContentSizeChange', 300, 1000);
      expect(ends()).toBe(0);
      await tree.rerender(element({ autoScroll: true }));
      const host = rootOf(tree);
      await fire(host, 'onContentSizeChange', 300, 1100);
      expect(ends()).toBe(1);
      // From then on it is position-aware.
      await fire(host, 'onScrollBeginDrag', scrollEvent(500, 1100));
      await fire(host, 'onScrollEndDrag', scrollEvent(0, 1100));
      await fire(host, 'onContentSizeChange', 300, 1200);
      expect(ends()).toBe(1);
    });

    it('autoScroll turned off stops following at once', async () => {
      const { tree } = await pinned();
      await tree.rerender(element({ autoScroll: false }));
      const root = rootOf(tree);
      // `scroll` drops its size handler; FlatList keeps its own.
      if (typeof root.props.onContentSizeChange === 'function') {
        await fire(root, 'onContentSizeChange', 300, 2000);
      }
      await fire(root, 'onLayout', layoutEvent(0, 300));
      expect(ends()).toBe(1);
    });
  }
);

// -- Native-driver Animated.event with autoScroll -----------------------------

describe.each(['scroll', 'virtualize'] as const)(
  'native-driver Animated.event onScroll with autoScroll in %s',
  (container) => {
    beforeEach(() => scrollViewMocks.scrollToEnd.mockClear());

    it('reaches the Animated component untouched; follow-tail runs on drag ends', async () => {
      const offset = new Animated.Value(0);
      const onScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { y: offset } } }],
        { useNativeDriver: true }
      );
      const options = { autoScroll: true, onScroll } as unknown as Options;
      const tree = await renderTree(
        container === 'scroll' ? (
          <Markdown
            source={paragraphs(30)}
            components={plain}
            scroll={{ ...options, component: Animated.ScrollView }}
          />
        ) : (
          <Markdown
            source={paragraphs(30)}
            components={plain}
            virtualize={{ ...options, component: Animated.FlatList }}
          />
        )
      );
      const root = rootOf(tree);
      expect(shape(tree).length).toBeGreaterThan(0);
      await fire(root, 'onLayout', layoutEvent(0, 600));
      await fire(root, 'onContentSizeChange', 300, 1000);
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(1);
      // The user drags up and lets go away from the end: paused.
      await fire(root, 'onScrollBeginDrag', scrollEvent(400, 1000));
      await fire(root, 'onScrollEndDrag', scrollEvent(100, 1000));
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(1);
      // A fling back to the end resumes.
      await fire(root, 'onScrollBeginDrag', scrollEvent(100, 1200));
      await fire(root, 'onScrollEndDrag', scrollEvent(300, 1200));
      await fire(root, 'onMomentumScrollBegin', scrollEvent(300, 1200));
      await fire(root, 'onContentSizeChange', 300, 1250); // mid-fling
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(1);
      // The fling ends at the end: pinned again, and it catches up at once.
      await fire(root, 'onMomentumScrollEnd', scrollEvent(650, 1250));
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(2);
      await fire(root, 'onContentSizeChange', 300, 1400);
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(3);
    });

    // Seen on an iOS simulator: 8 of 9 flings back to the end left the view
    // paused, because content kept streaming in while the fling slowed
    // down, so it ended more than the threshold short of the (new) end.
    it('resumes after a fling to the end even when content grew during it', async () => {
      const options = { autoScroll: true } as Options;
      const tree = await renderTree(
        container === 'scroll' ? (
          <Markdown
            source={paragraphs(30)}
            components={plain}
            scroll={options}
          />
        ) : (
          <Markdown
            source={paragraphs(30)}
            components={plain}
            virtualize={options}
          />
        )
      );
      const root = rootOf(tree);
      await fire(root, 'onLayout', layoutEvent(0, 600));
      await fire(root, 'onContentSizeChange', 300, 1000);
      scrollViewMocks.scrollToEnd.mockClear();
      // Drag up: paused.
      await fire(root, 'onScrollBeginDrag', scrollEvent(400, 1000));
      await fire(root, 'onScroll', scrollEvent(100, 1000));
      await fire(root, 'onScrollEndDrag', scrollEvent(100, 1000));
      await fire(root, 'onContentSizeChange', 300, 1100);
      expect(scrollViewMocks.scrollToEnd).not.toHaveBeenCalled();
      // Fling down: it reaches the end (500 of 1100)...
      await fire(root, 'onScrollBeginDrag', scrollEvent(100, 1100));
      await fire(root, 'onScrollEndDrag', scrollEvent(200, 1100));
      await fire(root, 'onMomentumScrollBegin', scrollEvent(200, 1100));
      await fire(root, 'onScroll', scrollEvent(500, 1100));
      // ...and the content grows by 300 while it slows down: nothing
      // scrolls mid-fling, and the view is now 300 short.
      await fire(root, 'onContentSizeChange', 300, 1400);
      await fire(root, 'onScroll', scrollEvent(500, 1400));
      expect(scrollViewMocks.scrollToEnd).not.toHaveBeenCalled();
      // The fling ends there: still pinned, so it catches up and follows.
      await fire(root, 'onMomentumScrollEnd', scrollEvent(500, 1400));
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(1);
      await fire(root, 'onContentSizeChange', 300, 1500);
      expect(scrollViewMocks.scrollToEnd).toHaveBeenCalledTimes(2);
    });

    it('a fling up from the end still pauses', async () => {
      const options = { autoScroll: true } as Options;
      const tree = await renderTree(
        container === 'scroll' ? (
          <Markdown
            source={paragraphs(30)}
            components={plain}
            scroll={options}
          />
        ) : (
          <Markdown
            source={paragraphs(30)}
            components={plain}
            virtualize={options}
          />
        )
      );
      const root = rootOf(tree);
      await fire(root, 'onLayout', layoutEvent(0, 600));
      await fire(root, 'onContentSizeChange', 300, 1000);
      scrollViewMocks.scrollToEnd.mockClear();
      // Starts within the threshold of the end, and moves up while the
      // content grows.
      await fire(root, 'onScrollBeginDrag', scrollEvent(400, 1000));
      await fire(root, 'onScrollEndDrag', scrollEvent(380, 1000));
      await fire(root, 'onMomentumScrollBegin', scrollEvent(380, 1000));
      await fire(root, 'onContentSizeChange', 300, 1100);
      await fire(root, 'onScroll', scrollEvent(200, 1100));
      await fire(root, 'onMomentumScrollEnd', scrollEvent(150, 1100));
      await fire(root, 'onContentSizeChange', 300, 1200);
      expect(scrollViewMocks.scrollToEnd).not.toHaveBeenCalled();
    });
  }
);

// -- 5,000 blocks -------------------------------------------------------------

describe('a 5,000-block document in virtualize mode', () => {
  const BIG = paragraphs(5000);

  it('mounts only the initial window, and a flush renders and allocates per changed block only', async () => {
    let renders = 0;
    const counted = hostComponents({
      Paragraph: (({ children }: { children?: ReactNode }) => {
        renders++;
        return createElement('Paragraph', null, children);
      }) as ComponentType<never>,
    });
    const tree = await renderTree(<Streamed components={counted} virtualize />);
    await act(async () => probe.current.reset(BIG + '\n\nTail'));
    const root = rootOf(tree);
    expect(root.props.data).toHaveLength(5001);
    expect(mountedIndices(root)).toEqual([...Array(10).keys()]);
    expect(renders).toBe(10);

    // Two flushes: the first after reset() carries the new stable prefix.
    await flush(' one');
    const before = root.props.data as readonly object[];
    renders = 0;
    await flush(' two');
    const after = rootOf(tree).props.data as readonly object[];
    expect(after).not.toBe(before);
    expect(after).toHaveLength(5001);
    // Every closed block keeps its item; only the tail is new.
    let reused = 0;
    for (let i = 0; i < 5000; i++) if (after[i] === before[i]) reused++;
    expect(reused).toBe(5000);
    expect(after[5000]).not.toBe(before[5000]);
    // The tail is outside the window: nothing mounted renders.
    expect(renders).toBe(0);
    expect(mountedIndices(rootOf(tree))).toEqual([...Array(10).keys()]);
  });
});
