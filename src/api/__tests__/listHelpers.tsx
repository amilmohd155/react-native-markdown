/**
 * Helpers for the container tests (#51): host events as a device would
 * send them, and FlatList cells by index, so tests can drive
 * VirtualizedList's real windowing in the test renderer.
 */
import { act } from 'react';
import { FlatList, ScrollView } from 'react-native';
import type { TestInstance, Tree } from '../../__tests__/tree';

/** A scroll event at offset `y`. */
export const scrollEvent = (
  y: number,
  content = 2000,
  viewport = 600,
  timeStamp = 1
) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 300, height: content },
    layoutMeasurement: { width: 300, height: viewport },
    contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    zoomScale: 1,
  },
  timeStamp,
});

export const layoutEvent = (y: number, height: number, width = 300) => ({
  nativeEvent: { layout: { x: 0, y, width, height } },
});

/** Calls the host prop `name` inside `act`. */
export async function fire(
  host: TestInstance,
  name: string,
  ...args: unknown[]
) {
  await act(async () => {
    const handler = (host.props as Record<string, unknown>)[name];
    if (typeof handler !== 'function') {
      throw new Error(`${host.type} has no ${name} handler`);
    }
    (handler as (...a: unknown[]) => void)(...args);
  });
}

/** The single host element at the root of `tree`. */
export function rootOf(tree: Tree): TestInstance {
  const [root, ...rest] = tree.container.children;
  if (rest.length > 0 || typeof root !== 'object') {
    throw new Error('expected a single root element');
  }
  return root;
}

type Fiber = {
  type: unknown;
  memoizedProps: Record<string, unknown> | null;
  return: Fiber | null;
};

/** The nearest component ancestor of `host` of type `type`. */
function ancestorProps(
  host: TestInstance,
  match: (fiber: Fiber) => boolean
): Record<string, unknown> | null {
  let fiber = (host.unstable_fiber as Fiber).return;
  for (; fiber !== null; fiber = fiber.return) {
    if (match(fiber)) return fiber.memoizedProps;
  }
  return null;
}

/** Whether a component of type `type` rendered `host`. */
export function renderedBy(host: TestInstance, type: unknown): boolean {
  return ancestorProps(host, (f) => f.type === type) !== null;
}

/**
 * The mounted cells of the FlatList whose root host is `root`: the cell
 * `View` (with VirtualizedList's `onLayout`) and its item index.
 */
export function cellsOf(
  root: TestInstance
): { readonly host: TestInstance; readonly index: number }[] {
  const content = root.children[0];
  if (typeof content !== 'object') return [];
  const cells: { host: TestInstance; index: number }[] = [];
  for (const child of content.children) {
    if (typeof child === 'string' || !child.props.onLayout) continue;
    const props = ancestorProps(
      child,
      (f) =>
        f.memoizedProps !== null &&
        typeof f.memoizedProps.cellKey === 'string' &&
        typeof f.memoizedProps.index === 'number'
    );
    if (props !== null)
      cells.push({ host: child, index: props.index as number });
  }
  return cells;
}

/** Mounted cell indices, in order. */
export const mountedIndices = (root: TestInstance) =>
  cellsOf(root).map((c) => c.index);

/**
 * Lays out the list as a device would: a `viewport`-high frame and every
 * mounted cell `cellHeight` high at `index * cellHeight`, then lets
 * VirtualizedList's batched window update run (fake timers).
 */
export async function layOutList(
  root: TestInstance,
  count: number,
  viewport = 600,
  cellHeight = 100
) {
  await fire(root, 'onLayout', layoutEvent(0, viewport));
  await fire(root, 'onContentSizeChange', 300, count * cellHeight);
  await layOutCells(root, cellHeight);
}

/** Reports a layout for every mounted cell not laid out before. */
export async function layOutCells(root: TestInstance, cellHeight = 100) {
  for (const { host, index } of cellsOf(root)) {
    await fire(host, 'onLayout', layoutEvent(index * cellHeight, cellHeight));
  }
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
}

/**
 * Scrolls the list to `y` the way a device does (one scroll event), then
 * lays out whatever cells the new window mounted, until it settles.
 */
export async function scrollListTo(
  root: TestInstance,
  y: number,
  count: number,
  cellHeight = 100,
  viewport = 600
) {
  const content = count * cellHeight;
  // Spaced timestamps: VirtualizedList derives velocity from them.
  stamp += 100;
  await fire(root, 'onScroll', scrollEvent(y, content, viewport, stamp));
  for (let i = 0; i < 5; i++) await layOutCells(root, cellHeight);
}
let stamp = 1;

/**
 * The scroll view's methods: React Native's Jest setup mocks `ScrollView`
 * with `jest.fn()` methods on its prototype, shared by every instance, and
 * `FlatList` scrolls through them.
 */
export const scrollViewMocks = ScrollView.prototype as unknown as Record<
  'scrollTo' | 'scrollToEnd',
  jest.Mock
>;

/** Spies on every scroll method a container could call. */
export function spyScrollCalls() {
  scrollViewMocks.scrollTo.mockClear();
  scrollViewMocks.scrollToEnd.mockClear();
  const toIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
  const toOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
  const listToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
  return {
    toIndex,
    toOffset,
    listToEnd,
    /** Every scroll call so far, by method. */
    all: () => ({
      scrollTo: scrollViewMocks.scrollTo.mock.calls.length,
      scrollToEnd: scrollViewMocks.scrollToEnd.mock.calls.length,
      scrollToIndex: toIndex.mock.calls.length,
      scrollToOffset: toOffset.mock.calls.length,
      listScrollToEnd: listToEnd.mock.calls.length,
    }),
  };
}
