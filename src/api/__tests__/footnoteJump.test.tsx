/**
 * The built-in footnote jump of the owned containers (P3-8 to P3-10), and
 * the footnote section and links waiting for `done()` while streaming
 * (P3-12). Events are fired by hand, as in the other container tests.
 */
import { useEffect, type ReactElement } from 'react';
import { Platform, ScrollView } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import type { FootnotePressInfo } from '../../render';
import { Markdown } from '../Markdown';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';
import {
  fire,
  layoutEvent,
  layOutList,
  rootOf,
  scrollViewMocks,
  spyScrollCalls,
} from './listHelpers';

// Blocks: 0 and 1 plain, 2 holds the reference, 3-10 plain, 11 the section.
const SOURCE =
  'Block A.\n\nBlock B.\n\nNote here[^1].\n\n' +
  Array.from({ length: 8 }, (_, i) => `Block ${i}.`).join('\n\n') +
  '\n\n[^1]: The note.\n';
const BLOCKS = 12;

const reference = (tree: Tree) =>
  tree.find((n) => n.props.accessibilityLabel === 'Footnote 1');
const backLink = (tree: Tree) =>
  tree.find((n) => n.props.accessibilityLabel === 'Back to reference 1');

/** The measuring wrapper `View`s of a `scroll` container, one per block. */
function wrappersOf(root: TestInstance): TestInstance[] {
  const content = root.children[0] as TestInstance;
  return content.children.filter(
    (c): c is TestInstance => typeof c !== 'string' && !!c.props.onLayout
  );
}

/** Lays out a `scroll` container: 100 px blocks in a 600 px viewport. */
async function layOutScroll(root: TestInstance, count = BLOCKS) {
  await fire(root, 'onLayout', layoutEvent(0, 600));
  await fire(root, 'onContentSizeChange', 300, count * 100);
  const wrappers = wrappersOf(root);
  for (const [i, wrapper] of wrappers.entries()) {
    await fire(wrapper, 'onLayout', layoutEvent(i * 100, 100));
  }
  return wrappers.length;
}

beforeEach(() => {
  jest.useFakeTimers();
  scrollViewMocks.scrollTo.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('scroll', () => {
  it('a reference scrolls to the footnote section', async () => {
    const tree = await renderTree(<Markdown source={SOURCE} scroll />);
    expect(await layOutScroll(rootOf(tree))).toBe(BLOCKS);
    await fire(reference(tree), 'onPress');
    // Block 11 at 1100, clamped to the end of the content.
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 600,
      animated: true,
    });
  });

  it('a back-link scrolls to the top-level block of its reference', async () => {
    const tree = await renderTree(<Markdown source={SOURCE} scroll />);
    await layOutScroll(rootOf(tree));
    await fire(backLink(tree), 'onPress');
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 200,
      animated: true,
    });
  });

  it('runs the handler first; `false` skips the jump, anything else keeps it', async () => {
    const seen: [string, FootnotePressInfo][] = [];
    let answer: false | undefined = false;
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        scroll
        onFootnotePress={(label, info) => {
          seen.push([label, info]);
          return answer;
        }}
      />
    );
    await layOutScroll(rootOf(tree));
    await fire(reference(tree), 'onPress');
    expect(seen).toEqual([
      ['1', { index: 1, direction: 'definition', reference: 1 }],
    ]);
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();

    answer = undefined;
    await fire(backLink(tree), 'onPress');
    expect(seen).toHaveLength(2);
    expect(seen[1]![1].direction).toBe('reference');
    expect(scrollViewMocks.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('`jumpToFootnotes: false` leaves the handler only, and no measuring', async () => {
    const onFootnotePress = jest.fn();
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        scroll={{ jumpToFootnotes: false }}
        onFootnotePress={onFootnotePress}
      />
    );
    expect(wrappersOf(rootOf(tree))).toHaveLength(0);
    await fire(reference(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenCalledTimes(1);
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();
  });

  it('without footnotes there is no jump and no measuring wrapper', async () => {
    const tree = await renderTree(<Markdown source="No notes." scroll />);
    expect(wrappersOf(rootOf(tree))).toHaveLength(0);
  });

  it('links are plain text without a handler or a container', async () => {
    const tree = await renderTree(<Markdown source={SOURCE} />);
    expect(
      tree.findAll((n) => n.props.accessibilityLabel === 'Footnote 1')
    ).toHaveLength(0);
  });

  it('a handler alone in the default View does not scroll', async () => {
    const onFootnotePress = jest.fn();
    const tree = await renderTree(
      <Markdown source={SOURCE} onFootnotePress={onFootnotePress} />
    );
    await fire(reference(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenCalledTimes(1);
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();
  });

  it('uses footnotes.labels for the accessibility labels', async () => {
    const footnoteLabels = {
      reference: (n: number) => `Fussnote ${n}`,
      backLink: (n: number, r: number) => `Zurück ${n}.${r}`,
    };
    const tree = await renderTree(
      <Markdown source={SOURCE} scroll footnotes={{ labels: footnoteLabels }} />
    );
    expect(
      tree.find((n) => n.props.accessibilityLabel === 'Fussnote 1')
    ).toBeDefined();
    expect(
      tree.find((n) => n.props.accessibilityLabel === 'Zurück 1.1')
    ).toBeDefined();
  });
});

describe('virtualize', () => {
  it('a reference scrolls to the section, a back-link to its block', async () => {
    const calls = spyScrollCalls();
    const tree = await renderTree(
      <Markdown source={SOURCE} virtualize={{ initialNumToRender: 1000 }} />
    );
    await layOutList(rootOf(tree), BLOCKS);
    await fire(reference(tree), 'onPress');
    expect(calls.toIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({
        index: BLOCKS - 1,
        viewPosition: 0,
        animated: true,
      })
    );
    await fire(backLink(tree), 'onPress');
    expect(calls.toIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: 2, viewPosition: 0 })
    );
  });

  it('`jumpToFootnotes: false` in `scroll` also applies to `virtualize`, which can override it', async () => {
    const calls = spyScrollCalls();
    const off = await renderTree(
      <Markdown
        source={SOURCE}
        scroll={{ jumpToFootnotes: false }}
        virtualize={{ initialNumToRender: 1000 }}
      />
    );
    await layOutList(rootOf(off), BLOCKS);
    // No handler and no jump: references are plain text.
    expect(
      off.findAll((n) => n.props.accessibilityLabel === 'Footnote 1')
    ).toHaveLength(0);
    expect(calls.toIndex).not.toHaveBeenCalled();
    await off.unmount();

    const on = await renderTree(
      <Markdown
        source={SOURCE}
        scroll={{ jumpToFootnotes: false }}
        virtualize={{ initialNumToRender: 1000, jumpToFootnotes: true }}
        onFootnotePress={() => {}}
      />
    );
    await layOutList(rootOf(on), BLOCKS);
    await fire(reference(on), 'onPress');
    expect(calls.toIndex).toHaveBeenCalledTimes(1);
  });
});

describe('dev warnings', () => {
  it('a scroll component that drops ref is not warned about for the jump alone', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const Drops = ({ children, ...props }: Record<string, unknown>) => (
      <ScrollView {...{ ...props, ref: undefined }}>
        {children as ReactElement}
      </ScrollView>
    );
    const tree = await renderTree(
      <Markdown source={SOURCE} scroll={{ component: Drops as never }} />
    );
    expect(rootOf(tree)).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('while streaming (P3-12)', () => {
  const probe = {} as { current: UseMarkdownStreamResult };
  function Streamed({
    onFootnotePress,
  }: {
    readonly onFootnotePress?: () => void;
  }) {
    const stream = useMarkdownStream();
    useEffect(() => {
      probe.current = stream;
    });
    return (
      <Markdown
        document={stream.document}
        scroll
        onFootnotePress={onFootnotePress}
      />
    );
  }
  const links = (tree: Tree) =>
    tree.findAll((n) => n.props.accessibilityRole === 'link');
  const advance = () =>
    act(async () => {
      jest.advanceTimersByTime(60);
    });

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  it('hides the section and the links until done(), then jumps', async () => {
    const onFootnotePress = jest.fn();
    const tree = await renderTree(
      <Streamed onFootnotePress={onFootnotePress} />
    );
    await act(async () => probe.current.append(SOURCE));
    await advance();
    // Live: the definitions are not shown and the reference is text.
    expect(textOf(tree.container)).toContain('Note here[1]');
    expect(textOf(tree.container)).not.toContain('The note.');
    expect(links(tree)).toHaveLength(0);
    expect(wrappersOf(rootOf(tree))).toHaveLength(0);

    await act(async () => probe.current.done());
    await advance();
    expect(textOf(tree.container)).toContain('The note.');
    expect(links(tree).length).toBeGreaterThan(0);
    await layOutScroll(rootOf(tree));
    await fire(reference(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenCalledTimes(1);
    expect(scrollViewMocks.scrollTo).toHaveBeenCalledTimes(1);

    // A new stream hides them again.
    await act(async () => probe.current.reset());
    await act(async () => probe.current.append(SOURCE));
    await advance();
    expect(textOf(tree.container)).not.toContain('The note.');
    expect(links(tree)).toHaveLength(0);
  });

  it('a static document has them at once', async () => {
    const tree = await renderTree(<Markdown source={SOURCE} scroll />);
    expect(textOf(tree.container)).toContain('The note.');
    expect(links(tree).length).toBeGreaterThan(0);
  });
});
