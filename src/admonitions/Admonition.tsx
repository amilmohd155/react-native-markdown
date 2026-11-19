import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
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
    /** Theme-only: overrides `Admonition` for one kind. No component. */
    AdmonitionNote: {};
    AdmonitionTip: {};
    AdmonitionImportant: {};
    AdmonitionWarning: {};
    AdmonitionCaution: {};
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

/** Accent per kind: `[light, dark]` (GitHub's alert colors). */
const ACCENTS: Readonly<Record<AdmonitionKind, readonly [string, string]>> = {
  note: ['#0969da', '#4493f8'],
  tip: ['#1a7f37', '#3fb950'],
  important: ['#8250df', '#ab7df8'],
  warning: ['#9a6700', '#d29922'],
  caution: ['#cf222e', '#f85149'],
};

const OVERRIDE_NAMES = {
  note: 'AdmonitionNote',
  tip: 'AdmonitionTip',
  important: 'AdmonitionImportant',
  warning: 'AdmonitionWarning',
  caution: 'AdmonitionCaution',
} as const satisfies Record<AdmonitionKind, string>;

/** Alpha for the tinted background (hex `1a` is about 10%). */
const TINT = '1a';

/**
 * Whether `color` (a `#rgb` or `#rrggbb` text color) is light, which means the
 * theme is a dark one. Anything else counts as a light theme.
 */
function isLight(color: string): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) return false;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16);
  const luma = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luma > 128;
}

/**
 * The default `Admonition`: an accent bar and tinted box over `Blockquote`'s
 * layout, a title, then the content. `theme.elements.Admonition` styles every
 * kind and `AdmonitionNote` and the like style one; both win over the
 * defaults, the kind over the shared one.
 */
export const Admonition: ComponentType<
  ElementProps<'Admonition'> & { children?: ReactNode }
> = function Admonition({ kind, title, children, style }) {
  const { theme } = useRenderContext();
  const own = theme.pluginElements[OVERRIDE_NAMES[kind]];

  const { container, text, titleText } = useMemo(() => {
    const { colors, spacing } = theme.tokens;
    const [light, dark] = ACCENTS[kind];
    const accent = isLight(colors.text) ? dark : light;
    const base = theme.elements.Blockquote.container;
    return {
      container: {
        ...base,
        borderLeftColor: accent,
        backgroundColor: accent + TINT,
        paddingVertical: spacing.block * 0.5,
        paddingRight: spacing.block,
        ...style.container,
        ...own?.container,
      } satisfies ViewStyle,
      text: {
        color: colors.text,
        ...style.text,
        ...own?.text,
      } satisfies TextStyle,
      // The body's family, size and line height, then its bold face: a
      // standalone Text inherits nothing, and with face maps bold is a
      // family switch rather than a weight.
      titleText: {
        ...theme.elements.Paragraph.text,
        ...theme.fontVariants.Strong[fontStateIndex(BODY_FONT)]!.text,
        color: accent,
        marginBottom: spacing.block * 0.5,
      } satisfies TextStyle,
    };
  }, [theme, kind, style, own]);

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
