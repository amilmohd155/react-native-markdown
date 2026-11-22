import type { TextStyle, ViewStyle } from 'react-native';
import type { AdmonitionKind, MarkdownTheme } from './flatTypes';

/**
 * Built-in element names: the keys of `components`.
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
 * Syntax token types shared by `codeBlock.syntax` and the `/highlight`
 * entry. Defined in core so the theme never imports from a subpath.
 * Names follow enriched-markdown's `syntaxColors` where they map (`tag` and
 * `attribute` are not offered: no bundled tokenizer emits markup); `plain`,
 * `inserted` and `deleted` are ours. `operator`, `punctuation`, `variable`
 * and `embedded` are drawn in the base code colour by default.
 * Spec: docs/rewrite/phase-3/decisions.md (P3-29, P3-33), P3a-4
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
  'variable',
  'embedded',
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
 * The resolved values the renderer reads, derived from the merged flat theme
 * (P3a-2). Not an input: the flat theme is.
 * Spec: docs/rewrite/phase-3a/theme-props.md
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
  /** Paragraph line height in points (`paragraph.lineHeight` or 1.5 times its size). */
  readonly paragraphLineHeight: number;
  /** Fraction of the surrounding size for the scaled inline elements (platform default or `fontScale`). */
  readonly fontScale: {
    readonly superscript: number;
    readonly subscript: number;
    readonly footnoteReference: number;
  };
  readonly spacing: {
    readonly block: number;
  };
  /** List marker metrics (`list.*`). `indent` is the per-level minimum column. */
  readonly list: {
    readonly indent: number;
    readonly gap: number;
    readonly markerMinWidth: number;
    readonly itemSpacing: number;
    /** Bullet marker text style (`bulletColor`, `bulletSize`). */
    readonly bulletStyle: TextStyle;
    /** Number marker text style (right-aligned, `markerColor`, `markerFontWeight`). */
    readonly orderedStyle: TextStyle;
  };
  readonly radius: {
    readonly code: number;
  };
  /** Bullet character by list nesting depth, repeating. */
  readonly listBullets: readonly string[];
  /**
   * Width / height of the box a block image reserves until its real size is
   * known (and it isn't cached); with `image.aspectRatio` set it is also the
   * loaded box. Keeps the list from shifting under a windowed list.
   */
  readonly imageRatio: number;
  /**
   * How a block image is sized (`image.aspectRatio` > `maxHeight` > `height`,
   * else the natural ratio). `resizeMode` defaults to `'cover'` when a ratio
   * or `maxHeight` is set, else `'contain'`.
   */
  readonly imageSizing: {
    readonly mode: 'natural' | 'ratio' | 'maxHeight' | 'height';
    readonly height: number | undefined;
    readonly maxHeight: number | undefined;
    readonly resizeMode: 'contain' | 'cover' | 'stretch' | 'center' | 'none';
  };
  /** `inlineImage.size`: square side in points; unset, the line height. */
  readonly inlineImageSize: number | undefined;
  /**
   * The task-list checkbox (P3-20), a drawn box. `color` is the unchecked
   * border (unless `borderColor`) and `checkedColor` the checked fill; unset,
   * both are the text color. `size` defaults to 0.9 x the list font size.
   * `checkmarkColor` defaults to black or white, whichever reads on the fill.
   * `checkedText` is the style of a checked item's own text (never its
   * sub-items'): an object merged onto the default (line-through, dimmed),
   * or `false` for none.
   */
  readonly checkbox: {
    readonly color?: string;
    readonly checkedColor?: string;
    readonly size?: number;
    readonly borderColor?: string;
    readonly checkmarkColor?: string;
    readonly borderRadius?: number;
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

/** An admonition's style: the box and text, plus its accent (bar, title). */
export interface AdmonitionStyle extends ElementStyle {
  readonly accent: string;
}

/** A `link.variants` entry: its pattern and the `Link` style merged with it. */
export interface LinkVariantStyle {
  /** Compiled without flags, so `test` keeps no state between calls. */
  readonly test: RegExp;
  readonly style: ElementStyle;
}

/**
 * A resolved theme: element styles derived from the merged flat theme,
 * created once with `StyleSheet.create`.
 * Spec: docs/rewrite/phase-1/theme-resolution.md
 */
export interface ResolvedTheme {
  /**
   * The merged flat theme with the derived defaults filled in: what the
   * public `useMarkdownTheme()` returns.
   */
  readonly flat: MarkdownTheme;
  readonly tokens: ThemeTokens;
  readonly elements: { readonly [E in ElementName]: ElementStyle };
  /**
   * Styles of plugin elements, by name: only what the plugin theme blocks and
   * the `theme` prop set for them (they have no built-in style).
   * Elements with no override are absent; the renderer uses an empty style.
   */
  readonly pluginElements: Readonly<Record<string, ElementStyle>>;
  /** Styles of the admonition kinds (`blockquote.admonitions`), from the blockquote's. */
  readonly admonitions: Readonly<Record<AdmonitionKind, AdmonitionStyle>>;
  /**
   * `link.variants` compiled once, in object order: the first whose `test`
   * matches the href styles the link (`linkStyleFor`). Empty without variants.
   */
  readonly linkVariants: readonly LinkVariantStyle[];
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
  /** `TableRow` of the table head (`table.headerBackgroundColor`). */
  readonly tableHeaderRow: ElementStyle;
  /** `TableRow` of the even body rows, the first body row counts as even. */
  readonly tableRowEven: ElementStyle;
  /** `TableRow` of the odd body rows. */
  readonly tableRowOdd: ElementStyle;
  /** Table placement: `align` of a narrow table, `bleed` of a scrolling one. */
  readonly tableFrame: TableFrame;
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

/** `table.align` (null: unset) and `table.horizontalOverflow` in points. */
export interface TableFrame {
  readonly align: 'left' | 'center' | 'right' | null;
  readonly bleed: number;
}

/** Heading level, 1 to 6. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The color scheme a theme is resolved for. */
export type ColorScheme = 'light' | 'dark';
