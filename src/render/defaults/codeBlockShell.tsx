import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRenderContext } from '../contexts';
import type { ElementProps } from '../elements';

export interface CodeBlockShellProps {
  /** The block's code: the accessibility label of the labelled element. */
  readonly code: string;
  /** The resolved `CodeBlock` container style. */
  readonly style: StyleProp<ViewStyle>;
  /** A bar above the body (P3-35); omitted, the shell is today's container. */
  readonly header?: ReactNode;
  /**
   * Label the code element with `code` (`accessible` + `accessibilityLabel`).
   * Always on once a header is set.
   */
  readonly labelled?: boolean;
  /** The body: the horizontal ScrollView and its text. */
  readonly children: ReactNode;
}

/**
 * The container shared by the default and the highlighted `CodeBlock`
 * (P3-35). Pure JS: it lives in core because the highlight subpath falls
 * back to the core `CodeBlock`.
 *
 * Without a header it is exactly the pre-header markup: one `View` with the
 * whole container style and `children` inside, `accessible` and labelled
 * with the code only when `labelled`. Hiding the children from
 * accessibility stays their job.
 *
 * With a header:
 *
 *     View   container style without padding (background, radius, margins,
 *            borders; overflow defaults to hidden so the radius clips the bar)
 *       header
 *       View   the padding keys; accessible, labelled with the code
 *         children
 *
 * The header sits outside the labelled element, so its buttons stay
 * reachable by screen readers. Consequence: a `CodeBlock.container.padding`
 * (and every other padding key) pads the body, not the bar, once a header
 * is on.
 */
export function CodeBlockShell({
  code,
  style,
  header,
  labelled = false,
  children,
}: CodeBlockShellProps) {
  const hasHeader = header !== undefined;
  const split = useMemo(
    () => (hasHeader ? splitPadding(style) : null),
    [hasHeader, style]
  );
  if (split === null) {
    return labelled ? (
      <View style={style} accessible accessibilityLabel={code}>
        {children}
      </View>
    ) : (
      <View style={style}>{children}</View>
    );
  }
  return (
    <View style={split.outer}>
      {header}
      <View style={split.padding} accessible accessibilityLabel={code}>
        {children}
      </View>
    </View>
  );
}

/**
 * The wrap state of a code block (P3-35). With `codeBlock.header` on it is
 * local state seeded from `codeBlock.wrap` (a new option value re-seeds it)
 * and `toggleWrap` flips it; with the header off it is the option's fixed
 * value and `toggleWrap` is `null`.
 */
export function useCodeBlockWrap(): {
  readonly wrap: boolean;
  readonly toggleWrap: (() => void) | null;
} {
  const { options } = useRenderContext();
  const { header, wrap: seed } = options.codeBlock;
  const [state, setState] = useState({ seed, wrap: seed });
  let wrap = state.wrap;
  if (state.seed !== seed) {
    wrap = seed;
    setState({ seed, wrap: seed });
  }
  const toggleWrap = useCallback(
    () => setState((s) => ({ seed: s.seed, wrap: !s.wrap })),
    []
  );
  return header ? { wrap, toggleWrap } : { wrap: seed, toggleWrap: null };
}

/**
 * The `CodeBlockHeader` element for a code block, or `undefined` when
 * `codeBlock.header` is off (the shell is then the pre-header markup).
 * Shared by the default and the highlighted `CodeBlock`. The component comes
 * from `components`, so a replacement gets the same props. Copy calls
 * `onCopyPress` read at press time; it is `null` without the handler.
 *
 * `wrap` and `onToggleWrap` come from {@link useCodeBlockWrap}; omitted, the
 * header shows `codeBlock.wrap` and no Wrap button. The Wrap button is also
 * hidden while `open`.
 */
export function useCodeBlockHeader({
  code,
  language,
  meta,
  open,
  wrap: wrapState,
  onToggleWrap = null,
}: Pick<ElementProps<'CodeBlock'>, 'code' | 'language' | 'meta' | 'open'> & {
  readonly wrap?: boolean;
  readonly onToggleWrap?: (() => void) | null;
}): ReactNode | undefined {
  const { components, theme, handlers, options } = useRenderContext();
  const { header, wrap, copyable } = options.codeBlock;
  const onCopy = useMemo(
    () =>
      copyable
        ? () => handlers.current.onCopyPress?.({ code, language, meta })
        : null,
    [copyable, handlers, code, language, meta]
  );
  if (!header) return undefined;
  const Header = components.CodeBlockHeader;
  return (
    <Header
      language={language}
      code={code}
      open={open}
      wrap={wrapState ?? wrap}
      onToggleWrap={open ? null : onToggleWrap}
      onCopy={onCopy}
      style={theme.elements.CodeBlockHeader}
    />
  );
}

const PADDING_KEYS = [
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingStart',
  'paddingEnd',
] as const satisfies readonly (keyof ViewStyle)[];

const PADDING = new Set<string>(PADDING_KEYS);

/**
 * Splits a container style into its padding keys and the rest. The rest
 * gets `overflow: 'hidden'` unless the style sets an overflow.
 */
export function splitPadding(style: StyleProp<ViewStyle>): {
  readonly outer: ViewStyle;
  readonly padding: ViewStyle;
} {
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const outer: Record<string, unknown> = { overflow: 'hidden' };
  const padding: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    (PADDING.has(key) ? padding : outer)[key] = value;
  }
  return { outer: outer as ViewStyle, padding: padding as ViewStyle };
}
