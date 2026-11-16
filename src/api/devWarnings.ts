import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';
import { isDev } from '../render/devInline';

/**
 * Dev-only warnings of the owned scroll containers (P3-7). Every hook is a
 * pass-through outside development and warns at most once per mounted
 * container. Spec: docs/rewrite/phase-3/virtualization.md#warnings
 */

const PREFIX = '[react-native-markdown] ';

/** Consecutive renders with a new `component` type before it is a warning. */
export const UNSTABLE_COMPONENT_RENDERS = 3;

function warnOnce(flag: { current: boolean }, message: string) {
  if (flag.current) return;
  flag.current = true;
  console.warn(PREFIX + message);
}

interface Measured {
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
}

/**
 * `scroll` inside another vertical scroller: its laid-out height keeps equal
 * to its content height while that height exceeds the window, so it is not
 * clipping anything. A bounded container never shows that, and neither does
 * short content. Adds `onLayout` and `onContentSizeChange` in development,
 * composed with the ones in `props`. Not used for `virtualize`: React Native
 * warns about a `FlatList` in a `ScrollView` itself.
 */
export function useNestedScrollerWarning<P extends Measured>(props: P): P {
  const warned = useRef(false);
  const size = useRef({ frame: 0, content: 0 });
  const { onLayout, onContentSizeChange } = props;
  const dev = isDev();

  const check = useCallback(() => {
    const { frame, content } = size.current;
    if (
      frame > 0 &&
      content > Dimensions.get('window').height &&
      Math.abs(frame - content) <= 1
    ) {
      warnOnce(
        warned,
        '<Markdown scroll> is not scrolling: it is as tall as its content, ' +
          'which is taller than the window. It is probably inside another ' +
          'vertical scroll view. Give it a bounded height, or render the ' +
          'default View inside your own scroller.'
      );
    }
  }, []);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      size.current.frame = event.nativeEvent.layout.height;
      check();
      onLayout?.(event);
    },
    [check, onLayout]
  );
  const handleContentSize = useCallback(
    (width: number, height: number) => {
      size.current.content = height;
      check();
      onContentSizeChange?.(width, height);
    },
    [check, onContentSizeChange]
  );
  return useMemo(
    () =>
      dev
        ? {
            ...props,
            onLayout: handleLayout,
            onContentSizeChange: handleContentSize,
          }
        : props,
    [dev, props, handleLayout, handleContentSize]
  );
}

/**
 * A `component` whose type changes on most renders (one created during
 * render): every change remounts the scroll view and all blocks. One switch
 * is fine; warns after `UNSTABLE_COMPONENT_RENDERS` renders in a row.
 */
export function useUnstableComponentWarning(component: unknown, slot: string) {
  const warned = useRef(false);
  const last = useRef(component);
  const run = useRef(0);
  useEffect(() => {
    if (!isDev()) return;
    run.current = last.current === component ? 0 : run.current + 1;
    last.current = component;
    if (run.current >= UNSTABLE_COMPONENT_RENDERS) {
      warnOnce(
        warned,
        `${slot}.component changes on every render, which remounts every ` +
          'block. Pass a component defined at module level, or memoized.'
      );
    }
  });
}

/**
 * `ref`, `componentRef` or `autoScroll` in use, but the scroll component
 * never received an instance: it does not forward `ref`.
 */
export function useMissingRefWarning(
  expected: boolean,
  received: { readonly current: boolean },
  slot: string
) {
  const warned = useRef(false);
  useEffect(() => {
    if (!isDev() || !expected || received.current) return;
    warnOnce(
      warned,
      `${slot}.component did not give its scroll view a ref, so ref, ` +
        'componentRef and autoScroll do nothing. Pass the ref prop on to ' +
        'the scroll view (forwardRef, or the ref prop in React 19).'
    );
  }, [expected, received, slot]);
}
