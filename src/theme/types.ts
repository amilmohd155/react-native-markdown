import type { TextStyle, ViewStyle } from 'react-native';

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
  'Underline',
  'Highlight',
  'Superscript',
  'Subscript',
  'Kbd',
  'HtmlInline',
] as const;

export type ElementName = (typeof ELEMENT_NAMES)[number];

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
  };
  readonly fonts: {
    /** `undefined`: the platform's system font. */
    readonly body: string | undefined;
    /** `undefined`: same as `body`. */
    readonly heading: string | undefined;
    readonly mono: string;
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
  /** `Heading` style by level: index 0 is h1. */
  readonly headings: readonly [
    ElementStyle,
    ElementStyle,
    ElementStyle,
    ElementStyle,
    ElementStyle,
    ElementStyle,
  ];
  /** `TableCell` inside the table head. */
  readonly tableHeaderCell: ElementStyle;
  /** `List` nested inside a list item: no bottom margin. */
  readonly nestedList: ElementStyle;
  /** `Paragraph` inside a tight list: no block spacing. */
  readonly tightParagraph: ElementStyle;
}
