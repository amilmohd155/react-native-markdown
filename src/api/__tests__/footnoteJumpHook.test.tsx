/**
 * The footnote jump of `useMarkdownBlocks()` for your own list (P3-14): the
 * `onFootnoteScrollTo` option, called with the block to scroll to after
 * `onFootnotePress`, and inert while a stream runs (P3-12).
 */
import { useEffect } from 'react';
import { FlatList } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderTree, type Tree } from '../../__tests__/tree';
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
import { fire } from './listHelpers';

// Blocks: 0 plain, 1 a list whose item holds the reference, 2 a table whose
// cell holds the second one, 3 plain, 4 the section.
const SOURCE = [
  'Block A.',
  '- item[^1]',
  '| a | b |\n|---|---|\n| cell[^1] | 2 |',
  'Block B.',
  '[^1]: The note.',
].join('\n\n');
const SECTION = 4;

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

// Two references to the footnote: the first (in the list item) is pressed.
const reference = (tree: Tree) =>
  tree.findAll((n) => n.props.accessibilityLabel === 'Footnote 1')[0]!;
const backLink = (tree: Tree, n: number) =>
  tree.find(
    (node) =>
      node.props.accessibilityLabel ===
      (n === 1 ? 'Back to reference 1' : `Back to reference 1 (${n})`)
  );
const links = (tree: Tree) =>
  tree.findAll((n) => n.props.accessibilityRole === 'link');

beforeEach(() => {
  results.length = 0;
});

describe('onFootnoteScrollTo', () => {
  it('jumps a reference to the footnote section', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List source={SOURCE} onFootnoteScrollTo={onFootnoteScrollTo} />
    );
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenCalledTimes(1);
    expect(onFootnoteScrollTo).toHaveBeenCalledWith(
      SECTION,
      '1',
      {
        index: 1,
        direction: 'definition',
        reference: 1,
      },
      { offset: undefined }
    );
    expect(results.at(-1)!.data).toHaveLength(SECTION + 1);
  });

  it('jumps a back-link to the top-level block of its reference', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List source={SOURCE} onFootnoteScrollTo={onFootnoteScrollTo} />
    );
    // The first reference is inside a list item, the second in a table cell.
    await fire(backLink(tree, 1), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      1,
      '1',
      expect.objectContaining({ direction: 'reference', reference: 1 }),
      { offset: undefined }
    );
    await fire(backLink(tree, 2), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenLastCalledWith(
      2,
      '1',
      expect.objectContaining({ direction: 'reference', reference: 2 }),
      { offset: undefined }
    );
  });

  it('works with a parsed document', async () => {
    const onFootnoteScrollTo = jest.fn();
    const tree = await renderTree(
      <List document={parse(SOURCE)} onFootnoteScrollTo={onFootnoteScrollTo} />
    );
    await fire(reference(tree), 'onPress');
    expect(onFootnoteScrollTo).toHaveBeenCalledWith(
      SECTION,
      '1',
      expect.anything(),
      { offset: undefined }
    );
  });

  it('runs onFootnotePress first, and false skips the jump', async () => {
    const calls: string[] = [];
    let result: boolean | undefined;
    const tree = await renderTree(
      <List
        source={SOURCE}
        onFootnotePress={() => {
          calls.push('press');
          return result === undefined ? undefined : (result as false);
        }}
        onFootnoteScrollTo={() => calls.push('jump')}
      />
    );
    await fire(reference(tree), 'onPress');
    expect(calls).toEqual(['press', 'jump']);

    calls.length = 0;
    result = false;
    await fire(reference(tree), 'onPress');
    expect(calls).toEqual(['press']);
  });

  it('keeps links plain text without the option', async () => {
    const tree = await renderTree(<List source={SOURCE} />);
    expect(links(tree)).toHaveLength(0);
  });

  it('calls the latest callback', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const tree = await renderTree(
      <List source={SOURCE} onFootnoteScrollTo={first} />
    );
    await tree.rerender(<List source={SOURCE} onFootnoteScrollTo={second} />);
    await fire(reference(tree), 'onPress');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  describe('while streaming (P3-12)', () => {
    const probe = {} as { current: UseMarkdownStreamResult };
    function Streamed({
      onFootnoteScrollTo,
    }: {
      readonly onFootnoteScrollTo: UseMarkdownBlocksOptions['onFootnoteScrollTo'];
    }) {
      const stream = useMarkdownStream();
      useEffect(() => {
        probe.current = stream;
      });
      return (
        <List
          document={stream.document}
          onFootnoteScrollTo={onFootnoteScrollTo}
        />
      );
    }
    const advance = () =>
      act(async () => {
        jest.advanceTimersByTime(100);
      });

    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('is inert until done(), then jumps in the new table', async () => {
      const onFootnoteScrollTo = jest.fn();
      const tree = await renderTree(
        <Streamed onFootnoteScrollTo={onFootnoteScrollTo} />
      );
      await act(async () => probe.current.append(SOURCE));
      await advance();
      expect(links(tree)).toHaveLength(0);
      expect(onFootnoteScrollTo).not.toHaveBeenCalled();

      await act(async () => probe.current.done());
      await advance();
      expect(links(tree).length).toBeGreaterThan(0);
      await fire(reference(tree), 'onPress');
      expect(onFootnoteScrollTo).toHaveBeenCalledWith(
        SECTION,
        '1',
        expect.anything(),
        { offset: undefined }
      );
      expect(results.at(-1)!.data).toHaveLength(SECTION + 1);
    });
  });
});
