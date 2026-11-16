import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import type {
  MarkdownListRef,
  MarkdownScrollToBlockOptions,
  MarkdownScrollToOptions,
  ScrollOptions,
} from './scrollOptions';

/**
 * Scroll control of the owned containers (#50, P3-5): the `MarkdownListRef`
 * handle and follow-tail (`autoScroll`). All state lives in this object,
 * mutated from scroll callbacks, never in React state: follow-tail causes no
 * re-render.
 *
 * Follow-tail state: `pinned` (the user is at the bottom; starts true) and
 * whether the user is touching (`dragging`) or flinging (`momentum`).
 * - While touching or flinging, nothing scrolls by itself, and each event
 *   sets `pinned` to "within `threshold` of the end".
 * - Any other scroll event (ours, a web wheel, the app's own `scrollTo`)
 *   can pin, never unpin, except an upward move with no shrink of the
 *   content: that is never us, since `scrollToEnd` only moves down.
 * - Content growth (`onContentSizeChange`) or a viewport resize
 *   (`onLayout`) while pinned and untouched: one non-animated
 *   `scrollToEnd`.
 * Spec: docs/rewrite/phase-3/virtualization.md#design
 */

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/** Pixels from the end that still count as "at the bottom". */
const AUTO_SCROLL_THRESHOLD = 40;
/** Milliseconds between scroll events while `autoScroll` is on (iOS). */
export const AUTO_SCROLL_THROTTLE = 16;
/**
 * `scrollToBlock` on a list: the wait before each retry, how many retries in
 * a row may make no progress (the list measured no further block), and the
 * cap on retries overall. A list measures unmeasured blocks in batches, so a
 * long jump takes many rounds (seen on a device: 3 fixed retries stalled
 * part-way through a 480-block jump).
 */
export const SCROLL_RETRY_MS = 100;
export const SCROLL_RETRY_LIMIT = 3;
const SCROLL_RETRY_MAX = 100;

/** The pixel threshold of an `autoScroll` option, or `null` when off. */
export function autoScrollThreshold(
  value: ScrollOptions['autoScroll']
): number | null {
  if (value === undefined || value === false) return null;
  return value === true ? AUTO_SCROLL_THRESHOLD : value.threshold;
}

/**
 * Whether `onScroll` can be wrapped: a plain function. `Animated.event` on
 * the native driver is an object, and Reanimated's handlers carry a
 * `workletEventHandler`: both must reach the scroll component untouched.
 */
export function isPlainHandler(
  handler: unknown
): handler is (event: ScrollEvent) => void {
  return typeof handler === 'function' && !('workletEventHandler' in handler);
}

/** Sets the user's `componentRef`, an object or a callback. */
export function assignRef(
  ref: ScrollOptions['componentRef'],
  instance: unknown
) {
  if (typeof ref === 'function') ref(instance);
  else if (ref) ref.current = instance;
}

const methodOf = (target: unknown, method: string): unknown =>
  target !== null && typeof target === 'object'
    ? (target as Record<string, unknown>)[method]
    : undefined;

const hasMethod = (target: unknown, method: string) =>
  typeof methodOf(target, method) === 'function';

/**
 * `target[method](...args)` if it is a method, else nothing: the instance
 * may be missing (not mounted, a wrapper that drops `ref`) or lack a
 * method (react-native-web, a custom list).
 */
function invoke(target: unknown, method: string, ...args: unknown[]): unknown {
  const fn = methodOf(target, method);
  if (typeof fn !== 'function') return undefined;
  return (fn as (...a: unknown[]) => unknown).apply(target, args);
}

interface IndexRequest {
  readonly index: number;
  readonly animated: boolean;
  readonly viewPosition: number;
  readonly viewOffset: number;
  /** Retries in a row that measured no further block. */
  attempts: number;
  /** Retries overall. */
  total: number;
  /** The highest block the list had measured at the last failure. */
  measured: number;
  /** `scrollToEnd`: once the last block is reached, scroll to the end. */
  readonly end: boolean;
}

interface IndexFailure {
  readonly index: number;
  readonly averageItemLength: number;
  readonly highestMeasuredFrameIndex?: number;
}

export class ScrollController {
  /** The scroll component's instance. */
  private instance: unknown = null;
  private readonly list: boolean;
  /** `null`: `autoScroll` off. */
  private threshold: number | null = null;
  private blockCount = 0;

  // Follow-tail.
  private pinned = true;
  private dragging = false;
  private momentum = false;
  private offset = 0;
  private content = 0;
  /** Height from the last `onContentSizeChange`, to detect growth. */
  private sized = 0;
  private viewport = 0;

  // `scroll`: offsets of laid-out blocks, by index.
  private readonly blockY: number[] = [];
  private readonly blockHeight: number[] = [];

  // `virtualize`: the pending `scrollToBlock`.
  private request: IndexRequest | null = null;
  private failed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly handle: MarkdownListRef;

  constructor(list: boolean) {
    this.list = list;
    this.handle = Object.freeze({
      scrollToEnd: (options?: MarkdownScrollToOptions) => {
        this.pinned = true;
        this.momentum = false;
        const animated = options?.animated !== false;
        if (this.list && this.blockCount > 0) {
          // A list only knows the size of the blocks it has measured, so its
          // end moves as it renders (seen on a device: the native
          // `scrollToEnd` of a fresh 480-block list stopped part-way). Reach
          // the last block through the index retries, then the true end.
          clearTimeout(this.timer);
          this.request = {
            index: this.blockCount - 1,
            animated,
            viewPosition: 1,
            viewOffset: 0,
            attempts: 0,
            total: 0,
            measured: -1,
            end: true,
          };
          this.toIndex(this.request);
          return;
        }
        this.toEnd(animated);
      },
      scrollToOffset: (offset: number, options?: MarkdownScrollToOptions) => {
        if (!Number.isFinite(offset)) return;
        this.scrollTo(Math.max(0, offset), options?.animated !== false);
      },
      scrollToBlock: (index: number, options?: MarkdownScrollToBlockOptions) =>
        this.scrollToBlock(index, options),
    });
  }

  configure(threshold: number | null, blockCount: number) {
    this.threshold = threshold;
    this.blockCount = blockCount;
  }

  dispose() {
    this.cancel();
  }

  /**
   * Drops a pending `scrollToBlock` / `scrollToEnd` on a list: its retries
   * must not pull the view back once the user drags or the app scrolls
   * somewhere else.
   */
  readonly cancel = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.request = null;
  };

  readonly setInstance = (instance: unknown) => {
    this.instance = instance;
  };

  // -- Events ------------------------------------------------------------------

  readonly onScroll = (event: ScrollEvent) => this.observe(event);

  readonly onScrollBeginDrag = (event: ScrollEvent) => {
    this.cancel();
    this.dragging = true;
    this.momentum = false;
    this.observe(event);
  };

  readonly onScrollEndDrag = (event: ScrollEvent) => {
    this.observe(event);
    this.dragging = false;
  };

  readonly onMomentumScrollBegin = () => {
    this.momentum = true;
  };

  // Also fires after an animated programmatic scroll (iOS), without a
  // begin: that end is judged as a non-user event.
  readonly onMomentumScrollEnd = (event: ScrollEvent) => {
    this.observe(event);
    this.momentum = false;
  };

  readonly onContentSizeChange = (_width: number, height: number) => {
    const grew = height > this.sized;
    this.sized = height;
    this.content = height;
    if (grew) this.follow();
  };

  readonly onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height === this.viewport) return;
    this.viewport = height;
    this.follow();
  };

  readonly onBlockLayout = (index: number, y: number, height: number) => {
    this.blockY[index] = y;
    this.blockHeight[index] = height;
  };

  /**
   * The block's measuring view unmounted (the document shrank, or `ref`
   * was removed): its offset is stale until a new view lays out.
   */
  readonly forgetBlock = (index: number) => {
    this.blockY.length = Math.min(this.blockY.length, index);
    this.blockHeight.length = Math.min(this.blockHeight.length, index);
  };

  readonly onScrollToIndexFailed = (info: IndexFailure) => {
    this.failed = true;
    invoke(this.instance, 'scrollToOffset', {
      offset: Math.max(0, info.averageItemLength * info.index),
      animated: false,
    });
    const request = this.request;
    if (request === null || request.index !== info.index) {
      this.request = null;
      return;
    }
    // Progress (the list measured further since the last failure) earns
    // more retries: only a stalled list, or the overall cap, ends them.
    const measured = info.highestMeasuredFrameIndex ?? -1;
    if (measured > request.measured) {
      request.measured = measured;
      request.attempts = 0;
    }
    if (
      request.attempts >= SCROLL_RETRY_LIMIT ||
      request.total >= SCROLL_RETRY_MAX
    ) {
      this.request = null;
      if (request.end) this.toEnd(false);
      return;
    }
    request.attempts++;
    request.total++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.request === request) this.toIndex(request);
    }, SCROLL_RETRY_MS);
  };

  // -- Follow-tail -------------------------------------------------------------

  private atBottom(offset: number, content: number, viewport: number) {
    const threshold = this.threshold ?? AUTO_SCROLL_THRESHOLD;
    return content - viewport - offset <= threshold;
  }

  private observe({ nativeEvent }: ScrollEvent) {
    const offset = nativeEvent.contentOffset.y;
    const content = nativeEvent.contentSize.height;
    const viewport = nativeEvent.layoutMeasurement.height;
    const lastOffset = this.offset;
    const lastContent = this.content;
    this.offset = offset;
    this.content = content;
    if (viewport > 0) this.viewport = viewport;
    if (this.threshold === null) return;
    const bottom = this.atBottom(offset, content, this.viewport);
    if (this.dragging || this.momentum) this.pinned = bottom;
    else if (bottom) this.pinned = true;
    else if (offset < lastOffset - 1 && content >= lastContent) {
      this.pinned = false;
    }
  }

  /** While pinned and untouched, keep the end in view. */
  private follow() {
    if (this.threshold === null) return;
    if (!this.pinned || this.dragging || this.momentum) return;
    if (this.viewport > 0 && this.content <= this.viewport) return;
    this.toEnd(false);
  }

  // -- Scrolling ---------------------------------------------------------------

  private toEnd(animated: boolean) {
    // On a list, the scroll view's `scrollToEnd` (native content size): the
    // list's own computes the end from cell metrics, which can lag the
    // growing tail.
    const native = this.list
      ? invoke(this.instance, 'getNativeScrollRef')
      : undefined;
    const target = hasMethod(native, 'scrollToEnd') ? native : this.instance;
    invoke(target, 'scrollToEnd', { animated });
  }

  /** Scrolls to `offset`; follows the tail only if that is the end. */
  private scrollTo(offset: number, animated: boolean) {
    this.cancel();
    this.pinned =
      this.viewport > 0 &&
      this.content > 0 &&
      this.atBottom(offset, this.content, this.viewport);
    this.momentum = false;
    if (this.list) {
      invoke(this.instance, 'scrollToOffset', { offset, animated });
    } else {
      invoke(this.instance, 'scrollTo', { y: offset, animated });
    }
  }

  private scrollToBlock(index: number, options?: MarkdownScrollToBlockOptions) {
    if (!Number.isFinite(index) || this.blockCount === 0) return;
    const i = Math.min(Math.max(Math.trunc(index), 0), this.blockCount - 1);
    const animated = options?.animated !== false;
    const viewPosition = options?.viewPosition ?? 0;
    const viewOffset = options?.viewOffset ?? 0;
    if (this.list) {
      this.pinned = false;
      this.momentum = false;
      clearTimeout(this.timer);
      this.request = {
        index: i,
        animated,
        viewPosition,
        viewOffset,
        attempts: 0,
        total: 0,
        measured: -1,
        end: false,
      };
      this.toIndex(this.request);
      return;
    }
    const y = this.blockY[i];
    if (y === undefined) return;
    const height = this.blockHeight[i] ?? 0;
    let target = y - viewPosition * (this.viewport - height) - viewOffset;
    if (this.viewport > 0 && this.content > this.viewport) {
      target = Math.min(target, this.content - this.viewport);
    }
    this.scrollTo(Math.max(0, target), animated);
  }

  private toIndex(request: IndexRequest) {
    if (this.blockCount === 0) {
      this.request = null;
      return;
    }
    this.failed = false;
    invoke(this.instance, 'scrollToIndex', {
      index: Math.min(request.index, this.blockCount - 1),
      animated: request.animated,
      viewPosition: request.viewPosition,
      viewOffset: request.viewOffset,
    });
    if (this.failed) {
      // `scrollToEnd`, first failure: move to the end as known now, at
      // once; the retries carry it to the true end.
      if (request.end && request.total === 1) this.toEnd(request.animated);
      return;
    }
    if (this.request === request) this.request = null;
    if (request.end) this.toEnd(request.animated);
  }
}
