import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  FlatList,
  ScrollView,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { blockKey, type NodeTable } from '../model';
import {
  blockElement,
  blockElements,
  blockPropsEqual,
  BlockProviders,
  type BlockProps,
} from '../render/Block';
import { useBlockItems } from '../render/blockItems';
import { blockTaskCount } from '../render/tasks';
import type { RenderCtx } from '../render/context';
import type { FadePlan } from '../render/fade';
import type { FootnoteFocusConfig } from '../render/footnoteFocus';
import { footnoteTarget } from '../render/footnoteTargets';
import {
  assignRef,
  AUTO_SCROLL_THROTTLE,
  autoScrollThreshold,
  isPlainHandler,
  ScrollController,
} from './scrollControl';
import type {
  MarkdownListComponent,
  MarkdownListComponentProps,
  MarkdownScrollComponent,
  MarkdownScrollComponentProps,
  ScrollOptions,
  VirtualizeOptions,
} from './scrollOptions';
import {
  useMissingRefWarning,
  useNestedScrollerWarning,
  useUnstableComponentWarning,
} from './devWarnings';
import { refineOnMeasure } from './footnoteRefine';
import type { FootnoteJumpRef } from './pipeline';
import { keyExtractor, renderItem } from './useMarkdownBlocks';

/**
 * The two owned scroll containers of `<Markdown>` (P3-2): `scroll` renders a
 * `ScrollView` with every block mounted, `virtualize` a `FlatList`. Both
 * render the same memoized `Block`s as the default `View` (`BlockList`).
 * Spec: docs/rewrite/phase-3/virtualization.md
 */

/** `virtualize` defaults (P3-2): see `VirtualizeOptions`. */
export const LIST_DEFAULTS = Object.freeze({
  initialNumToRender: 10,
  windowSize: 11,
  // Off: RN's docs warn of missing content, and RN #58910 is a regression
  // with it on.
  removeClippedSubviews: false,
});

const NO_OPTIONS = Object.freeze({});

/** The options object, or `undefined` for `true`, `false` or no prop. */
const optionsOf = <T extends object>(value: boolean | T | undefined) =>
  typeof value === 'object' ? value : undefined;

/**
 * The options of the owned `FlatList`: `virtualize`'s, with every field it
 * leaves unset taken from `scroll` (the combination rule in
 * `VirtualizeOptions`). `scroll`'s `component` is a scroll view, never the
 * list, even when untyped code passes one.
 */
export function listOptions(
  scroll: boolean | Omit<ScrollOptions, 'component'> | undefined,
  virtualize: true | VirtualizeOptions
): VirtualizeOptions {
  const v = optionsOf(virtualize);
  const s = optionsOf(scroll);
  if (s === undefined) return v ?? NO_OPTIONS;
  const merged: Record<string, unknown> = { ...s, component: undefined };
  for (const [key, value] of Object.entries(v ?? NO_OPTIONS)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as VirtualizeOptions;
}

type ScrollProps = Omit<MarkdownScrollComponentProps, 'children'> &
  Pick<MarkdownListComponentProps, 'onScrollToIndexFailed'>;

/**
 * The scroll view props both containers pass, from the user's options: the
 * one place scroll event props are assembled. With no `ref`,
 * `componentRef` or `autoScroll`, exactly the user's props (no handler of
 * ours, so no extra events); otherwise the scroll control's handlers
 * (./scrollControl), composed with the user's. The footnote jump (P3-8)
 * needs the instance and, in `scroll`, measured blocks, like `ref`; it is
 * not a reason to warn about a missing ref (P3-7): without one the jump
 * does nothing.
 */
function useScrollProps(
  options: Omit<ScrollOptions, 'component'>,
  list: boolean,
  blockCount: number,
  slot: string,
  jump: boolean
): {
  readonly props: ScrollProps;
  readonly control: ScrollController;
  /** Blocks are measured (`scroll`: one wrapper `View` each). */
  readonly measured: boolean;
} {
  const {
    style,
    contentContainerStyle,
    onScroll,
    scrollEventThrottle,
    autoScroll,
    ref,
    componentRef,
  } = options;
  const [control] = useState(() => new ScrollController(list));
  const threshold = autoScrollThreshold(autoScroll);
  const follow = threshold !== null;
  const hasRef = ref !== undefined && ref !== null;
  const asked = follow || hasRef || componentRef !== undefined;
  const attach = asked || jump;
  // `scroll` measures blocks for `scrollToBlock`, and both clamp to the
  // content and the viewport.
  const measure = follow || ((hasRef || jump) && !list);

  useLayoutEffect(() => control.configure(threshold, blockCount));
  useEffect(() => () => control.dispose(), [control]);
  useImperativeHandle(ref, () => control.handle, [control]);

  const received = useRef(false);
  useMissingRefWarning(asked, received, slot);

  const setRef = useCallback(
    (instance: unknown) => {
      received.current = instance !== null && instance !== undefined;
      control.setInstance(instance);
      assignRef(componentRef, instance);
    },
    [control, componentRef]
  );

  const props = useMemo((): ScrollProps => {
    const base = {
      style,
      contentContainerStyle,
      onScroll,
      scrollEventThrottle,
    };
    if (!attach) return base;
    const own: { -readonly [K in keyof ScrollProps]: ScrollProps[K] } = {
      ...base,
      ref: setRef,
    };
    if (measure) {
      own.onLayout = control.onLayout;
      own.onContentSizeChange = control.onContentSizeChange;
    }
    if (follow) {
      own.onScroll = wrapScroll(onScroll, control);
      own.scrollEventThrottle = scrollEventThrottle ?? AUTO_SCROLL_THROTTLE;
      own.onScrollBeginDrag = control.onScrollBeginDrag;
      own.onScrollEndDrag = control.onScrollEndDrag;
      own.onMomentumScrollBegin = control.onMomentumScrollBegin;
      own.onMomentumScrollEnd = control.onMomentumScrollEnd;
    }
    if (list && (hasRef || componentRef !== undefined || jump)) {
      own.onScrollToIndexFailed = control.onScrollToIndexFailed;
      // A drag ends a pending `scrollToBlock` / `scrollToEnd` retry
      // (follow-tail's own drag handler does the same).
      own.onScrollBeginDrag =
        (follow ? control.onScrollBeginDrag : undefined) ?? control.cancel;
    }
    return own;
  }, [
    style,
    contentContainerStyle,
    onScroll,
    scrollEventThrottle,
    attach,
    measure,
    follow,
    hasRef,
    componentRef,
    list,
    jump,
    control,
    setRef,
  ]);
  return { props, control, measured: hasRef || jump };
}

/**
 * Follow-tail's `onScroll`: ours, then the user's. A handler that is not a
 * plain function (`Animated.event` on the native driver, Reanimated) is
 * passed through untouched, and follow-tail reads position from the drag
 * and momentum callbacks only.
 */
function wrapScroll(
  user: ScrollOptions['onScroll'],
  control: ScrollController
): ScrollOptions['onScroll'] {
  if (user === undefined) return control.onScroll;
  if (!isPlainHandler(user)) return user;
  return (event) => {
    control.onScroll(event);
    user(event);
  };
}

interface MeasuredBlockProps extends BlockProps {
  /** Read by the inner block at its mount only (P2b-5). */
  readonly fade: FadePlan | null;
  readonly onBlockLayout: ScrollController['onBlockLayout'];
  readonly onBlockUnmount: ScrollController['forgetBlock'];
}

/**
 * A `Block` in a `View` that reports its offset, for `scrollToBlock` in
 * `scroll` mode: one view and one layout event per block, only with a
 * `ref`. Memoized like `Block`, so streaming re-renders only the tail.
 */
const MeasuredBlock = memo(
  function MeasuredBlockImpl({
    table,
    index,
    ctx,
    taskBase,
    fade,
    onBlockLayout,
    onBlockUnmount,
  }: MeasuredBlockProps) {
    // A layout effect: forgotten in the commit, before a new view's layout.
    useLayoutEffect(() => () => onBlockUnmount(index), [onBlockUnmount, index]);
    const onLayout = useCallback(
      (event: LayoutChangeEvent) => {
        const { y, height } = event.nativeEvent.layout;
        onBlockLayout(index, y, height);
      },
      [onBlockLayout, index]
    );
    return (
      <View onLayout={onLayout}>
        {blockElement(undefined, table, index, ctx, fade, taskBase)}
      </View>
    );
  },
  (a, b) => a.onBlockLayout === b.onBlockLayout && blockPropsEqual(a, b)
);

function measuredBlockElements(
  table: NodeTable,
  ctx: RenderCtx,
  fade: FadePlan | null,
  control: ScrollController
): ReactNode[] {
  const blocks = new Array<ReactNode>(table.blockCount);
  let taskBase = 0;
  for (let i = 0; i < table.blockCount; i++) {
    blocks[i] = (
      <MeasuredBlock
        key={blockKey(i)}
        table={table}
        index={i}
        ctx={ctx}
        taskBase={taskBase}
        fade={fade}
        onBlockLayout={control.onBlockLayout}
        onBlockUnmount={control.forgetBlock}
      />
    );
    if (i + 1 < table.blockCount) taskBase += blockTaskCount(table, i);
  }
  return blocks;
}

/**
 * Registers the footnote jump of a container (P3-8) on `jumpRef` (from
 * `Markdown`, where the pipeline reads it): a press scrolls to its target in
 * `table`, the latest one rendered. No ref, no jump.
 */
function useFootnoteJump(
  jumpRef: FootnoteJumpRef | undefined,
  control: ScrollController,
  table: NodeTable,
  focus: FootnoteFocusConfig | null,
  list: boolean
) {
  useLayoutEffect(() => {
    if (jumpRef === undefined) return;
    let pending: (() => void) | null = null;
    const cancelPending = () => {
      pending?.();
      pending = null;
    };
    jumpRef.current = (label, info, { offset }) => {
      cancelPending();
      const target = footnoteTarget(table, label, info);
      if (target === undefined) return;
      const exact = focus?.target === 'definition' && offset !== undefined;
      // A negative `viewOffset` moves the landing point down by `y`.
      control.scrollToBlock(target, {
        animated: true,
        viewPosition: 0,
        viewOffset: exact ? -offset : 0,
      });
      // A list lands on the section first; the definition's y arrives once
      // it has mounted and been measured (P3-15).
      if (
        list &&
        !exact &&
        focus?.target === 'definition' &&
        info.direction === 'definition'
      ) {
        pending = refineOnMeasure(focus.store, label, (y) =>
          control.scrollToBlock(target, {
            animated: true,
            viewPosition: 0,
            viewOffset: -y,
          })
        );
      }
    };
    return () => {
      cancelPending();
      jumpRef.current = null;
    };
  }, [jumpRef, control, table, focus, list]);
}

interface ContainerProps<O> {
  readonly table: NodeTable;
  readonly ctx: RenderCtx;
  /** The stream's fade plan (P2b-5), or null. */
  readonly fade: FadePlan | null;
  readonly options: O;
  /**
   * Set while the jump is on (P3-8): not `jumpToFootnotes: false`, and the
   * document has footnotes to jump between (none while streaming, P3-12).
   */
  readonly jump?: FootnoteJumpRef;
}

/** `<Markdown scroll>`: every block in one scroll view. */
export function MarkdownScrollView({
  table,
  ctx,
  fade,
  options,
  jump,
}: ContainerProps<ScrollOptions>) {
  const Scroll: MarkdownScrollComponent = options.component ?? ScrollView;
  useUnstableComponentWarning(options.component, 'scroll');
  const scrollProps = useScrollProps(
    options,
    false,
    table.blockCount,
    'scroll',
    jump !== undefined
  );
  const { control, measured } = scrollProps;
  useFootnoteJump(jump, control, table, ctx.options.footnoteFocus, false);
  const props = useNestedScrollerWarning(scrollProps.props);
  return (
    <BlockProviders ctx={ctx}>
      <Scroll {...props}>
        {options.header}
        {measured
          ? measuredBlockElements(table, ctx, fade, control)
          : blockElements(table, ctx, fade)}
        {options.footer}
      </Scroll>
    </BlockProviders>
  );
}

/**
 * `<Markdown virtualize>`: one list item per block (`useBlockItems`: a new
 * `data` array per flush, so the open tail re-renders; unchanged blocks keep
 * their items and skip). The providers are for the header and footer; each
 * item brings its own.
 */
export function MarkdownFlatList({
  table,
  ctx,
  fade,
  options,
  jump,
}: ContainerProps<VirtualizeOptions>) {
  const List: MarkdownListComponent = options.component ?? FlatList;
  const data = useBlockItems(table, ctx, fade);
  useUnstableComponentWarning(options.component, 'virtualize');
  const { props, control } = useScrollProps(
    options,
    true,
    data.length,
    'virtualize',
    jump !== undefined
  );
  useFootnoteJump(jump, control, table, ctx.options.footnoteFocus, true);
  return (
    <BlockProviders ctx={ctx}>
      <List
        {...props}
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        initialNumToRender={
          options.initialNumToRender ?? LIST_DEFAULTS.initialNumToRender
        }
        windowSize={options.windowSize ?? LIST_DEFAULTS.windowSize}
        removeClippedSubviews={LIST_DEFAULTS.removeClippedSubviews}
        ListHeaderComponent={options.header ?? undefined}
        ListFooterComponent={options.footer ?? undefined}
      />
    </BlockProviders>
  );
}
