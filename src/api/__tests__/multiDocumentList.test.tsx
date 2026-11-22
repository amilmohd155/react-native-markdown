/**
 * The P3-3 chat case (#51): blocks of several documents, each from its own
 * `useMarkdownBlocks()` with its own theme and components, concatenated
 * into ONE FlatList with prefixed keys. Each block renders with its own
 * document's theme and components (no provider around the list), and
 * streaming into one document renders none of the others' blocks.
 *
 * Every cell is mounted (`initialNumToRender` covers the list): this is
 * about render context and memoization, not windowing.
 */
import { createElement, useEffect, useMemo, type ComponentType } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type TestInstance,
  type Tree,
} from '../../__tests__/tree';
import { defaultComponents } from '../../render/defaults';
import type { Components, ElementProps } from '../../render/elements';
import { useMarkdownTheme } from '../../theme';
import { parse } from '../parse';
import { useMarkdownBlocks, type MarkdownBlock } from '../useMarkdownBlocks';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

/** Paragraph renders, by document. */
const renders: string[] = [];

/**
 * The default Paragraph, tagged with the document it belongs to and the
 * theme it read from context, logging each render.
 */
function paragraphFor(doc: string): Partial<Components> {
  const Default = defaultComponents.Paragraph;
  function Tagged(props: ElementProps<'Paragraph'>) {
    renders.push(doc);
    const theme = useMarkdownTheme();
    return createElement(
      'Tagged',
      { doc, themeText: theme.tokens.colors.text },
      <Default {...props} />
    );
  }
  return { Paragraph: Tagged as ComponentType<ElementProps<'Paragraph'>> };
}

const A = paragraphFor('a');
const B = paragraphFor('b');
const C = {
  ...paragraphFor('c'),
  Heading: ({ children }: ElementProps<'Heading'>) =>
    createElement('CHeading', null, children),
};

const docA = parse('# A title\n\nFirst of a.\n\nSecond of a.');
const docB = parse('# B title\n\nOnly paragraph of b.');

const probe = {} as { current: UseMarkdownStreamResult };

/** A chat: two finished messages and one streaming, in one FlatList. */
function Chat() {
  const stream = useMarkdownStream();
  useEffect(() => {
    probe.current = stream;
  });
  const a = useMarkdownBlocks({
    document: docA,
    theme: 'light',
    components: A,
  });
  const b = useMarkdownBlocks({ document: docB, theme: 'dark', components: B });
  const c = useMarkdownBlocks({
    document: stream.document,
    theme: { paragraph: { color: '#123456' } },
    components: C,
  });

  // Items keep their identity (the list skips unchanged cells); the
  // message each one belongs to is looked up for its key.
  const { data, owner } = useMemo(() => {
    const map = new Map<MarkdownBlock, string>();
    for (const [name, blocks] of [
      ['a', a],
      ['b', b],
      ['c', c],
    ] as const) {
      for (const item of blocks.data) map.set(item, name);
    }
    return { data: [...a.data, ...b.data, ...c.data], owner: map };
  }, [a, b, c]);

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => `${owner.get(item)}:${item.key}`}
      // Every result's renderItem renders any item: it reads the item's
      // own table and context.
      renderItem={a.renderItem}
      initialNumToRender={100}
    />
  );
}

const tagged = (tree: Tree) => tree.findAll('Tagged');
const colorOf = (node: TestInstance) => {
  const text = node.children.find(
    (c): c is TestInstance => typeof c !== 'string'
  )!;
  return (StyleSheet.flatten(text.props.style) as { color?: string }).color;
};

async function flush(chunk: string) {
  await act(async () => probe.current.append(chunk));
  await act(async () => {
    jest.advanceTimersByTime(60);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  renders.length = 0;
});
afterEach(() => jest.useRealTimers());

describe('blocks of several documents in one FlatList', () => {
  it('renders each block with its own theme and components', async () => {
    const tree = await renderTree(<Chat />);
    await flush('# C title\n\nStreaming c.');

    const byDoc = (doc: string) =>
      tagged(tree).filter((n) => n.props.doc === doc);
    expect(byDoc('a').map(textOf)).toEqual(['First of a.', 'Second of a.']);
    expect(byDoc('b').map(textOf)).toEqual(['Only paragraph of b.']);
    expect(byDoc('c').map(textOf)).toEqual(['Streaming c.']);

    // Theme: light, dark and custom, each read from its own context and
    // applied to its own default Paragraph.
    const theme = (doc: string) => byDoc(doc)[0]!.props.themeText as string;
    expect(new Set([theme('a'), theme('b'), theme('c')]).size).toBe(3);
    expect(theme('c')).toBe('#123456');
    for (const doc of ['a', 'b', 'c']) {
      for (const node of byDoc(doc)) expect(colorOf(node)).toBe(theme(doc));
    }
    // Components: only c overrides Heading.
    expect(tree.findAll('CHeading').map(textOf)).toEqual(['C title']);
    expect(tree.findAll('Heading')).toHaveLength(0); // default renders Text
    expect(textOf(tree.container)).toContain('A title');
    expect(textOf(tree.container)).toContain('B title');
  });

  it('keys stay unique across documents', async () => {
    const tree = await renderTree(<Chat />);
    await flush('Streaming c.');
    const root = tree.container.children[0] as TestInstance;
    const list = root.props as {
      data: readonly MarkdownBlock[];
      keyExtractor: (item: MarkdownBlock, index: number) => string;
    };
    const keys = list.data.map((item, i) => list.keyExtractor(item, i));
    expect(keys).toEqual(['a:0', 'a:1', 'a:2', 'b:0', 'b:1', 'c:0']);
  });

  it('streaming into one document renders none of the others', async () => {
    const tree = await renderTree(<Chat />);
    await flush('# C title\n\nOne.\n\nTw');
    await flush('o.\n\nThr'); // "One." and "Two." close
    for (const [chunk, text] of [
      ['ee', 'Three'],
      [' and', 'Three and'],
      [' more.', 'Three and more.'],
    ] as const) {
      renders.length = 0;
      await flush(chunk);
      // Only c's open block rendered: a and b, and c's closed blocks, skipped.
      expect(renders).toEqual(['c']);
      expect(
        tagged(tree)
          .filter((n) => n.props.doc === 'c')
          .map(textOf)
      ).toEqual(['One.', 'Two.', text]);
    }
    renders.length = 0;
    await flush('\n\nFour');
    expect(renders.every((doc) => doc === 'c')).toBe(true);
    expect(tagged(tree).filter((n) => n.props.doc === 'a')).toHaveLength(2);
  });
});
