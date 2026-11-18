import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Platform } from 'react-native';

/**
 * Block-level fade of a stream (P2b-5).
 * Spec: docs/rewrite/phase-2b/decisions.md#p2b-5-animation-is-a-block-level-fade-none--fade
 *
 * Containers render `FadingBlock` (./Block) instead of `Block` when the
 * document comes from a stream with `animation` on, for the life of that
 * stream (the component type never flips mid-stream, so nothing remounts).
 * Off, the render tree is exactly `Block`'s.
 */

/**
 * Which blocks were born while the stream was live, and when. Built per
 * document by the pipeline (`useFadePlan`); read only when a block mounts.
 */
export interface FadePlan {
  /** Fade-in length in ms. */
  readonly duration: number;
  /** `births[i]`: when block `i` first appeared in a live update (ms), or unset. */
  readonly births: readonly (number | undefined)[];
}

/**
 * A block born live fades only if it mounts within this long of its birth.
 * A windowed list (`virtualize`) mounts a new tail cell a batch or two after
 * the flush that added it; a block it mounts later, by a scroll, is old news
 * and does not fade.
 */
const FADE_MOUNT_WINDOW_MS = 500;

/** Milliseconds (`Date.now`, which Jest's fake timers control). */
export const fadeNow = (): number => Date.now();

/** The fade length for block `index` mounting now: 0 for no fade. */
export function fadeOnMount(plan: FadePlan, index: number): number {
  const born = plan.births[index];
  return born !== undefined && fadeNow() - born <= FADE_MOUNT_WINDOW_MS
    ? plan.duration
    : 0;
}

/** Fades its children in once, opacity 0 to 1 over `duration` ms. */
export function FadeIn({
  duration,
  children,
}: {
  readonly duration: number;
  readonly children: ReactNode;
}) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [style] = useState(() => ({ opacity }));
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration,
      // The web has no native driver; asking for it warns.
      useNativeDriver: Platform.OS !== 'web',
      // A long stream must not hold up InteractionManager.
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, duration]);
  return <Animated.View style={style}>{children}</Animated.View>;
}
