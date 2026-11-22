import { Text, View, type TextStyle } from 'react-native';
import { useMemo, type ComponentType, type ReactNode } from 'react';
import {
  InheritedTextContext,
  TextResetContext,
  useRenderContext,
} from '../render/contexts';
import type { ElementProps } from '../render/elements';
import { BODY_FONT, fontStateIndex } from '../theme';
import type { AdmonitionKind } from './rule';

/** Props of the `Admonition` element: the alert kind (lowercase). */
export type AdmonitionAttrs = {
  kind: AdmonitionKind;
  /** The title shown above the content: from `titles`, or the default. */
  title: string;
};

declare module '@docren/react-native-markdown' {
  interface PluginElementPropsMap {
    Admonition: AdmonitionAttrs;
  }
}

/** Default titles, replaced per kind by `admonitions({ titles })`. */
export const DEFAULT_TITLES: Readonly<Record<AdmonitionKind, string>> =
  Object.freeze({
    note: 'Note',
    tip: 'Tip',
    important: 'Important',
    warning: 'Warning',
    caution: 'Caution',
  });

/**
 * The default `Admonition`: the accent bar and tinted box of its kind, a
 * title, then the content. Its style comes from `blockquote` and
 * `blockquote.admonitions.<kind>` (see `theme.admonitions`).
 */
export const Admonition: ComponentType<
  ElementProps<'Admonition'> & { children?: ReactNode }
> = function Admonition({ kind, title, children }) {
  const { theme } = useRenderContext();
  const { container, text, accent } = theme.admonitions[kind];

  const titleText = useMemo(() => {
    const { spacing } = theme.tokens;
    // The body's family, size and line height, then its bold face: a
    // standalone Text inherits nothing, and with face maps bold is a
    // family switch rather than a weight. The quote's own text props win.
    return {
      ...theme.elements.Paragraph.text,
      ...theme.fontVariants.Strong[fontStateIndex(BODY_FONT)]!.text,
      ...(text.fontFamily === undefined ? {} : { fontFamily: text.fontFamily }),
      ...(text.fontSize === undefined ? {} : { fontSize: text.fontSize }),
      ...(text.lineHeight === undefined ? {} : { lineHeight: text.lineHeight }),
      color: accent,
      marginBottom: spacing.block * 0.5,
    } satisfies TextStyle;
  }, [theme, text, accent]);

  return (
    <View
      style={container}
      accessibilityRole="summary"
      accessibilityLabel={title}
    >
      <Text style={titleText}>{title}</Text>
      {/* Like Blockquote: content inherits the alert's text style, and a
          checked item's reset no longer applies in here. */}
      <TextResetContext.Provider value={undefined}>
        <InheritedTextContext.Provider value={text}>
          {children}
        </InheritedTextContext.Provider>
      </TextResetContext.Provider>
    </View>
  );
};
