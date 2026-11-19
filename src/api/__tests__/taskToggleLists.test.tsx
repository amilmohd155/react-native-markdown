/**
 * Task toggling through the containers and the block hook (P3-16 to P3-19):
 * global index across blocks, tasks in blockquotes and footnote definitions,
 * the override store across row remounts, reset on source change.
 */
import { useEffect } from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Markdown } from '../Markdown';
import {
  useMarkdownBlocks,
  type UseMarkdownBlocksOptions,
  type UseMarkdownBlocksResult,
} from '../useMarkdownBlocks';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../useMarkdownStream';

const boxes = () => screen.getAllByRole('checkbox');
const state = (i: number) => boxes()[i]!.props.accessibilityState;
const tap = (i: number) => fireEvent.press(boxes()[i]!);

const SOURCE = '- [ ] a\n- [ ] b\n\npara\n\n> - [ ] q\n\n- [x] c';

function Hook(props: UseMarkdownBlocksOptions) {
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

describe('global index through a container', () => {
  it('virtualize reports the global index and flips the box', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown
        source={SOURCE}
        virtualize={{ initialNumToRender: 100 }}
        onTaskToggle={onTaskToggle}
      />
    );
    expect(boxes()).toHaveLength(4);
    await tap(2);
    await tap(3);
    expect(onTaskToggle.mock.calls).toEqual([
      [{ index: 2, checked: true, text: 'q' }],
      [{ index: 3, checked: false, text: 'c' }],
    ]);
    expect(state(2).checked).toBe(true);
    expect(state(3).checked).toBe(false);
  });

  it('scroll reports the global index', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown source={SOURCE} scroll onTaskToggle={onTaskToggle} />
    );
    await tap(3);
    expect(onTaskToggle).toHaveBeenCalledWith({
      index: 3,
      checked: false,
      text: 'c',
    });
  });

  it('useMarkdownBlocks reports the global index', async () => {
    const onTaskToggle = jest.fn();
    await render(<Hook source={SOURCE} onTaskToggle={onTaskToggle} />);
    await tap(1);
    await tap(2);
    expect(onTaskToggle.mock.calls).toEqual([
      [{ index: 1, checked: true, text: 'b' }],
      [{ index: 2, checked: true, text: 'q' }],
    ]);
  });

  it('useMarkdownBlocks passes enableTaskListItemToggle', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Hook
        source={SOURCE}
        enableTaskListItemToggle={false}
        onTaskToggle={onTaskToggle}
      />
    );
    expect(state(0).disabled).toBe(true);
    await tap(0);
    expect(onTaskToggle).not.toHaveBeenCalled();
    expect(state(0).checked).toBe(false);
  });
});

describe('override store in your own list', () => {
  it('persists when the rows unmount and mount again', async () => {
    function Toggleable({ show }: { show: boolean }) {
      const blocks = useMarkdownBlocks({ source: SOURCE });
      return show ? (
        <FlatList
          data={blocks.data}
          keyExtractor={blocks.keyExtractor}
          renderItem={blocks.renderItem}
          initialNumToRender={100}
        />
      ) : null;
    }
    const view = await render(<Toggleable show />);
    await tap(1);
    await view.rerender(<Toggleable show={false} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await view.rerender(<Toggleable show />);
    expect(state(0).checked).toBe(false);
    expect(state(1).checked).toBe(true);
  });

  it('useMarkdownBlocks clears overrides when the source changes', async () => {
    const view = await render(<Hook source={SOURCE} />);
    await tap(1);
    expect(state(1).checked).toBe(true);
    await view.rerender(<Hook source={SOURCE + '\n'} />);
    expect(state(1).checked).toBe(false);
  });
});

describe('tasks in containers', () => {
  it('blockquote and footnote definition tasks get the global index', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown
        source={
          '- [ ] first\n\n> - [ ] quoted\n\nref[^1]\n\n[^1]: - [ ] in note\n    - [ ] sub'
        }
        onTaskToggle={onTaskToggle}
      />
    );
    const n = boxes().length;
    expect(n).toBeGreaterThanOrEqual(3);
    await tap(1);
    await tap(2);
    expect(onTaskToggle.mock.calls[0]).toEqual([
      { index: 1, checked: true, text: 'quoted' },
    ]);
    expect(onTaskToggle.mock.calls[1]![0]).toMatchObject({
      index: 2,
      checked: true,
      text: 'in note',
    });
    expect(state(1).checked).toBe(true);
    expect(state(2).checked).toBe(true);
  });
});

describe('useMarkdownBlocks while streaming', () => {
  const probe = {} as { current: UseMarkdownStreamResult };
  const results: UseMarkdownBlocksResult[] = [];
  function Streamed({ onTaskToggle }: { onTaskToggle: jest.Mock }) {
    const stream = useMarkdownStream();
    useEffect(() => {
      probe.current = stream;
    });
    return <Hook document={stream.document} onTaskToggle={onTaskToggle} />;
  }
  const run = async (fn: () => void) => {
    await act(async () => fn());
    await act(() => jest.advanceTimersByTime(100));
  };

  beforeEach(() => {
    results.length = 0;
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('is inert until done()', async () => {
    const onTaskToggle = jest.fn();
    await render(<Streamed onTaskToggle={onTaskToggle} />);
    await run(() => probe.current.append('- [ ] a\n\n- [ ] b'));
    expect(state(1).disabled).toBe(true);
    await tap(1);
    expect(onTaskToggle).not.toHaveBeenCalled();
    expect(state(1).checked).toBe(false);
    await run(() => probe.current.done());
    expect(state(1).disabled).toBe(false);
    await tap(1);
    expect(onTaskToggle).toHaveBeenCalledWith({
      index: 1,
      checked: true,
      text: 'b',
    });
  });
});
