/**
 * The API half of P3-15: `footnotes.target` and `footnotes.highlight`, the
 * focus config the pipeline builds, the `{ offset }` argument, the exact
 * scroll in the owned containers and the flash. Definitions report their y
 * from the render layer; here the store is fed by hand.
 */
import { useEffect } from 'react';
import { FlatList, Platform } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree, type TestInstance, type Tree } from '../../__tests__/tree';
import type { FootnoteFocusConfig, FootnoteFocusStore } from '../../render';
import { Markdown } from '../Markdown';
import {
  useMarkdownPipeline,
  type FootnotesOptions,
  type MarkdownPipelineProps,
} from '../pipeline';
import {
  useMarkdownBlocks,
  type UseMarkdownBlocksOptions,
} from '../useMarkdownBlocks';
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

const stores: FootnoteFocusStore[] = [];
jest.mock('../../render/footnoteFocus', () => {
  const actual = jest.requireActual('../../render/footnoteFocus');
  return {
    ...actual,
    createFootnoteFocusStore: () => {
      const created = actual.createFootnoteFocusStore();
      stores.push(created);
      return created;
    },
  };
});

// Blocks: 0 and 1 plain, 2 holds the reference, 3-10 plain, 11 the section.
const SOURCE =
  'Block A.\n\nBlock B.\n\nNote here[^1].\n\n' +
  Array.from({ length: 8 }, (_, i) => `Block ${i}.`).join('\n\n') +
  '\n\n[^1]: The note.\n';
const BLOCKS = 12;
const DEFINITION: FootnotesOptions = { target: 'definition', highlight: true };

const reference = (tree: Tree) =>
  tree.find((n) => n.props.accessibilityLabel === 'Footnote 1');
const backLink = (tree: Tree) =>
  tree.find((n) => n.props.accessibilityLabel === 'Back to reference 1');
const store = () => stores.at(-1)!;

beforeEach(() => {
  stores.length = 0;
  jest.useFakeTimers();
  scrollViewMocks.scrollTo.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the focus config', () => {
  const configs: (FootnoteFocusConfig | null)[] = [];
  function Probe(props: MarkdownPipelineProps) {
    const { focus } = useMarkdownPipeline(props, 'Probe');
    useEffect(() => {
      configs.push(focus);
    });
    return null;
  }
  beforeEach(() => {
    configs.length = 0;
  });

  it('is null for the default section target without a highlight', async () => {
    await renderTree(<Probe source={SOURCE} />);
    await renderTree(
      <Probe source={SOURCE} footnotes={{ target: 'section' }} />
    );
    await renderTree(
      <Probe source={SOURCE} footnotes={{ highlight: false }} />
    );
    expect(configs).toEqual([null, null, null]);
  });

  it('resolves target and highlight', async () => {
    await renderTree(<Probe source={SOURCE} footnotes={DEFINITION} />);
    expect(configs.at(-1)).toEqual({
      store: store(),
      target: 'definition',
      highlight: { color: null, duration: 1500 },
    });
    await renderTree(
      <Probe
        source={SOURCE}
        footnotes={{ highlight: { color: '#ff0', duration: 400 } }}
      />
    );
    expect(configs.at(-1)).toMatchObject({
      target: 'section',
      highlight: { color: '#ff0', duration: 400 },
    });
  });

  it('is stable across renders with an inline footnotes object', async () => {
    const tree = await renderTree(
      <Probe source={SOURCE} footnotes={{ ...DEFINITION }} />
    );
    const first = configs.at(-1);
    await tree.rerender(
      <Probe source={SOURCE} footnotes={{ ...DEFINITION }} />
    );
    await tree.rerender(
      <Probe source={SOURCE} footnotes={{ ...DEFINITION, highlight: true }} />
    );
    expect(configs.at(-1)).toBe(first);
    expect(stores).toHaveLength(1);
    await tree.rerender(
      <Probe source={SOURCE} footnotes={{ target: 'definition' }} />
    );
    expect(configs.at(-1)).not.toBe(first);
    expect(configs.at(-1)?.store).toBe(first?.store);
  });
});

describe('scroll', () => {
  async function layOut(tree: Tree) {
    const root = rootOf(tree);
    await fire(root, 'onLayout', layoutEvent(0, 600));
    await fire(root, 'onContentSizeChange', 300, 3000);
    const content = root.children[0] as TestInstance;
    const wrappers = content.children.filter(
      (c): c is TestInstance => typeof c !== 'string' && !!c.props.onLayout
    );
    for (const [i, w] of wrappers.entries()) {
      await fire(w, 'onLayout', layoutEvent(i * 100, 100));
    }
  }

  it('scrolls to the section plus the definition y and flashes it', async () => {
    const tree = await renderTree(
      <Markdown source={SOURCE} scroll footnotes={DEFINITION} />
    );
    await layOut(tree);
    store().setDefinitionY('1', 40);
    const flash = jest.spyOn(store(), 'flash');
    await fire(reference(tree), 'onPress');
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 1140,
      animated: true,
    });
    expect(flash).toHaveBeenCalledWith({ kind: 'definition', label: '1' });
  });

  it('a back-link scrolls to its block and flashes the reference', async () => {
    const tree = await renderTree(
      <Markdown source={SOURCE} scroll footnotes={DEFINITION} />
    );
    await layOut(tree);
    store().setDefinitionY('1', 40);
    const flash = jest.spyOn(store(), 'flash');
    await fire(backLink(tree), 'onPress');
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 200,
      animated: true,
    });
    expect(flash).toHaveBeenCalledWith({
      kind: 'reference',
      label: '1',
      reference: 1,
    });
  });

  it('lands on the section while the definition is unmeasured', async () => {
    const tree = await renderTree(
      <Markdown source={SOURCE} scroll footnotes={DEFINITION} />
    );
    await layOut(tree);
    await fire(reference(tree), 'onPress');
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 1100,
      animated: true,
    });
  });

  it('passes { offset } to onFootnotePress, only for references', async () => {
    const onFootnotePress = jest.fn();
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        scroll
        footnotes={DEFINITION}
        onFootnotePress={onFootnotePress}
      />
    );
    await layOut(tree);
    await fire(reference(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenLastCalledWith('1', expect.anything(), {
      offset: undefined,
    });
    store().setDefinitionY('1', 40);
    await fire(reference(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenLastCalledWith('1', expect.anything(), {
      offset: 40,
    });
    await fire(backLink(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenLastCalledWith('1', expect.anything(), {
      offset: undefined,
    });
  });

  it('`false` skips the jump and the flash', async () => {
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        scroll
        footnotes={DEFINITION}
        onFootnotePress={() => false}
      />
    );
    await layOut(tree);
    store().setDefinitionY('1', 40);
    const flash = jest.spyOn(store(), 'flash');
    await fire(reference(tree), 'onPress');
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();
    expect(flash).not.toHaveBeenCalled();
  });

  it('`jumpToFootnotes: false` disables the jump and the flash', async () => {
    const onFootnotePress = jest.fn();
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        scroll={{ jumpToFootnotes: false }}
        footnotes={DEFINITION}
        onFootnotePress={onFootnotePress}
      />
    );
    const flash = jest.spyOn(store(), 'flash');
    await fire(reference(tree), 'onPress');
    expect(onFootnotePress).toHaveBeenCalledTimes(1);
    expect(scrollViewMocks.scrollTo).not.toHaveBeenCalled();
    expect(flash).not.toHaveBeenCalled();
  });

  it('target definition without a highlight does not flash', async () => {
    const tree = await renderTree(
      <Markdown source={SOURCE} scroll footnotes={{ target: 'definition' }} />
    );
    await layOut(tree);
    const flash = jest.spyOn(store(), 'flash');
    await fire(reference(tree), 'onPress');
    expect(flash).not.toHaveBeenCalled();
  });

  it('with no config the jump is as before', async () => {
    const tree = await renderTree(<Markdown source={SOURCE} scroll />);
    await layOut(tree);
    await fire(reference(tree), 'onPress');
    expect(scrollViewMocks.scrollTo).toHaveBeenLastCalledWith({
      y: 1100,
      animated: true,
    });
  });
});

describe('virtualize', () => {
  it('lands on the section, then refines when the y arrives', async () => {
    const calls = spyScrollCalls();
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        virtualize={{ initialNumToRender: 1000 }}
        footnotes={DEFINITION}
      />
    );
    await layOutList(rootOf(tree), BLOCKS);
    await fire(reference(tree), 'onPress');
    expect(calls.toIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: BLOCKS - 1, viewOffset: 0 })
    );
    const before = calls.toIndex.mock.calls.length;
    await act(async () => store().setDefinitionY('1', 40));
    expect(calls.toIndex.mock.calls.length).toBe(before + 1);
    expect(calls.toIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: BLOCKS - 1, viewOffset: -40 })
    );
    // One refinement only.
    await act(async () => store().setDefinitionY('1', 50));
    expect(calls.toIndex.mock.calls.length).toBe(before + 1);
  });

  it('uses a y known at the press in the first scroll', async () => {
    const calls = spyScrollCalls();
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        virtualize={{ initialNumToRender: 1000 }}
        footnotes={DEFINITION}
      />
    );
    await layOutList(rootOf(tree), BLOCKS);
    store().setDefinitionY('1', 40);
    await fire(reference(tree), 'onPress');
    expect(calls.toIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: BLOCKS - 1, viewOffset: -40 })
    );
  });

  it('gives up after 5 s, and a new press cancels a pending refinement', async () => {
    const calls = spyScrollCalls();
    const tree = await renderTree(
      <Markdown
        source={SOURCE}
        virtualize={{ initialNumToRender: 1000 }}
        footnotes={DEFINITION}
      />
    );
    await layOutList(rootOf(tree), BLOCKS);
    await fire(reference(tree), 'onPress');
    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    const after = calls.toIndex.mock.calls.length;
    await act(async () => store().setDefinitionY('1', 40));
    expect(calls.toIndex.mock.calls.length).toBe(after);

    await fire(reference(tree), 'onPress');
    await fire(backLink(tree), 'onPress');
    const last = calls.toIndex.mock.calls.length;
    await act(async () => store().setDefinitionY('1', 41));
    expect(calls.toIndex.mock.calls.length).toBe(last);
  });
});

describe('useMarkdownBlocks', () => {
  function List(props: UseMarkdownBlocksOptions) {
    const blocks = useMarkdownBlocks(props);
    return (
      <FlatList
        data={blocks.data}
        keyExtractor={blocks.keyExtractor}
        renderItem={blocks.renderItem}
        initialNumToRender={100}
      />
    );
  }

  it('passes { offset } and flashes', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List
        source={SOURCE}
        footnotes={DEFINITION}
        onFootnoteScrollTo={onFootnoteScrollTo}
      />
    );
    const flash = jest.spyOn(store(), 'flash');
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      BLOCKS - 1,
      '1',
      expect.anything(),
      { offset: undefined }
    );
    store().setDefinitionY('1', 40);
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      BLOCKS - 1,
      '1',
      expect.anything(),
      { offset: 40 }
    );
    expect(flash).toHaveBeenLastCalledWith({ kind: 'definition', label: '1' });
    await fire(backLink(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      2,
      '1',
      expect.anything(),
      { offset: undefined }
    );
    expect(flash).toHaveBeenLastCalledWith({
      kind: 'reference',
      label: '1',
      reference: 1,
    });
  });

  it('calls again with the offset once the definition is measured', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List
        source={SOURCE}
        footnotes={DEFINITION}
        onFootnoteScrollTo={onFootnoteScrollTo}
      />
    );
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(1);
    await act(async () => store().setDefinitionY('1', 40));
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(2);
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      BLOCKS - 1,
      '1',
      expect.anything(),
      { offset: 40 }
    );
    // One refinement per press.
    await act(async () => store().setDefinitionY('1', 41));
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(2);
  });

  it('calls once when the offset is known at the press', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List
        source={SOURCE}
        footnotes={DEFINITION}
        onFootnoteScrollTo={onFootnoteScrollTo}
      />
    );
    store().setDefinitionY('1', 40);
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(1);
    await act(async () => store().setDefinitionY('1', 41));
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(1);
  });

  it('gives up after 5 s, and a new press cancels the wait', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List
        source={SOURCE}
        footnotes={DEFINITION}
        onFootnoteScrollTo={onFootnoteScrollTo}
      />
    );
    await fire(reference(tree), 'onPress');
    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    await act(async () => store().setDefinitionY('1', 40));
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(1);

    store().setDefinitionY('1', undefined);
    await fire(reference(tree), 'onPress');
    await fire(backLink(tree), 'onPress');
    const calls = onFootnoteScrollTo.mock.calls.length;
    await act(async () => store().setDefinitionY('1', 41));
    expect(onFootnoteScrollTo.mock.calls.length).toBe(calls);
  });

  it('never calls again for a back-link or without target: definition', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List
        source={SOURCE}
        footnotes={DEFINITION}
        onFootnoteScrollTo={onFootnoteScrollTo}
      />
    );
    await fire(backLink(tree), 'onPress');
    await act(async () => store().setDefinitionY('1', 40));
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(1);
  });

  it('without target: definition the offset is undefined and nothing flashes', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List source={SOURCE} onFootnoteScrollTo={onFootnoteScrollTo} />
    );
    const flash = jest.spyOn(store(), 'flash');
    store().setDefinitionY('1', 40);
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      BLOCKS - 1,
      '1',
      expect.anything(),
      { offset: undefined }
    );
    expect(flash).not.toHaveBeenCalled();
  });
});

describe('while streaming (P3-12)', () => {
  const probe = {} as { current: UseMarkdownStreamResult };
  const configs: (FootnoteFocusConfig | null)[] = [];
  function Streamed() {
    const stream = useMarkdownStream();
    const { focus } = useMarkdownPipeline(
      { document: stream.document, footnotes: DEFINITION },
      'Streamed'
    );
    useEffect(() => {
      probe.current = stream;
      configs.push(focus);
    });
    return null;
  }
  beforeEach(() => {
    configs.length = 0;
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  it('has no config and clears the store while a stream runs', async () => {
    await renderTree(<Streamed />);
    await act(async () => probe.current.append(SOURCE));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(configs.at(-1)).toBeNull();

    await act(async () => probe.current.done());
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(configs.at(-1)).toMatchObject({ target: 'definition' });

    store().setDefinitionY('1', 40);
    await act(async () => probe.current.reset());
    await act(async () => probe.current.append(SOURCE));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(configs.at(-1)).toBeNull();
    expect(store().getDefinitionY('1')).toBeUndefined();
  });
});
