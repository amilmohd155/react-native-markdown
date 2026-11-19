/**
 * Library-owned task toggling (P3-16, P3-18, P3-19): the override store,
 * its reset keys and the interactive state of the boxes.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Markdown } from '../../api/Markdown';
import { parse } from '../../api/parse';
import {
  useMarkdownStream,
  type UseMarkdownStreamResult,
} from '../../api/useMarkdownStream';
import { BlockList } from '../Block';
import { createRenderCtx } from '../context';
import { useRenderContext } from '../contexts';
import { useTaskState } from '../useTaskState';
import { defaultComponents } from '../defaults';
import type { Components, ElementProps } from '../elements';
import { getDefaultTheme } from '../../theme';
import { tableFor } from './helpers';

const boxes = () => screen.getAllByRole('checkbox');
const state = (i: number) => boxes()[i]!.props.accessibilityState;
const tap = (i: number) => fireEvent.press(boxes()[i]!);

describe('task toggle', () => {
  it('flips the box on a tap without any handler', async () => {
    await render(<Markdown source={'- [ ] a\n- [x] b'} />);
    expect(state(0)).toEqual({ checked: false, disabled: false });
    await tap(0);
    await tap(1);
    expect(state(0).checked).toBe(true);
    expect(state(1).checked).toBe(false);
    await tap(0);
    expect(state(0).checked).toBe(false);
  });

  it('reports { index, checked, text } with a global index', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown
        source={'- [ ] one\n\npara\n\n- [x] **two** `c`\n  - [ ] sub'}
        onTaskToggle={onTaskToggle}
      />
    );
    await tap(1);
    await tap(2);
    await tap(1);
    expect(onTaskToggle.mock.calls).toEqual([
      [{ index: 1, checked: false, text: 'two c' }],
      [{ index: 2, checked: true, text: 'sub' }],
      [{ index: 1, checked: true, text: 'two c' }],
    ]);
  });

  it('is read-only with enableTaskListItemToggle={false}', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown
        source={'- [ ] a'}
        enableTaskListItemToggle={false}
        onTaskToggle={onTaskToggle}
      />
    );
    expect(boxes()[0]!.props.onPress).toBeUndefined();
    expect(state(0)).toEqual({ checked: false, disabled: true });
    await tap(0);
    expect(onTaskToggle).not.toHaveBeenCalled();
    expect(state(0).checked).toBe(false);
  });
});

describe('override store', () => {
  it('survives a row unmounting and mounting again', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const table = tableFor('- [ ] a\n- [ ] b');
    const view = await render(<BlockList table={table} ctx={ctx} />);
    await tap(1);
    expect(state(1).checked).toBe(true);
    await view.unmount();
    await render(<BlockList table={table} ctx={ctx} />);
    expect(state(0).checked).toBe(false);
    expect(state(1).checked).toBe(true);
  });

  it('re-renders only the toggled item', async () => {
    const ctx = createRenderCtx({ components: defaultComponents });
    const get = jest.spyOn(ctx.tasks, 'get');
    await render(<BlockList table={tableFor('- [ ] a\n- [ ] b')} ctx={ctx} />);
    get.mockClear();
    await tap(0);
    // Item 0 read its snapshot; item 1 was never notified, so never read.
    expect(get).toHaveBeenCalled();
    expect(get.mock.calls.every(([i]) => i === 0)).toBe(true);
    expect(state(1).checked).toBe(false);
  });

  it('leaves ctx and the other blocks alone on a tap', async () => {
    let renders = 0;
    const Counting = (props: ElementProps<'ListItem'>) => {
      renders++;
      const Default = defaultComponents.ListItem;
      return <Default {...props} />;
    };
    await render(
      <Markdown
        source={'- [ ] a\n- [ ] b\n\ntext'}
        components={{ ListItem: Counting } as Partial<Components>}
      />
    );
    const before = renders;
    await tap(0);
    expect(state(0).checked).toBe(true);
    expect(renders).toBe(before);
  });

  it('keeps the same store while the reset key holds, swaps it when it changes', async () => {
    const seen: unknown[] = [];
    const Probe = (props: ElementProps<'ListItem'>) => {
      seen.push(useRenderContext().tasks);
      const Default = defaultComponents.ListItem;
      return <Default {...props} />;
    };
    const el = (source: string, softBreak: 'space' | 'newline' = 'space') => (
      <Markdown
        source={source}
        softBreak={softBreak}
        components={{ ListItem: Probe } as Partial<Components>}
      />
    );
    const view = await render(el('- [ ] a'));
    await view.rerender(el('- [ ] a', 'newline'));
    expect(new Set(seen).size).toBe(1);
    await view.rerender(el('- [ ] a\n- [ ] b'));
    expect(new Set(seen).size).toBe(2);
  });
});

describe('reset', () => {
  it('never renders a stale override for an item mounted by a source change', async () => {
    const reads: (boolean | undefined)[] = [];
    const Probe = (props: ElementProps<'ListItem'>) => {
      const { tasks } = useRenderContext();
      if (props.taskIndex !== null) reads.push(tasks.get(props.taskIndex));
      const Default = defaultComponents.ListItem;
      return <Default {...props} />;
    };
    const el = (source: string) => (
      <Markdown
        source={source}
        components={{ ListItem: Probe } as Partial<Components>}
      />
    );
    const view = await render(el('- [ ] a'));
    await tap(0);
    expect(state(0).checked).toBe(true);
    reads.length = 0;
    // The list is a new block at the same index, so its item mounts fresh.
    await view.rerender(el('Intro\n\n- [ ] a'));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads).not.toContain(true);
    expect(state(0).checked).toBe(false);
  });

  it('clears the overrides when the source changes, not otherwise', async () => {
    const el = (source: string, softBreak: 'space' | 'newline' = 'space') => (
      <Markdown source={source} softBreak={softBreak} />
    );
    const view = await render(el('- [ ] a'));
    await tap(0);
    expect(state(0).checked).toBe(true);
    // Another prop: same source, same overrides.
    await view.rerender(el('- [ ] a', 'newline'));
    expect(state(0).checked).toBe(true);
    // A new source string, even one that renders the same box: cleared.
    await view.rerender(el('- [ ] a\n'));
    expect(state(0).checked).toBe(false);
  });

  describe('streams', () => {
    const probe = {} as { current: UseMarkdownStreamResult };
    function Streamed() {
      const stream = useMarkdownStream();
      useEffect(() => {
        probe.current = stream;
      });
      return <Markdown document={stream.document} />;
    }
    const run = async (fn: () => void) => {
      await act(async () => fn());
      await act(() => jest.advanceTimersByTime(100));
    };

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('are inert until done, then interactive', async () => {
      await render(<Streamed />);
      await run(() => probe.current.append('- [ ] a\n\n- [ ] b'));
      expect(state(0).disabled).toBe(true);
      await tap(0);
      expect(state(0).checked).toBe(false);
      await run(() => probe.current.done());
      expect(state(0).disabled).toBe(false);
      await tap(0);
      expect(state(0).checked).toBe(true);
    });

    it('keeps overrides across document changes, clears them on a new stream', async () => {
      await render(<Streamed />);
      await run(() => {
        probe.current.append('- [ ] a\n\n- [ ] b');
        probe.current.done();
      });
      await tap(0);
      const first = probe.current.document;
      // A new document, same prefixId.
      await run(() => probe.current.append('\n\nmore'));
      expect(probe.current.document).not.toBe(first);
      expect(state(0).checked).toBe(true);
      // A new stream: new prefixId.
      await run(() => probe.current.reset('- [ ] a'));
      expect(state(0).checked).toBe(false);
    });
  });

  it('keys a pre-parsed document on its text: same text keeps overrides, other text clears them', async () => {
    const a = parse('- [ ] a');
    const b = parse('- [ ] a');
    const c = parse('- [ ] a\n- [ ] b');
    const view = await render(<Markdown document={a} />);
    await tap(0);
    await view.rerender(<Markdown document={a} softBreak="newline" />);
    expect(state(0).checked).toBe(true);
    // A re-parse of the same text (a parent re-render) keeps the tick.
    await view.rerender(<Markdown document={b} />);
    expect(state(0).checked).toBe(true);
    // Edited text clears.
    await view.rerender(<Markdown document={c} />);
    expect(state(0).checked).toBe(false);
  });
});

describe('useTaskState', () => {
  const Custom = ({
    taskIndex,
    checked,
    text,
    children,
  }: ElementProps<'ListItem'>) => {
    const task = useTaskState(taskIndex, checked, text);
    return (
      <View>
        <Pressable testID={`c${taskIndex}`} onPress={task.toggle}>
          <Text>{`${task.checked ? 'on' : 'off'}:${task.interactive}`}</Text>
        </Pressable>
        {children}
      </View>
    );
  };
  const components = { ListItem: Custom } as Partial<Components>;

  it('shows the displayed state, toggles and fires onTaskToggle', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown
        source={'- [ ] a\n- [x] b'}
        components={components}
        onTaskToggle={onTaskToggle}
      />
    );
    expect(
      screen.getAllByText(/^o[nf]+:true$/).map((n) => n.props.children)
    ).toEqual(['off:true', 'on:true']);
    await fireEvent.press(screen.getByTestId('c0'));
    expect(screen.getAllByText('on:true')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('c1'));
    expect(onTaskToggle.mock.calls).toEqual([
      [{ index: 0, checked: true, text: 'a' }],
      [{ index: 1, checked: false, text: 'b' }],
    ]);
  });

  it('shares the store with the default items', async () => {
    const Mixed = (props: ElementProps<'ListItem'>) =>
      props.taskIndex === 0 ? (
        <Custom {...props} />
      ) : (
        <defaultComponents.ListItem {...props} />
      );
    const ctx = createRenderCtx({
      components: { ...defaultComponents, ListItem: Mixed },
    });
    await render(<BlockList table={tableFor('- [ ] a\n- [ ] b')} ctx={ctx} />);
    await act(() => {
      ctx.tasks.set(0, true);
      ctx.tasks.set(1, true);
    });
    expect(screen.getByText('on:true')).toBeTruthy();
    expect(state(0).checked).toBe(true);
    await tap(0);
    expect(ctx.tasks.get(1)).toBe(false);
  });

  it('is not interactive when read-only, and toggle does nothing', async () => {
    const onTaskToggle = jest.fn();
    await render(
      <Markdown
        source={'- [ ] a'}
        components={components}
        enableTaskListItemToggle={false}
        onTaskToggle={onTaskToggle}
      />
    );
    expect(screen.getByText('off:false')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('c0'));
    expect(onTaskToggle).not.toHaveBeenCalled();
    expect(screen.getByText('off:false')).toBeTruthy();
  });

  it('is inert for a non-task item', async () => {
    await render(<Markdown source={'- plain'} components={components} />);
    expect(screen.getByText('off:false')).toBeTruthy();
  });
});

describe('task look and a11y (P3-20)', () => {
  const style = (text: string) => {
    const node = screen.getByText(text);
    return StyleSheet.flatten(node.props.style) ?? {};
  };
  const struck = (text: string) =>
    style(text).textDecorationLine === 'line-through';

  it('strikes and dims a source-checked item, not an unchecked one', async () => {
    await render(<Markdown source={'- [x] done\n- [ ] open'} />);
    expect(struck('done')).toBe(true);
    expect(style('done').opacity).toBe(0.6);
    expect(struck('open')).toBe(false);
  });

  it('follows a tap, both ways', async () => {
    await render(<Markdown source={'- [ ] a\n- [x] b'} />);
    await tap(0);
    await tap(1);
    expect(struck('a')).toBe(true);
    expect(struck('b')).toBe(false);
  });

  it('does not pass a checked parent style to its sub-items', async () => {
    await render(
      <Markdown source={'- [x] parent\n  - [ ] child\n  - [x] other'} />
    );
    expect(struck('parent')).toBe(true);
    expect(style('parent').opacity).toBe(0.6);
    expect(struck('child')).toBe(false);
    expect(style('child').opacity).toBeUndefined();
    expect(struck('other')).toBe(true);
    await tap(0); // unchecking the parent does not touch the children
    expect(struck('parent')).toBe(false);
    expect(struck('other')).toBe(true);
  });

  it('restores the outer cascade for a sub-list of a checked item', async () => {
    await render(<Markdown source={'> - [x] a\n>   - [ ] b'} />);
    expect(struck('a')).toBe(true);
    expect(struck('b')).toBe(false);
    expect(style('b').color).toBe(getDefaultTheme().tokens.colors.muted);
  });

  it('keeps a blockquote style for a sub-list inside a checked item', async () => {
    await render(<Markdown source={'- [x] a\n\n  > - b'} />);
    expect(struck('a')).toBe(true);
    expect(struck('b')).toBe(false);
    expect(style('b').color).toBe(getDefaultTheme().tokens.colors.muted);
  });

  it('takes checkbox colors and size from the theme', async () => {
    await render(
      <Markdown
        source={'- [ ] a\n- [x] b'}
        theme={{
          checkbox: { color: '#111111', checkedColor: '#22aa22', size: 30 },
        }}
      />
    );
    const glyphs = screen.getAllByText(/[☐☑]/);
    expect(StyleSheet.flatten(glyphs[0]!.props.style)).toMatchObject({
      color: '#111111',
      fontSize: 30,
    });
    expect(StyleSheet.flatten(glyphs[1]!.props.style)).toMatchObject({
      color: '#22aa22',
      fontSize: 30,
    });
  });

  it('merges checkedText onto the default, or turns it off', async () => {
    const { rerender } = await render(
      <Markdown
        source={'- [x] done'}
        theme={{ checkbox: { checkedText: { opacity: 0.3 } } }}
      />
    );
    expect(style('done')).toMatchObject({
      textDecorationLine: 'line-through',
      opacity: 0.3,
    });
    await rerender(
      <Markdown
        source={'- [x] done'}
        theme={{ checkbox: { checkedText: false } }}
      />
    );
    expect(struck('done')).toBe(false);
    expect(style('done').opacity).toBeUndefined();
  });

  it('is at least 44pt wide with hitSlop, right slop within the marker column', async () => {
    await render(<Markdown source={'- [ ] a'} />);
    const slop = boxes()[0]!.props.hitSlop;
    // glyph 16 -> ~10.7 wide (0.67 em), measured on device
    expect(16 * 0.67 + slop.left + slop.right).toBeGreaterThanOrEqual(44);
    // the right slop stays inside the 20 wide marker column (the item
    // content covers what is beyond it); the left slop makes up the rest
    expect(16 * 0.67 + slop.right).toBeLessThanOrEqual(20);
    expect(slop.left).toBeGreaterThan(slop.right);
  });

  it('has no vertical slop in a tight list, so rows never overlap', async () => {
    await render(<Markdown source={'- [ ] a\n- [ ] b\n  - [ ] c'} />);
    for (const box of boxes()) {
      expect(box.props.hitSlop.top).toBe(0);
      expect(box.props.hitSlop.bottom).toBe(0);
    }
  });

  it('caps vertical slop at half the gap between loose items', async () => {
    await render(<Markdown source={'- [ ] a\n\n- [ ] b'} />);
    const { top, bottom } = boxes()[0]!.props.hitSlop;
    const gap = getDefaultTheme().tokens.spacing.block;
    expect(top).toBe(bottom);
    expect(top).toBeGreaterThan(0);
    expect(top + bottom).toBeLessThanOrEqual(gap);
  });

  it('labels the box with the item text', async () => {
    await render(<Markdown source={'- [ ] buy **milk**'} />);
    expect(boxes()[0]!.props.accessibilityLabel).toBe('buy milk');
  });

  it('is disabled and does not toggle when read-only', async () => {
    await render(
      <Markdown source={'- [ ] a'} enableTaskListItemToggle={false} />
    );
    expect(state(0).disabled).toBe(true);
    await tap(0);
    expect(state(0).checked).toBe(false);
  });
});
