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

export interface ListTheme extends MarginProps {
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

export interface ListItemTheme extends TextProps {}

export interface CodeBlockTheme extends TextFaceProps, MarginProps {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  syntax?: Partial<Record<SyntaxTokenType, string>>;
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

export interface TableTheme extends MarginProps {
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  /** A table narrower than its container. */
  align?: 'left' | 'center' | 'right';
  /** Bleed in points on each side of a scrolling table. */
  horizontalOverflow?: number;
  headerBackgroundColor?: string;
  headerColor?: string;
  headerFontFamily?: string;
  rowEvenBackgroundColor?: string;
  rowOddBackgroundColor?: string;
}

export interface TableCellTheme
  extends TextProps,
    Pick<
      ViewStyle,
      'backgroundColor' | 'padding' | 'paddingHorizontal' | 'paddingVertical'
    > {}

export interface DividerTheme
  extends MarginProps,
    Pick<ViewStyle, 'backgroundColor' | 'height'> {}

export interface ImageTheme extends MarginProps {
  borderRadius?: number;
  /** Also the placeholder until the size is known. */
  aspectRatio?: number;
  /** Fixed height. */
  height?: number;
  /** Fit, aspect kept. */
  maxHeight?: number;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center' | 'none';
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
  /** Regular expression source tested against the href, in order; first match wins. */
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
  listItem?: ListItemTheme;
  codeBlock?: CodeBlockTheme;
  codeBlockHeader?: CodeBlockHeaderTheme;
  table?: TableTheme;
  tableCell?: TableCellTheme;
  divider?: DividerTheme;
  image?: ImageTheme;
  inlineImage?: InlineImageTheme;
  htmlBlock?: HtmlBlockTheme;
  footnoteDefinition?: FootnoteDefinitionTheme;
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
  footnoteReference?: FootnoteReferenceTheme;
  footnoteBackLink?: FootnoteBackLinkTheme;
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
