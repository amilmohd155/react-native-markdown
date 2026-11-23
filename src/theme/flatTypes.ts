import type { TextStyle, ViewStyle } from 'react-native';
import type { PluginThemeMap } from './pluginElements';
import type { FontFamily, SyntaxTokenType } from './types';

/**
 * The typed flat theme input: one object keyed by element, each key with a
 * closed whitelist of props. A prop an element does not accept is a type
 * error (no index signatures).
 * Spec: docs/rewrite/phase-3a/theme-props.md
 */

/** Group T: text props with a plain family name. */
export interface TextProps
  extends Pick<
    TextStyle,
    | 'color'
    | 'fontFamily'
    | 'fontSize'
    | 'fontWeight'
    | 'fontStyle'
    | 'lineHeight'
    | 'textAlign'
  > {}

/** Group T where the family may also be a face map (`FontFamily`). */
export interface TextFaceProps extends Omit<TextProps, 'fontFamily'> {
  fontFamily?: FontFamily;
}

/** Group M: vertical margins. */
export interface MarginProps
  extends Pick<ViewStyle, 'marginTop' | 'marginBottom'> {}

// Block elements

export interface ParagraphTheme extends TextFaceProps, MarginProps {}

export interface HeadingTheme extends TextFaceProps, MarginProps {}

export type AdmonitionKind =
  | 'note'
  | 'tip'
  | 'important'
  | 'warning'
  | 'caution';

export interface AdmonitionTheme {
  /** Accent. A hex color gets a default tint as `backgroundColor`; any other format needs `backgroundColor` set. */
  color?: string;
  backgroundColor?: string;
}

export interface BlockquoteTheme extends TextProps, MarginProps {
  backgroundColor?: string;
  borderLeftColor?: string;
  borderLeftWidth?: number;
  borderRadius?: number;
  /** Top and bottom padding, at every nesting level. */
  padding?: number;
  /** Bar to text. */
  paddingLeft?: number;
  admonitions?: Partial<Record<AdmonitionKind, AdmonitionTheme>>;
}

/** `list` also takes group T, applied to the item text (over the paragraph's). */
export interface ListTheme extends TextProps, MarginProps {
  /** Bullet by depth, repeating. */
  bullets?: readonly string[];
  bulletColor?: string;
  bulletSize?: number;
  /** Colour of number markers. */
  markerColor?: string;
  markerFontWeight?: TextStyle['fontWeight'];
  /** Floors the marker column so "9." and "10." align. */
  markerMinWidth?: number;
  /** Marker to text. */
  gapWidth?: number;
  /** Indent per nesting level. */
  marginLeft?: number;
  /** Between items, nested included. */
  itemSpacing?: number;
}

export interface CodeBlockTheme extends TextFaceProps, MarginProps {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  syntax?: Partial<Record<SyntaxTokenType, string>>;
  header?: CodeBlockHeaderTheme;
}

export interface CodeBlockHeaderTheme
  extends Pick<TextStyle, 'color' | 'fontFamily' | 'fontSize' | 'lineHeight'>,
    Pick<
      ViewStyle,
      | 'backgroundColor'
      | 'borderBottomColor'
      | 'borderBottomWidth'
      | 'paddingHorizontal'
      | 'paddingVertical'
    > {}

/** `table` also takes group T, applied to the cell text (over the paragraph's). */
export interface TableTheme extends TextProps, MarginProps {
  /** Padding of every cell. */
  cellPadding?: ViewStyle['padding'];
  cellPaddingHorizontal?: ViewStyle['paddingHorizontal'];
  cellPaddingVertical?: ViewStyle['paddingVertical'];
  cellBackgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  /** A table narrower than its container. */
  align?: 'left' | 'center' | 'right';
  /**
   * Bleed in points on each side of a scrolling table. It replaces any
   * marginLeft/marginRight of the table (`MarginProps` only allows top/bottom). An ancestor with `overflow: hidden`
   * clips the bleed. Negative values count as 0.
   */
  horizontalOverflow?: number;
  headerBackgroundColor?: string;
  headerColor?: string;
  headerFontFamily?: string;
  rowEvenBackgroundColor?: string;
  rowOddBackgroundColor?: string;
}

export interface DividerTheme
  extends MarginProps,
    Pick<ViewStyle, 'backgroundColor' | 'height'> {}

export interface ImageTheme extends MarginProps {
  borderRadius?: number;
  /** Fixed box ratio (overrides the natural one); also the placeholder. */
  aspectRatio?: number;
  /** Fixed height. */
  height?: number;
  /** Height cap, natural aspect kept. */
  maxHeight?: number;
  /** Default `'cover'` with `aspectRatio` or `maxHeight`, else `'contain'`. */
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center' | 'none';
  /** Fade-in on load, in ms. Default 150; `0` turns it off. */
  fadeDuration?: number;
}

export interface InlineImageTheme {
  /** Square side in points, scaled to fit. */
  size?: number;
}

export interface HtmlBlockTheme
  extends Pick<TextStyle, 'color' | 'fontFamily' | 'fontSize'>,
    MarginProps {}

export interface FootnoteDefinitionTheme
  extends Pick<TextStyle, 'color' | 'fontSize' | 'lineHeight'> {
  /** Jump flash. */
  highlightColor?: string;
}

export interface CheckboxTheme {
  color?: string;
  checkedColor?: string;
  size?: number;
  /** Unchecked box. */
  borderColor?: string;
  checkmarkColor?: string;
  borderRadius?: number;
  /** Style of a checked item's text, or `false` for none. */
  checkedText?: TextStyle | false;
}

// Inline elements

export interface StrongTheme extends Pick<TextStyle, 'color' | 'fontWeight'> {
  fontFamily?: string;
}

export interface EmTheme extends Pick<TextStyle, 'color' | 'fontStyle'> {
  fontFamily?: string;
}

/** On Android the decoration takes the text colour, so this colours the text too. */
export interface DecorationTheme extends Pick<TextStyle, 'color'> {}

export interface HighlightTheme
  extends Pick<TextStyle, 'color' | 'backgroundColor'> {}

export interface LinkProps
  extends Pick<
    TextStyle,
    | 'color'
    | 'fontFamily'
    | 'fontWeight'
    | 'textDecorationLine'
    | 'backgroundColor'
  > {}

export interface LinkTheme extends LinkProps {
  /**
   * Regular expression source tested against the href. Order matters: the
   * first match wins. Variants merge per pattern, prop by prop, across
   * layers (a `dark` entry for `'^user:'` keeps the top-level props it does
   * not set); new patterns append after the existing ones.
   */
  variants?: Record<string, LinkProps>;
}

export interface InlineCodeTheme
  extends Pick<
    TextStyle,
    'color' | 'fontFamily' | 'fontSize' | 'backgroundColor'
  > {}

export interface ScriptTheme extends Pick<TextStyle, 'color'> {
  /** Fraction of the surrounding size. */
  fontScale?: number;
}

export interface FootnoteReferenceTheme extends Pick<TextStyle, 'color'> {
  fontScale?: number;
}

export interface FootnoteBackLinkTheme extends Pick<TextStyle, 'color'> {}

export interface FootnoteTheme {
  reference?: FootnoteReferenceTheme;
  backLink?: FootnoteBackLinkTheme;
  definition?: FootnoteDefinitionTheme;
}

/** Core keys and the props each accepts. */
export interface CoreFlatTheme {
  paragraph?: ParagraphTheme;
  h1?: HeadingTheme;
  h2?: HeadingTheme;
  h3?: HeadingTheme;
  h4?: HeadingTheme;
  h5?: HeadingTheme;
  h6?: HeadingTheme;
  blockquote?: BlockquoteTheme;
  list?: ListTheme;
  codeBlock?: CodeBlockTheme;
  table?: TableTheme;
  divider?: DividerTheme;
  image?: ImageTheme;
  inlineImage?: InlineImageTheme;
  htmlBlock?: HtmlBlockTheme;
  checkbox?: CheckboxTheme;
  strong?: StrongTheme;
  em?: EmTheme;
  strikethrough?: DecorationTheme;
  underline?: DecorationTheme;
  highlight?: HighlightTheme;
  link?: LinkTheme;
  inlineCode?: InlineCodeTheme;
  kbd?: InlineCodeTheme;
  superscript?: ScriptTheme;
  subscript?: ScriptTheme;
  footnote?: FootnoteTheme;
}

/** Names of the core keys. */
export type CoreThemeKey = keyof CoreFlatTheme;

/**
 * The keys a plugin map adds, all optional; `never` when any key clashes with
 * a core key, `dark` or `light` (so every use of the theme type fails to
 * compile).
 */
export type GuardedThemeKeys<M> = [
  Extract<keyof M, CoreThemeKey | 'dark' | 'light'>,
] extends [never]
  ? { [K in keyof M]?: M[K] }
  : never;

/** Plugin keys, from `PluginThemeMap`. */
export type PluginThemeKeys = GuardedThemeKeys<PluginThemeMap>;

/** The shape of one scheme block: every key optional. */
export type FlatThemeBlock = CoreFlatTheme & PluginThemeKeys;

/**
 * Top-level keys apply to both schemes; `dark`/`light` merge over them.
 * `object &`: every key is optional, and without it a string
 * (`theme="sepia"`) would be assignable.
 */
export type FlatThemeInput = object &
  FlatThemeBlock & {
    dark?: FlatThemeBlock;
    light?: FlatThemeBlock;
  };

/** `T` with the props in `R` replaced by (usually required) versions. */
type With<T, R> = Omit<T, keyof R> & R;

/** A heading key as `useMarkdownTheme()` returns it: its size is always set. */
type ResolvedHeading = With<HeadingTheme, { fontSize: number }>;

/**
 * What `useMarkdownTheme()` returns: the merged flat theme of the active
 * scheme, in the vocabulary of the `theme` prop. Built-in defaults are always
 * present, so the props that have one are required (`link.color`,
 * `paragraph.fontSize`, `codeBlock.backgroundColor`, `h1.fontSize`, ...);
 * every other key stays optional, and `dark`/`light` are already applied.
 * Readonly: the same object is returned until the theme changes.
 */
export type MarkdownTheme = Readonly<
  With<
    FlatThemeBlock,
    {
      paragraph: With<
        ParagraphTheme,
        { color: string; fontSize: number; lineHeight: number }
      >;
      h1: ResolvedHeading;
      h2: ResolvedHeading;
      h3: ResolvedHeading;
      h4: ResolvedHeading;
      h5: ResolvedHeading;
      h6: ResolvedHeading;
      blockquote: With<
        BlockquoteTheme,
        { color: string; borderLeftColor: string }
      >;
      list: With<
        ListTheme,
        {
          bullets: readonly string[];
          marginLeft: number;
          gapWidth: number;
        }
      >;
      codeBlock: With<
        CodeBlockTheme,
        {
          color: string;
          backgroundColor: string;
          fontFamily: FontFamily;
          borderRadius: number;
          syntax: Readonly<Record<SyntaxTokenType, string>>;
        }
      >;
      divider: With<DividerTheme, { backgroundColor: string }>;
      highlight: With<HighlightTheme, { backgroundColor: string }>;
      footnote: With<
        FootnoteTheme,
        {
          definition: With<FootnoteDefinitionTheme, { highlightColor: string }>;
        }
      >;
      link: With<LinkTheme, { color: string }>;
      checkbox: With<CheckboxTheme, { checkedText: TextStyle | false }>;
    }
  >
>;
