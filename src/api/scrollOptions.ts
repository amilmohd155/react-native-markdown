import type {
  JSXElementConstructor,
  ReactElement,
  ReactNode,
  Ref,
  RefCallback,
} from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type {
  MarkdownBlock,
  MarkdownBlockRenderInfo,
} from './useMarkdownBlocks';

/**
 * Options of the owned `ScrollView` (`scroll`, P3-2, P3-4). A typed subset
 * we define, not `ScrollViewProps`; anything else goes through
 * `useMarkdownBlocks()` and your own scroll view.
 * Spec: docs/rewrite/04-api.md#markdown
 */
export interface ScrollOptions {
  /** Rendered above the first block, inside the scrolled content. */
  readonly header?: ReactElement | null;
  /** Rendered below the last block, inside the scrolled content. */
  readonly footer?: ReactElement | null;
  /** Style of the scroll view itself (its frame: size, background). */
  readonly style?: StyleProp<ViewStyle>;
  /** Style of the scrolled content (padding, gap around the blocks). */
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  /** Called while the content scrolls. */
  readonly onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /**
   * Minimum milliseconds between `onScroll` calls (iOS; Android sends every
   * frame). Default: React Native's.
   */
  readonly scrollEventThrottle?: number;
  /**
   * Follow-tail (P3-5): while the user is at the bottom, growing content
   * (a stream) keeps the view at the end, with a non-animated
   * `scrollToEnd`. It never scrolls while the user drags or flings.
   * Leaving the end pauses it: a drag, or an upward scroll that is not a
   * drag (a mouse wheel on the web, your own `scrollTo`). Coming back to
   * within `threshold` pixels of the end, or `ref.scrollToEnd()`, resumes
   * it. A new document starts at the bottom, so a stream that starts empty
   * is followed from its first token. Default threshold: `40`.
   *
   * With a non-function `onScroll` (`Animated.event` on the native driver,
   * a Reanimated handler), position is read at the end of each drag and
   * fling only, and only a drag (or `ref.scrollToEnd()`) moves it back to
   * following.
   */
  readonly autoScroll?: boolean | { readonly threshold: number };
  /** Imperative scrolling: see `MarkdownListRef`. */
  readonly ref?: Ref<MarkdownListRef>;
  /**
   * Receives the instance of the scroll component (`component`, or React
   * Native's `ScrollView` / `FlatList`), in addition to the library's own
   * ref: a ref object, a callback, or Reanimated's `useAnimatedRef()` for
   * `useScrollOffset()` and `scrollTo()`. Pass a stable ref: an inline
   * callback is detached and attached again on every render.
   */
  readonly componentRef?:
    | { current: unknown }
    | { bivarianceHack(instance: unknown): void }['bivarianceHack'];
  /**
   * Renders the scroll view instead of React Native's `ScrollView`, e.g.
   * `Animated.ScrollView` (React Native or Reanimated) or your own wrapper
   * that renders one. Pass a stable component type (module level or
   * memoized), never one created during render: a new type remounts every
   * block. A wrapper must pass `ref` on to the scroll view, or `ref` and
   * `autoScroll` do nothing.
   */
  readonly component?: MarkdownScrollComponent;
}

/**
 * Options of the owned `FlatList` (`virtualize`, P3-2, P3-4): the
 * `ScrollOptions` plus the windowing knobs. Not `FlatListProps`.
 *
 * With `scroll` options too, both apply: a field set here wins over the same
 * field in `scroll`. `scroll`'s `component` (a scroll view) can't render a
 * list, so it is a type error next to `virtualize`.
 */
export interface VirtualizeOptions extends Omit<ScrollOptions, 'component'> {
  /** Blocks mounted on the first render. Default `10`. */
  readonly initialNumToRender?: number;
  /**
   * How much is kept mounted, in screen heights (half above, half below
   * the visible area). Default `11`.
   */
  readonly windowSize?: number;
  /**
   * Renders the list instead of React Native's `FlatList`, e.g.
   * `Animated.FlatList` (React Native or Reanimated) or your own wrapper
   * that renders one. Pass a stable component type (module level or
   * memoized), never one created during render: a new type remounts the
   * list. A wrapper must pass `ref` on to the list, or `ref` and
   * `autoScroll` do nothing.
   */
  readonly component?: MarkdownListComponent;
}

/** A scroll event, as React Native's scroll views send it. */
type ScrollEventHandler = (
  event: NativeSyntheticEvent<NativeScrollEvent>
) => void;

/**
 * The props `<Markdown scroll>` passes to its scroll component. The ref and
 * the layout, size and drag callbacks are passed only with `ref`,
 * `componentRef` or `autoScroll`.
 */
export interface MarkdownScrollComponentProps {
  readonly ref?: RefCallback<unknown>;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly onScroll?: ScrollEventHandler;
  readonly scrollEventThrottle?: number;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange?: (width: number, height: number) => void;
  readonly onScrollBeginDrag?: ScrollEventHandler;
  readonly onScrollEndDrag?: ScrollEventHandler;
  readonly onMomentumScrollBegin?: ScrollEventHandler;
  readonly onMomentumScrollEnd?: ScrollEventHandler;
  readonly children?: ReactNode;
}

/**
 * A scroll view component for `scroll.component`: React Native's
 * `ScrollView`, `Animated.ScrollView`, or a component that takes
 * `MarkdownScrollComponentProps` and renders a scroll view with them.
 */
export type MarkdownScrollComponent =
  JSXElementConstructor<MarkdownScrollComponentProps>;

/** The props `<Markdown virtualize>` passes to its list component. */
export interface MarkdownListComponentProps
  extends Omit<MarkdownScrollComponentProps, 'children'> {
  readonly data: readonly MarkdownBlock[];
  readonly renderItem: (info: MarkdownBlockRenderInfo) => ReactElement;
  readonly keyExtractor: (item: MarkdownBlock, index: number) => string;
  readonly initialNumToRender: number;
  readonly windowSize: number;
  readonly removeClippedSubviews: boolean;
  readonly ListHeaderComponent?: ReactElement;
  readonly ListFooterComponent?: ReactElement;
  readonly onScrollToIndexFailed?: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
}

/**
 * A list component for `virtualize.component`: React Native's `FlatList`,
 * `Animated.FlatList`, or a component that takes
 * `MarkdownListComponentProps` and renders a `FlatList` with them.
 */
export type MarkdownListComponent =
  JSXElementConstructor<MarkdownListComponentProps>;

/** Options of `MarkdownListRef`'s scroll methods. */
export interface MarkdownScrollToOptions {
  /** Default `true`. */
  readonly animated?: boolean;
}

/** Options of `MarkdownListRef.scrollToBlock()`. */
export interface MarkdownScrollToBlockOptions extends MarkdownScrollToOptions {
  /**
   * Where the block lands in the visible area: `0` at the top (default),
   * `0.5` in the middle, `1` at the bottom.
   */
  readonly viewPosition?: number;
  /** Pixels to stop short of the block's position. Default `0`. */
  readonly viewOffset?: number;
}

/**
 * The imperative handle of `<Markdown scroll>` and `<Markdown virtualize>`,
 * passed as the `ref` option. The same on both containers. Calls before the
 * container mounts, or with a `component` that doesn't forward `ref`, do
 * nothing.
 */
export interface MarkdownListRef {
  /** Scrolls to the end, and resumes `autoScroll`. */
  scrollToEnd(options?: MarkdownScrollToOptions): void;
  /**
   * Scrolls to `offset` pixels from the top of the content. Pauses
   * `autoScroll` unless `offset` is at the end.
   */
  scrollToOffset(offset: number, options?: MarkdownScrollToOptions): void;
  /**
   * Scrolls to top-level block `index` (from 0, as `MarkdownBlock.index`),
   * clamped into range; no blocks, or an index that is not a number, does
   * nothing. With `scroll` it lands exactly once the block has been laid
   * out (before that it does nothing). With `virtualize` a block not
   * measured yet is reached by scrolling to an estimate, then retrying.
   * Pauses `autoScroll` until the user (or `scrollToEnd`) returns to the
   * end.
   */
  scrollToBlock(index: number, options?: MarkdownScrollToBlockOptions): void;
}
