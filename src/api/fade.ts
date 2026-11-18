import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { fadeNow, type FadePlan } from '../render/fade';
import {
  streamInfoOf,
  type MarkdownDocument,
  type StreamInfo,
} from './document';

/**
 * Which blocks fade in (P2b-5): those that first appear in a document
 * update while the stream is live. Spec:
 * docs/rewrite/phase-2b/decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade
 *
 * The pipeline tracks the highest block count it has rendered for the
 * current stream and epoch. Blocks at or past it in a live update are born
 * now (`births[i]`); a block fades if it mounts soon after its birth
 * (`fadeOnMount`). Nothing is born on the first document this pipeline sees,
 * on the document of a `reset()` (a new epoch), after `done()`, or unless
 * Reduce Motion is known to be off.
 */

const NO_BIRTHS: readonly (number | undefined)[] = Object.freeze([]);

interface FadeState {
  readonly document: MarkdownDocument;
  readonly stream: object;
  readonly epoch: number;
  /** Highest block count rendered in this stream and epoch. */
  readonly count: number;
  readonly plan: FadePlan;
}

/** A stream document with animation on: its stream info and fade length. */
type Animated = StreamInfo & { readonly fade: number };

function baseline(document: MarkdownDocument, info: Animated): FadeState {
  return {
    document,
    stream: info.stream,
    epoch: info.epoch,
    count: document.blockCount,
    plan: { duration: info.fade, births: NO_BIRTHS },
  };
}

function advance(
  prev: FadeState | null,
  document: MarkdownDocument,
  info: Animated,
  motion: boolean
): FadeState {
  if (
    prev === null ||
    prev.stream !== info.stream ||
    prev.epoch !== info.epoch
  ) {
    return baseline(document, info);
  }
  const n = document.blockCount;
  const count = Math.max(prev.count, n);
  let plan = prev.plan;
  if (info.ended || !motion) {
    if (plan.births !== NO_BIRTHS) plan = { ...plan, births: NO_BIRTHS };
  } else if (n > prev.count) {
    const births = plan.births.slice();
    const now = fadeNow();
    for (let i = prev.count; i < n; i++) births[i] = now;
    plan = { ...plan, births };
  }
  return { ...prev, document, count, plan };
}

/** The last Reduce Motion value read, so a later mount need not wait. */
let knownReduceMotion: boolean | null = null;

/**
 * Whether motion is allowed: the user's Reduce Motion setting is known and
 * off. Read and watched only when `enabled`. Until the (async, native) first
 * read resolves, motion is not allowed, so a stream that starts at mount
 * never fades with Reduce Motion on.
 */
function useMotionAllowed(enabled: boolean): boolean {
  const [reduce, setReduce] = useState<boolean | null>(knownReduceMotion);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const update = (value: boolean) => {
      knownReduceMotion = value;
      if (active) setReduce(value);
    };
    AccessibilityInfo.isReduceMotionEnabled().then(update, () => {});
    // react-native-web returns nothing where `matchMedia` is missing.
    const subscription: { remove(): void } | undefined =
      AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled]);
  return enabled && reduce === false;
}

/** Test hook: forget the cached Reduce Motion value. */
export function resetReduceMotionCache(): void {
  knownReduceMotion = null;
}

/**
 * The fade plan for `document`, or null when it does not come from a
 * stream with `animation` on (then nothing here runs per document).
 */
export function useFadePlan(document: MarkdownDocument): FadePlan | null {
  const info = streamInfoOf(document);
  const animated =
    info !== undefined && info.fade !== null ? (info as Animated) : null;
  const motion = useMotionAllowed(animated !== null);
  const [state, setState] = useState<FadeState | null>(() =>
    animated === null ? null : baseline(document, animated)
  );
  if (animated === null) return null;
  if (state !== null && state.document === document) return state.plan;
  // A render-phase update, as `useStable` does: React re-runs the component
  // at once, before rendering children.
  const next = advance(state, document, animated, motion);
  setState(next);
  return next.plan;
}
