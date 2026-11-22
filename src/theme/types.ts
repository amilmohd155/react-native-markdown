import type { TextStyle, ViewStyle } from 'react-native';
import type { PluginElementName } from './pluginElements';

/**
 * Built-in element names: the keys of `components` and `theme.elements`.
 * Spec: docs/rewrite/04-api.md#element-catalog
 *
 * A closed union, so typos fail to compile. Plugins extend it in M5.
 */
export const ELEMENT_NAMES = [
  // Block
  'Heading',
  'Paragraph',
  'Blockquote',
  'List',
  'ListItem',
  'CodeBlock',
  // The bar above a code block (P3-35). No markdown node: `CodeBlock`
  // draws it when `codeBlock.header` is set, so `visit` never calls it.
  'CodeBlockHeader',
  'Table',
  'TableRow',
  'TableCell',
  'Divider',
  'Image',
  'HtmlBlock',
  'FootnoteDefinition',
  // Inline
  'Strong',
  'Emphasis',
  'Strikethrough',
  'InlineCode',
  'Link',
  'InlineImage',
  'LineBreak',
  'FootnoteReference',
  'FootnoteBackLink',
  'Underline',
  'Highlight',
  'Superscript',
  'Subscript',
  'Kbd',
  'HtmlInline',
] as const;

export type ElementName = (typeof ELEMENT_NAMES)[number];

/**
 * Syntax token types shared by `theme.tokens.syntax` and the `/highlight`
 * entry. Defined in core so the theme never imports from a subpath.
 * Spec: docs/rewrite/phase-3/decisions.md (P3-29, P3-33)
 */
export const SYNTAX_TOKEN_TYPES = [
  'keyword',
  'string',
  'number',
  'comment',
  'function',
  'type',
  'operator',
  'punctuation',
  'property',
  'constant',
  'plain',
  'inserted',
  'deleted',
] as const;

export type SyntaxTokenType = (typeof SYNTAX_TOKEN_TYPES)[number];

/**
 * One font family per face, for fonts loaded with `expo-font`'s `useFonts`
 * (which registers each face as its own family). Missing faces fall back to
 * `fontWeight`/`fontStyle` on the nearest face.
 * Spec: docs/rewrite/phase-1/decisions.md#p1-16-font-faces-for-custom-fonts
 */
export interface FontFaces {
  readonly regular: string;
  readonly italic?: string;
  readonly bold?: string;
  readonly boldItalic?: string;
}

/**
 * A family name (the platform picks bold and italic from `fontWeight` and
 * `fontStyle`), or a face map (styles switch `fontFamily` instead).
 */
export type FontFamily = string | FontFaces;

/**
 * Theme tokens. Most apps change only these.
 * Spec: docs/rewrite/04-api.md#theme
 */
export interface ThemeTokens {
  readonly colors: {
    readonly text: string;
    readonly muted: string;
    readonly link: string;
    readonly codeBg: string;
    readonly border: string;
    readonly quoteBar: string;
    readonly highlight: string;
    /** Flash on a footnote definition or reference a press jumped to. */
    readonly footnoteHighlight: string;
  };
  readonly fonts: {
    /** `undefined`: the platform's system font. */
    readonly body: FontFamily | undefined;
    /** `undefined`: same as `body`. */
    readonly heading: FontFamily | undefined;
    /** Code has no bold or italic face, so a face map needs only `regular`. */
    readonly mono: string | { readonly regular: string };
  };
  readonly fontSize: {
    readonly base: number;
    /** Ratio between consecutive heading levels. */
    readonly scale: number;
  };
  /** Line height as a multiple of the font size. */
  readonly lineHeight: number;
  readonly spacing: {
    readonly block: number;
    readonly listIndent: number;
  };
  readonly radius: {
    readonly code: number;
  };
  /** Bullet character by list nesting depth, repeating. */
  readonly listBullets: readonly string[];
  /**
   * Width / height of the box a block image reserves until its real size is
   * known (and it isn't cached). Keeps the list from shifting under a
   * windowed list.
   */
  readonly imageRatio: number;
  /**
   * The task-list checkbox (P3-20). `color`, `checkedColor` and `size` style
   * the marker glyph; unset, it inherits the item's text color and font
   * size. `checkedText` is the style of a checked item's own text (never its
   * sub-items'): an object merged onto the default (line-through, dimmed),
   * or `false` for none.
   */
  readonly checkbox: {
    readonly color?: string;
    readonly checkedColor?: string;
    readonly size?: number;
    readonly checkedText: TextStyle | false;
  };
  /**
   * Code highlighting colors by syntax token type (P3-33), read by the
   * `/highlight` entry. The built-in themes define every type, for their
   * mode's `codeBg`; `plain` is the code text color. A theme input's
   * partial `syntax` merges key by key onto the built-in palette of the
   * resolved scheme, so an unset type keeps that default. The defaults do
   * not follow a custom `colors.text`: set `syntax.plain` (and the rest)
   * alongside it.
   */
  readonly syntax: { readonly [T in SyntaxTokenType]: string };
}

/**
 * The style an element receives as its `style` prop. Text and container
 * styles are separate namespaces, so view and text styles can't be mixed up.
 * Both are always present (empty when the element sets nothing), which keeps
 * shapes stable.
 */
export interface ElementStyle {
  readonly text: TextStyle;
  readonly container: ViewStyle;
}

/**
 * A resolved theme: element styles derived from tokens, created once with
 * `StyleSheet.create`. Spec: docs/rewrite/phase-1/theme-resolution.md
 *
 * M3 builds it from tokens only. M4 adds `createTheme`, the merge order
 * (plugin themes, `theme.elements` overrides) and the resolve cache, behind
 * this same shape.
 */
export interface ResolvedTheme {
  readonly tokens: ThemeTokens;
  readonly elements: { readonly [E in ElementName]: ElementStyle };
  /**
   * Styles of plugin elements, by name: only what the plugin themes and the
   * `theme.elements` prop set for them (they have no token-derived style).
   * Elements with no override are absent; the renderer uses an empty style.
   */
  readonly pluginElements: Readonly<Record<string, ElementStyle>>;
  /** `Heading` style by level: index 0 is h1. */
  readonly headings: readonly [
    ElementStyle,
    ElementStyle,
    ElementStyle,
    ElementStyle,
    ElementStyle,
    ElementStyle,
  ];
  /**
   * `Strong` and `Emphasis` styles by the font state they sit in (index from
   * `fontStateIndex`). With face maps the face depends on nesting
   * (`***x***`, `Emphasis` in a `Heading`); with family names every entry is
   * the same style.
   */
  readonly fontVariants: {
    readonly Strong: readonly ElementStyle[];
    readonly Emphasis: readonly ElementStyle[];
  };
  /** `TableCell` inside the table head. */
  readonly tableHeaderCell: ElementStyle;
  /** `List` nested inside a list item: no bottom margin. */
  readonly nestedList: ElementStyle;
  /** `Paragraph` inside a tight list: no block spacing. */
  readonly tightParagraph: ElementStyle;
  /**
   * The footnote section (structural, not an element): `container` sets it
   * apart from the document, `text` cascades into its definitions.
   */
  readonly footnoteSection: ElementStyle;
  /**
   * The code block's line number gutter (P3-35, structural, not an element):
   * `text` matches the merged `CodeBlock` text line for line, `container`
   * draws the separator on its right.
   */
  readonly codeBlockGutter: ElementStyle;
}

/** Heading level, 1 to 6. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A per-element style override. Both parts are optional, and `text` and
 * `container` are merged separately.
 */
export interface ElementOverride {
  readonly text?: TextStyle;
  readonly container?: ViewStyle;
}

/**
 * Per-element overrides: the `theme.elements` layer. `Heading` may be a
 * function of the level, called once per level at resolve time.
 */
export type ElementOverrides = {
  readonly [E in Exclude<ElementName, 'Heading'>]?: ElementOverride;
} & {
  readonly [E in PluginElementName]?: ElementOverride;
} & {
  readonly Heading?:
    | ElementOverride
    | ((level: HeadingLevel) => ElementOverride);
};

/**
 * What the user writes: any subset of the tokens plus element overrides.
 * Token groups merge key by key, and `listBullets` replaces.
 * Spec: docs/rewrite/04-api.md#theme
 */
export interface ThemeInput {
  readonly colors?: Partial<ThemeTokens['colors']>;
  readonly fonts?: Partial<ThemeTokens['fonts']>;
  readonly fontSize?: Partial<ThemeTokens['fontSize']>;
  readonly lineHeight?: number;
  readonly spacing?: Partial<ThemeTokens['spacing']>;
  readonly radius?: Partial<ThemeTokens['radius']>;
  readonly listBullets?: readonly string[];
  readonly imageRatio?: number;
  readonly checkbox?: Partial<ThemeTokens['checkbox']>;
  readonly syntax?: Partial<ThemeTokens['syntax']>;
  readonly elements?: ElementOverrides;
}

/**
 * The result of `createTheme`: every token present, plus the merged element
 * overrides. It is also a valid `ThemeInput`, so it can be passed straight
 * to the `theme` prop.
 */
export interface Theme extends ThemeTokens {
  readonly elements: ElementOverrides;
}
