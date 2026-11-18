import { useEffect, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Animated,
  InteractionManager,
  type View,
} from 'react-native';
import { useRenderContext } from './contexts';
import { useFootnoteFlashToken } from './footnoteFocus';

/** Wait for layout and the screen reader to settle before moving focus. */
const FOCUS_DELAY = 350;

/** Share of the flash spent fading in; the rest fades out. */
const FADE_IN = 0.2;

export interface FootnoteFlash {
  /** The animated background to add to the element's style; `null`: none. */
  readonly style: {
    readonly backgroundColor: Animated.AnimatedInterpolation<string> | string;
  } | null;
  /** The element is the current focus target (a definition a press jumped to). */
  readonly focused: boolean;
}

const NO_FLASH: FootnoteFlash = { style: null, focused: false };

/**
 * The flash of one footnote element (P3-15): a background that fades from
 * transparent to the highlight colour and back when the store flashes `key`,
 * restarting on each new flash. With Reduce Motion on, the colour shows
 * statically for the duration instead. Uses the JS driver: a colour is not
 * natively animatable.
 *
 * With `focusRef`, a screen reader is also moved to the element once the
 * flash starts.
 */
export function useFootnoteFlash(
  key: string,
  focusRef?: RefObject<View | null>
): FootnoteFlash {
  const { options, theme } = useRenderContext();
  const focus = options.footnoteFocus;
  const token = useFootnoteFlashToken(focus?.store, key);
  const highlight = focus?.highlight ?? null;
  const duration = highlight?.duration ?? 0;
  const color = highlight?.color ?? theme.tokens.colors.footnoteHighlight;
  // Identifies this element to `store.claim`: a remount is a new owner.
  const [owner] = useState(() => ({}));
  // The token this element has played; a remount does not replay a flash.
  const [played, setPlayed] = useState(0);
  const [shown, setShown] = useState(false);
  const [background, setBackground] =
    useState<Animated.AnimatedInterpolation<string> | null>(null);

  useEffect(() => {
    if (token === 0 || focus === null) return;
    if (!focus.store.claim(token, owner)) return;
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const value = new Animated.Value(0);
    const start = (reduce: boolean) => {
      if (!active) return;
      setPlayed(token);
      if (highlight === null) return;
      if (reduce) {
        setShown(true);
        timer = setTimeout(() => setShown(false), duration);
        return;
      }
      setBackground(
        value.interpolate({
          inputRange: [0, 1],
          outputRange: ['rgba(0, 0, 0, 0)', color],
        })
      );
      animation = Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: duration * FADE_IN,
          useNativeDriver: false,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: duration * (1 - FADE_IN),
          useNativeDriver: false,
        }),
      ]);
      animation.start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(start, () => start(false));
    return () => {
      active = false;
      animation?.stop();
      if (timer !== undefined) clearTimeout(timer);
      setShown(false);
    };
    // `highlight` is stable config; a new flash is a new token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token === 0 || focusRef === undefined || played !== token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (on) => {
        if (!on || !active) return;
        InteractionManager.runAfterInteractions(() => {
          if (!active) return;
          timer = setTimeout(() => {
            const node = focusRef.current;
            if (node !== null) {
              AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
            }
          }, FOCUS_DELAY);
        });
      },
      () => {}
    );
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [token, focusRef, played]);

  if (focus === null) return NO_FLASH;
  const focused = token !== 0 && played === token;
  if (token === 0 || highlight === null) return { style: null, focused };
  if (shown) return { style: { backgroundColor: color }, focused };
  if (background === null) return { style: null, focused };
  return { style: { backgroundColor: background }, focused };
}
