/**
 * The headless block hook (P3-3): its output in a plain `FlatList` renders
 * what `<Markdown>` renders, streams with only the open block re-rendering,
 * and keeps its functions stable.
 * Spec: docs/rewrite/phase-3/virtualization.md
 */
import { createElement, useEffect, type ReactNode } from 'react';
import { FlatList } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  renderTree,
  textOf,
  type JsonElement,
  type TestInstance,
} from '../../__tests__/tree';
import { hostComponents } from '../../render/__tests__/helpers';
import type { Components } from '../../render/elements';
import { ELEMENT_NAMES } from '../../theme';
import { Markdown } from '../Markdown';
import { parse } from '../parse';
import {
  useMarkdownBlocks,
  type UseMarkdownBlocksOptions,
  type UseMarkdownBlocksResult,
} from '../useMarkdownBlocks';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const SOURCE = [
  '# Title',
  'Some *text* and a [link](https://example.com).',
  '![alt](https://example.com/a.png)',
  '> quoted',
  '- a\n- b',
  '```js\ncode\n```',
  '---',
  '| a | b |\n|---|---|\n| 1 | 2 |',
  '<div>html</div>',
  'Note[^1].\n\n[^1]: The note.',
].join('\n\n');

/** Every result the hook returned, in render order. */
const results: UseMarkdownBlocksResult[] = [];

function List(props: UseMarkdownBlocksOptions) {
  const blocks = useMarkdownBlocks(props);
  useEffect(() => {
    results.push(blocks);
  });
  return (
    <FlatList
      data={blocks.data}
      keyExtractor={blocks.keyExtractor}
      renderItem={blocks.renderItem}
      initialNumToRender={100}
    />
  );
}

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

beforeEach(() => {
  results.length = 0;
});

describe('useMarkdownBlocks in a FlatList', () => {
  it('renders the same blocks as <Markdown>', async () => {
    const components = hostComponents();
    const markdown = await renderTree(
      <Markdown source={SOURCE} components={components} />
    );
    const list = await renderTree(
      <List source={SOURCE} components={components} />
    );
    const expected = topBlocks(markdown.container);
    expect(expected.length).toBeGreaterThan(8);
    expect(topBlocks(list.container)).toEqual(expected);
  });

  it('renders the default elements without a provider around the list', async () => {
    const markdown = await renderTree(<Markdown source={SOURCE} />);
    const list = await renderTree(<List source={SOURCE} />);
    expect(textOf(list.container)).toBe(textOf(markdown.container));
  });

  it('renders a document from parse()', async () => {
    const list = await renderTree(<List document={parse('a\n\nb **c**')} />);
    expect(textOf(list.container)).toBe('ab c');
  });

  it('keeps its result when re-rendered with equal props', async () => {
    const root = await renderTree(
      <List source={'a\n\nb'} plugins={[]} components={{}} />
    );
    const before = results.at(-1)!;
    await root.rerender(
      <List source={'a\n\nb'} plugins={[]} components={{}} />
    );
    expect(results.at(-1)).toBe(before);
  });

  it('throws without input', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      renderTree(<List {...({} as UseMarkdownBlocksOptions)} />)
    ).rejects.toThrow('useMarkdownBlocks() needs a `source` or a `document`.');
    spy.mockRestore();
  });

  it('gives each block kind its element name as the item type', async () => {
    await renderTree(<List source={SOURCE} />);
    const { data, getItemType } = results.at(-1)!;
    expect(data.map((item) => getItemType(item))).toEqual([
      'Heading',
      'Paragraph',
      'Image',
      'Blockquote',
      'List',
      'CodeBlock',
      'Divider',
      'Table',
      'HtmlBlock',
      'Paragraph',
      'FootnoteSection',
    ]);
  });

  it('types a denied image paragraph as Paragraph', async () => {
    await renderTree(
      <List source="![alt](https://x.dev/a.png)" images="deny" />
    );
    const { data, getItemType } = results.at(-1)!;
    expect(getItemType(data[0]!)).toBe('Paragraph');
  });

  it('keys items by block index', async () => {
    await renderTree(<List source={'a\n\nb\n\nc'} />);
    const { data, keyExtractor } = results.at(-1)!;
    expect(data.map((item) => keyExtractor(item))).toEqual(['0', '1', '2']);
    expect(data.map((item) => item.index)).toEqual([0, 1, 2]);
  });
});

describe('useMarkdownBlocks while streaming', () => {
  /** Paragraph renders, by text, since the last reset. */
  const renders: string[] = [];
  const components = {
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
    return <List document={stream.document} components={components} />;
  }

  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
  const flush = async (chunk: string) => {
    renders.length = 0;
    await act(async () => probe.current.append(chunk));
    await advance(100);
  };
  const paragraphs = (root: { findAll(m: string): TestInstance[] }) =>
    root.findAll('Paragraph').map(textOf);

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
      // Only the open block rendered: closed blocks kept their items.
      expect(renders).toEqual([tail]);
    }

    // A new block: the closed tail and the new one render, nothing earlier.
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

  it('changes data per flush and keeps the functions and closed items', async () => {
    await renderTree(<Streamed />);
    await flush('One.\n\nTwo.\n\nThr');
    // The stream marks "One." and "Two." stable from the next flush on.
    await flush('e');
    const first = results.at(-1)!;

    for (const chunk of ['e', ' and', ' more.']) {
      const before = results.at(-1)!;
      await flush(chunk);
      const after = results.at(-1)!;
      expect(after.data).not.toBe(before.data);
      expect(after.renderItem).toBe(first.renderItem);
      expect(after.keyExtractor).toBe(first.keyExtractor);
      expect(after.getItemType).toBe(first.getItemType);
      // Closed blocks keep their item; the open tail gets a new one.
      expect(after.data[0]).toBe(before.data[0]);
      expect(after.data[1]).toBe(before.data[1]);
      expect(after.data[2]).not.toBe(before.data[2]);
    }
  });
});
