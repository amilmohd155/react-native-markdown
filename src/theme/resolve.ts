import {
  Platform,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { FlatThemeBlock, FlatThemeInput } from './flatTypes';
import {
  BODY_FONT,
  FONT_STATE_COUNT,
  fontDelta,
  fontStateAt,
  fontStyleFor,
  hasFaceMap,
  monoFamily,
  regularFamily,
} from './fonts';
import { mergeFlat } from './merge';
import { darkTheme, lightTheme } from './tokens';
import { warnUnknownThemeProps } from './warn';
import {
  ELEMENT_NAMES,
  SYNTAX_TOKEN_TYPES,
  type ColorScheme,
  type ElementName,
  type ElementStyle,
  type FontFamily,
  type HeadingLevel,
  type ResolvedTheme,
  type SyntaxTokenType,
  type TableFrame,
  type ThemeTokens,
} from './types';

type StyleEntry = { text?: TextStyle; container?: ViewStyle };

const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

// Internal scales (P3a-2: tokens are internal).
const BLOCK_SPACING = 12;
/** Paragraph line height as a multiple of its size; the result is in points. */
const LINE_HEIGHT = 1.5;
const HEADING_SCALE = 1.2;
/** `fontScale` default of the scaled inline elements: Roboto's larger x-height needs less. */
const scriptScale = (): number =>
  Platform.select({ android: 0.65, default: 0.75 });

/**
 * Typed but ignored for now (no slot in the resolver yet): `blockquote.admonitions`;
 * `link.variants`.
 */

const DEFAULT_IMAGE_RATIO = 16 / 9;

/** Sizing mode of a block image: `aspectRatio` > `maxHeight` > `height`. */
function imageSizing(
  image: FlatThemeBlock['image']
): ThemeTokens['imageSizing'] {
  const { aspectRatio, maxHeight, height, resizeMode } = image ?? {};
  const mode =
    aspectRatio !== undefined
      ? 'ratio'
      : maxHeight !== undefined
        ? 'maxHeight'
        : height !== undefined
          ? 'height'
          : 'natural';
  return Object.freeze({
    mode,
    height,
    maxHeight,
    resizeMode:
      resizeMode ??
      (mode === 'ratio' || mode === 'maxHeight' ? 'cover' : 'contain'),
  });
}

/**
 * Footnote text metrics: the size defaults to 0.875 of the paragraph's, and
 * the line height keeps the paragraph's ratio (so `paragraph.lineHeight`
 * reaches the footnotes) unless `footnoteDefinition.lineHeight` is set.
 */
function footnoteMetrics(b: FlatThemeBlock, t: ThemeTokens) {
  const note = b.footnoteDefinition ?? {};
  return {
    note,
    noteSize: note.fontSize ?? t.fontSize.base * 0.875,
    lineRatio: t.paragraphLineHeight / t.fontSize.base,
  };
}

/**
 * Table variants. The header cell is bold unless `table.headerFontFamily`
 * names its own face; `headerColor` tints its text. Row backgrounds: the
 * header row, then the body rows alternate even/odd counting the first body
 * row as even (a cell's own `backgroundColor` paints over its row).
 */
function deriveTableVariants(
  b: FlatThemeBlock,
  cell: StyleEntry,
  row: StyleEntry,
  fonts: ThemeTokens['fonts']
) {
  const table = b.table ?? {};
  const tableHeaderCell: StyleEntry = {
    text: {
      ...cell.text,
      ...(table.headerFontFamily === undefined
        ? fontStyleFor(fonts.body, { bold: true, italic: false }, '600')
        : { fontFamily: table.headerFontFamily, fontWeight: 'normal' }),
      ...defined<TextStyle>({ color: table.headerColor }),
    },
    container: cell.container,
  };
  const rowWith = (backgroundColor: string | undefined): StyleEntry => ({
    container: { ...row.container, ...defined<ViewStyle>({ backgroundColor }) },
  });
  const tableRows = {
    header: rowWith(table.headerBackgroundColor),
    even: rowWith(table.rowEvenBackgroundColor),
    odd: rowWith(table.rowOddBackgroundColor),
  };
  const tableFrame: TableFrame = Object.freeze({
    align: table.align ?? null,
    bleed: Math.max(0, table.horizontalOverflow ?? 0),
  });
  return { tableHeaderCell, tableRows, tableFrame };
}

const TEXT_KEYS = [
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'textAlign',
] as const;

/** Props of a plugin key that go to the element's text; the rest to its container. */
const PLUGIN_TEXT_PROPS: ReadonlySet<string> = new Set([
  ...TEXT_KEYS,
  'textDecorationLine',
  'textDecorationColor',
  'textDecorationStyle',
  'textTransform',
  'letterSpacing',
  'includeFontPadding',
]);

const CORE_KEYS: ReadonlySet<string> = new Set([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'list',
  'listItem',
  'codeBlock',
  'codeBlockHeader',
  'table',
  'tableCell',
  'divider',
  'image',
  'inlineImage',
  'htmlBlock',
  'footnoteDefinition',
  'checkbox',
  'strong',
  'em',
  'strikethrough',
  'underline',
  'highlight',
  'link',
  'inlineCode',
  'kbd',
  'superscript',
  'subscript',
  'footnoteReference',
  'footnoteBackLink',
]);

/** The defined values of `keys` in `props`, or `{}`. */
function pick<T extends object>(
  props: object | undefined,
  keys: readonly string[]
): T {
  const out: Record<string, unknown> = {};
  if (props !== undefined) {
    const source = props as Record<string, unknown>;
    for (const key of keys) {
      if (source[key] !== undefined) out[key] = source[key];
    }
  }
  return out as T;
}

/** `style` without its `undefined` values. */
function defined<T extends object>(style: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** List marker metrics and marker text styles the item renderer reads. */
function listTokens(list: NonNullable<FlatThemeBlock['list']>) {
  return Object.freeze({
    indent: list.marginLeft!,
    gap: list.gapWidth!,
    markerMinWidth: list.markerMinWidth ?? 0,
    itemSpacing: list.itemSpacing ?? 0,
    // Built once: the item renderer picks one per item.
    bulletStyle: Object.freeze(
      defined<TextStyle>({ color: list.bulletColor, fontSize: list.bulletSize })
    ),
    orderedStyle: Object.freeze(
      defined<TextStyle>({
        textAlign: 'right',
        color: list.markerColor,
        fontWeight: list.markerFontWeight,
      })
    ),
  });
}

/** `{ fontFamily }` when set; nothing for the system font. */
function family(fontFamily: string | undefined): TextStyle {
  return fontFamily === undefined ? {} : { fontFamily };
}

/** Font size of heading level `n`: `round(base * scale^(6 - n))`. */
export function headingFontSize(tokens: ThemeTokens, level: number): number {
  return Math.round(
    tokens.fontSize.base * tokens.fontSize.scale ** (6 - level)
  );
}

/** Syntax types whose default is the base code colour (P3a-4). */
const BASE_COLOR_SYNTAX: ReadonlySet<SyntaxTokenType> = new Set([
  'operator',
  'punctuation',
  'variable',
  'embedded',
  'plain',
]);

/**
 * The internal resolved values the renderer reads, from the merged flat
 * block. `muted` is the built-in value of the scheme: no flat key sets it
 * for the structural parts that use it (code gutter, footnote section).
 */
function tokensOf(
  b: FlatThemeBlock,
  scheme: ColorScheme,
  setSyntax: ReadonlySet<SyntaxTokenType>
): ThemeTokens {
  const base = scheme === 'dark' ? darkTheme : lightTheme;
  // One heading font for the font state of inline text inside headings: the
  // first level that sets one. Per-level styles use their own (`deriveHeading`).
  const headingFamily = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)
    .map((key) => b[key]?.fontFamily)
    .find((f) => f !== undefined);
  const checkbox = b.checkbox;
  const syntax = {} as Record<SyntaxTokenType, string>;
  for (const type of SYNTAX_TOKEN_TYPES) {
    // The merged block always holds the built-in palette, so the base code
    // colour (P3a-4; `plain` is that colour) applies unless a layer set the type.
    const follow = BASE_COLOR_SYNTAX.has(type) && !setSyntax.has(type);
    syntax[type] =
      (follow ? (b.codeBlock?.color as string | undefined) : undefined) ??
      b.codeBlock?.syntax?.[type] ??
      base.codeBlock!.syntax![type]!;
  }
  return Object.freeze({
    colors: Object.freeze({
      text: b.paragraph!.color! as string,
      muted: base.blockquote!.color! as string,
      link: b.link!.color! as string,
      codeBg: b.codeBlock!.backgroundColor! as string,
      border: b.divider!.backgroundColor! as string,
      quoteBar: b.blockquote!.borderLeftColor! as string,
      highlight: b.highlight!.backgroundColor! as string,
      footnoteHighlight: b.footnoteDefinition!.highlightColor!,
    }),
    fonts: Object.freeze({
      body: b.paragraph!.fontFamily,
      heading: headingFamily,
      mono:
        regularFamily(b.codeBlock!.fontFamily as FontFamily | undefined) ??
        'monospace',
    }),
    fontSize: Object.freeze({
      base: b.paragraph!.fontSize!,
      scale: HEADING_SCALE,
    }),
    paragraphLineHeight:
      b.paragraph!.lineHeight ?? b.paragraph!.fontSize! * LINE_HEIGHT,
    fontScale: Object.freeze({
      superscript: b.superscript?.fontScale ?? scriptScale(),
      subscript: b.subscript?.fontScale ?? scriptScale(),
      footnoteReference: b.footnoteReference?.fontScale ?? scriptScale(),
    }),
    spacing: Object.freeze({ block: BLOCK_SPACING }),
    list: listTokens(b.list!),
    radius: Object.freeze({ code: b.codeBlock!.borderRadius! }),
    listBullets: Object.freeze([...b.list!.bullets!]),
    imageRatio: b.image?.aspectRatio ?? DEFAULT_IMAGE_RATIO,
    imageSizing: imageSizing(b.image),
    inlineImageSize: b.inlineImage?.size,
    checkbox: Object.freeze({
      color: checkbox?.color,
      checkedColor: checkbox?.checkedColor,
      size: checkbox?.size,
      borderColor: checkbox?.borderColor,
      checkmarkColor: checkbox?.checkmarkColor,
      borderRadius: checkbox?.borderRadius,
      checkedText: checkbox?.checkedText ?? base.checkbox!.checkedText!,
    }),
    syntax: Object.freeze(syntax),
  });
}

/**
 * Element styles from the merged flat block `b` and its tokens `t`. The
 * inheritance is written once: the paragraph's text props flow into list
 * items, table cells and HTML blocks (their own props win).
 *
 * Inline styles carry only what they change, so nested `<Text>` inherits
 * the rest (a `Strong` inside a `Heading` keeps the heading's size).
 */
function deriveElements(
  b: FlatThemeBlock,
  t: ThemeTokens
): Record<ElementName, StyleEntry> {
  const { colors, fonts, fontSize, spacing } = t;
  const base = fontSize.base;
  const block = spacing.block;
  const mono = monoFamily(fonts.mono);
  const P = b.paragraph!;

  const blockText: TextStyle = defined<TextStyle>({
    fontSize: base,
    lineHeight: t.paragraphLineHeight,
    color: colors.text,
    // A face map is its regular face here.
    fontFamily: regularFamily(fonts.body),
    ...pick<TextStyle>(P, [
      'fontWeight',
      'fontStyle',
      'lineHeight',
      'textAlign',
    ]),
  });

  const quote = b.blockquote ?? {};
  const list = b.list ?? {};
  const code = b.codeBlock!;
  const codeSize = code.fontSize ?? base * 0.875;
  const header = b.codeBlockHeader ?? {};
  const headerSize = header.fontSize ?? base * 0.75;
  const table = b.table ?? {};
  const cell = b.tableCell ?? {};
  const divider = b.divider!;
  const image = b.image ?? {};
  const html = b.htmlBlock ?? {};
  const { note, noteSize, lineRatio } = footnoteMetrics(b, t);
  const link = b.link!;
  const inlineCode = (own: FlatThemeBlock['inlineCode']): TextStyle =>
    defined<TextStyle>({
      fontFamily: own?.fontFamily ?? mono,
      fontSize: own?.fontSize,
      backgroundColor: own?.backgroundColor ?? colors.codeBg,
      color: own?.color,
    });
  // No size: the renderer scales the surrounding one by `tokens.fontScale`.
  const script = (own: FlatThemeBlock['superscript']): TextStyle =>
    defined<TextStyle>({ color: own?.color });
  const decoration = (
    own: FlatThemeBlock['underline'],
    line: 'underline' | 'line-through'
  ): TextStyle =>
    defined<TextStyle>({ textDecorationLine: line, color: own?.color });

  return {
    Heading: {},
    Paragraph: {
      text: blockText,
      container: defined<ViewStyle>({
        marginTop: P.marginTop,
        marginBottom: P.marginBottom ?? block,
      }),
    },
    Blockquote: {
      text: defined<TextStyle>({
        color: colors.muted,
        ...pick<TextStyle>(quote, TEXT_KEYS),
      }),
      container: defined<ViewStyle>({
        borderLeftWidth: quote.borderLeftWidth ?? 4,
        borderLeftColor: colors.quoteBar,
        paddingLeft: quote.paddingLeft ?? block,
        // Top and bottom only: the left is the bar-to-text gap.
        paddingVertical: quote.padding,
        marginTop: quote.marginTop,
        marginBottom: quote.marginBottom ?? block,
        backgroundColor: quote.backgroundColor,
        borderRadius: quote.borderRadius,
      }),
    },
    List: {
      container: defined<ViewStyle>({
        paddingLeft: 0,
        marginTop: list.marginTop,
        marginBottom: list.marginBottom ?? block,
      }),
    },
    ListItem: {
      text: { ...blockText, ...pick<TextStyle>(b.listItem, TEXT_KEYS) },
      container: { flexDirection: 'row' },
    },
    CodeBlock: {
      text: defined<TextStyle>({
        fontFamily: mono,
        fontSize: codeSize,
        lineHeight: codeSize * 1.45,
        color: colors.text,
        ...pick<TextStyle>(code, [
          'color',
          'fontWeight',
          'fontStyle',
          'lineHeight',
          'textAlign',
        ]),
      }),
      container: defined<ViewStyle>({
        backgroundColor: colors.codeBg,
        borderRadius: t.radius.code,
        padding: code.padding ?? block,
        marginTop: code.marginTop,
        marginBottom: code.marginBottom ?? block,
        borderColor: code.borderColor,
        borderWidth: code.borderWidth,
      }),
    },
    CodeBlockHeader: {
      text: defined<TextStyle>({
        fontFamily: header.fontFamily ?? mono,
        fontSize: headerSize,
        lineHeight: header.lineHeight ?? headerSize * 1.45,
        color: header.color ?? colors.muted,
      }),
      container: defined<ViewStyle>({
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: header.backgroundColor ?? colors.codeBg,
        borderBottomWidth: header.borderBottomWidth ?? StyleSheet.hairlineWidth,
        borderBottomColor: header.borderBottomColor ?? colors.border,
        paddingHorizontal: header.paddingHorizontal ?? block,
        paddingVertical: header.paddingVertical ?? block * 0.5,
      }),
    },
    Table: {
      container: defined<ViewStyle>({
        marginTop: table.marginTop,
        marginBottom: table.marginBottom ?? block,
        borderColor: table.borderColor,
        borderWidth: table.borderWidth,
        borderRadius: table.borderRadius,
      }),
    },
    TableRow: { container: { flexDirection: 'row' } },
    TableCell: {
      text: { ...blockText, ...pick<TextStyle>(cell, TEXT_KEYS) },
      container: defined<ViewStyle>({
        // The grid follows `table.borderColor`; the outer border is the
        // table's own (`borderWidth`, `borderRadius`).
        borderColor: table.borderColor ?? colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        padding: block * 0.5,
        ...pick<ViewStyle>(cell, [
          'backgroundColor',
          'padding',
          'paddingHorizontal',
          'paddingVertical',
        ]),
      }),
    },
    Divider: {
      container: defined<ViewStyle>({
        height: divider.height ?? StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: block,
        marginTop: divider.marginTop,
        marginBottom: divider.marginBottom,
      }),
    },
    Image: {
      container: defined<ViewStyle>({
        marginTop: image.marginTop,
        marginBottom: image.marginBottom ?? block,
        borderRadius: image.borderRadius,
      }),
    },
    HtmlBlock: {
      text: {
        ...blockText,
        fontFamily: mono,
        color: colors.muted,
        ...pick<TextStyle>(html, ['color', 'fontFamily', 'fontSize']),
      },
      container: defined<ViewStyle>({
        marginTop: html.marginTop,
        marginBottom: html.marginBottom ?? block,
      }),
    },
    FootnoteDefinition: {
      // Label and back-links; the definition's paragraphs take the
      // section's text style.
      text: defined<TextStyle>({
        fontSize: noteSize,
        lineHeight: note.lineHeight ?? noteSize * lineRatio,
        color: note.color,
      }),
      container: { flexDirection: 'row' },
    },
    Strong: {
      text: {
        ...fontDelta(fonts, BODY_FONT, { bold: true }),
        ...pick<TextStyle>(b.strong, ['color', 'fontFamily', 'fontWeight']),
      },
    },
    Emphasis: {
      text: {
        ...fontDelta(fonts, BODY_FONT, { italic: true }),
        ...pick<TextStyle>(b.em, ['color', 'fontFamily', 'fontStyle']),
      },
    },
    Strikethrough: { text: decoration(b.strikethrough, 'line-through') },
    Underline: { text: decoration(b.underline, 'underline') },
    Highlight: {
      text: defined<TextStyle>({
        backgroundColor: colors.highlight,
        color: b.highlight!.color,
      }),
    },
    Superscript: { text: script(b.superscript) },
    Subscript: { text: script(b.subscript) },
    Link: {
      text: {
        color: colors.link,
        textDecorationLine: 'underline',
        ...pick<TextStyle>(link, [
          'fontFamily',
          'fontWeight',
          'textDecorationLine',
          'backgroundColor',
        ]),
      },
    },
    InlineCode: { text: inlineCode(b.inlineCode) },
    Kbd: { text: inlineCode(b.kbd) },
    InlineImage: {},
    LineBreak: {},
    FootnoteReference: {
      text: {
        color: b.footnoteReference?.color ?? colors.link,
      },
    },
    FootnoteBackLink: {
      text: { color: b.footnoteBackLink?.color ?? colors.link },
    },
    HtmlInline: { text: {} },
  };
}

/**
 * Style of heading `level`. Own props of `h<level>` win; the size derives
 * from the paragraph's by the heading ratio. A heading's own `fontFamily`
 * (a name or a face map) goes through the same face logic as the body's.
 */
function deriveHeading(
  b: FlatThemeBlock,
  t: ThemeTokens,
  level: HeadingLevel
): StyleEntry {
  const own = b[`h${level}`] ?? {};
  const headingFamily: FontFamily | undefined = own.fontFamily ?? t.fonts.body;
  const size = own.fontSize ?? headingFontSize(t, level);
  return {
    text: {
      fontSize: size,
      lineHeight: Math.round(size * 1.25),
      color: t.colors.text,
      // Headings are bold: the `bold` face of a face map, else `fontWeight`
      // (h3–h6 use '600').
      ...family(regularFamily(headingFamily)),
      ...fontStyleFor(
        headingFamily,
        { bold: true, italic: false },
        level <= 2 ? '700' : '600'
      ),
      ...pick<TextStyle>(own, [
        'color',
        'fontWeight',
        'fontStyle',
        'lineHeight',
        'textAlign',
      ]),
    },
    container: defined<ViewStyle>({
      marginTop: own.marginTop ?? t.spacing.block * 1.5,
      marginBottom: own.marginBottom ?? t.spacing.block * 0.5,
    }),
  };
}

/** Styles of the keys no core element owns: plugin elements, by key. */
function pluginEntries(b: FlatThemeBlock): Map<string, StyleEntry> {
  const out = new Map<string, StyleEntry>();
  for (const [name, props] of Object.entries(b)) {
    if (CORE_KEYS.has(name) || typeof props !== 'object' || props === null) {
      continue;
    }
    const text: Record<string, unknown> = {};
    const container: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) continue;
      (PLUGIN_TEXT_PROPS.has(key) ? text : container)[key] = value;
    }
    if (Object.keys(text).length === 0 && Object.keys(container).length === 0) {
      continue;
    }
    out.set(name, {
      text: text as TextStyle,
      container: container as ViewStyle,
    });
  }
  return out;
}

/**
 * Resolves a theme into element styles with a single `StyleSheet.create`
 * call covering every element, heading level and variant.
 *
 * Merge order (`mergeFlat`): the built-in flat theme of `scheme`, `layers`
 * (plugin default blocks, in plugin order), the input's top-level keys, the
 * input's `dark`/`light` block for `scheme`. Elements are derived from the
 * merged block. Variants (`tightParagraph`, `nestedList`, `tableHeaderCell`,
 * `codeBlockGutter`, font variants) derive from the merged elements, so a
 * `paragraph`, `list` or `codeBlock` prop reaches them too.
 * Spec: docs/rewrite/phase-3a/theme-props.md
 */
export function resolveTheme(
  input: FlatThemeInput = {},
  scheme: ColorScheme = 'light',
  layers: readonly FlatThemeBlock[] = []
): ResolvedTheme {
  warnUnknownThemeProps(input);
  const block = mergeFlat(scheme, layers, input);
  const setSyntax = new Set<SyntaxTokenType>();
  for (const source of [...layers, input, input[scheme]]) {
    for (const key of Object.keys(source?.codeBlock?.syntax ?? {})) {
      setSyntax.add(key as SyntaxTokenType);
    }
  }
  const tokens = tokensOf(block, scheme, setSyntax);
  const { fonts } = tokens;

  const merged = deriveElements(block, tokens);
  const headings = HEADING_LEVELS.map((level) =>
    deriveHeading(block, tokens, level)
  );

  // Variants, from the merged elements.
  const paragraph = merged.Paragraph;
  const tableCell = merged.TableCell;
  const { tableHeaderCell, tableRows, tableFrame } = deriveTableVariants(
    block,
    tableCell,
    merged.TableRow,
    fonts
  );
  // A sub-list sits `itemSpacing` below its parent item's text.
  const nestedList: StyleEntry = {
    container: {
      ...merged.List.container,
      marginBottom: 0,
      ...(tokens.list.itemSpacing > 0 && {
        marginTop: tokens.list.itemSpacing,
      }),
    },
  };
  const tightParagraph: StyleEntry = {
    text: paragraph.text,
    container: { ...paragraph.container, marginBottom: 0 },
  };
  const { note, noteSize, lineRatio } = footnoteMetrics(block, tokens);
  const footnoteSection: StyleEntry = {
    text: {
      fontSize: noteSize,
      lineHeight: note.lineHeight ?? noteSize * lineRatio,
      color: note.color ?? tokens.colors.muted,
    },
    container: {
      marginTop: tokens.spacing.block,
      paddingTop: tokens.spacing.block,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.colors.border,
    },
  };

  // Aligns line for line with the merged code text.
  const codeText = merged.CodeBlock.text ?? {};
  const codeBlockGutter: StyleEntry = {
    text: {
      fontFamily: codeText.fontFamily,
      fontSize: codeText.fontSize,
      lineHeight: codeText.lineHeight,
      color: tokens.colors.muted,
      textAlign: 'right',
      paddingRight: tokens.spacing.block * 0.5,
    },
    container: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: tokens.colors.border,
    },
  };

  // Font variants: only face maps make `Strong`/`Emphasis` depend on where
  // they sit, so family names reuse the one element style.
  const faceMode = hasFaceMap(fonts);
  const variantEntries: Record<'Strong' | 'Emphasis', StyleEntry[]> = {
    Strong: [],
    Emphasis: [],
  };
  if (faceMode) {
    const strong = pick<TextStyle>(block.strong, [
      'color',
      'fontFamily',
      'fontWeight',
    ]);
    const em = pick<TextStyle>(block.em, ['color', 'fontFamily', 'fontStyle']);
    for (let i = 0; i < FONT_STATE_COUNT; i++) {
      const parent = fontStateAt(i);
      variantEntries.Strong.push({
        text: { ...fontDelta(fonts, parent, { bold: true }), ...strong },
      });
      variantEntries.Emphasis.push({
        text: { ...fontDelta(fonts, parent, { italic: true }), ...em },
      });
    }
  }

  // Flatten everything into one sheet: `${key}.text` / `${key}.container`.
  const flat: Record<string, TextStyle | ViewStyle> = {};
  const add = (key: string, entry: StyleEntry) => {
    flat[`${key}.text`] = entry.text ?? {};
    flat[`${key}.container`] = entry.container ?? {};
  };
  for (const name of ELEMENT_NAMES) add(name, merged[name]);
  const plugins = pluginEntries(block);
  for (const [name, entry] of plugins) add(`plugin:${name}`, entry);
  headings.forEach((entry, i) => add(`h${i + 1}`, entry));
  add('tableHeaderCell', tableHeaderCell);
  add('tableHeaderRow', tableRows.header);
  add('tableRowEven', tableRows.even);
  add('tableRowOdd', tableRows.odd);
  add('nestedList', nestedList);
  add('tightParagraph', tightParagraph);
  add('footnoteSection', footnoteSection);
  add('codeBlockGutter', codeBlockGutter);
  variantEntries.Strong.forEach((e, i) => add(`Strong@${i}`, e));
  variantEntries.Emphasis.forEach((e, i) => add(`Emphasis@${i}`, e));

  const sheet = StyleSheet.create(flat);
  const pick1 = (key: string): ElementStyle =>
    Object.freeze({
      text: sheet[`${key}.text`] as TextStyle,
      container: sheet[`${key}.container`] as ViewStyle,
    });

  const elements = {} as Record<ElementName, ElementStyle>;
  for (const name of ELEMENT_NAMES) elements[name] = pick1(name);
  const pluginElements: Record<string, ElementStyle> = {};
  for (const name of plugins.keys()) {
    pluginElements[name] = pick1(`plugin:${name}`);
  }

  const variants = (name: 'Strong' | 'Emphasis'): readonly ElementStyle[] => {
    if (!faceMode) {
      return Object.freeze(
        Array<ElementStyle>(FONT_STATE_COUNT).fill(elements[name])
      );
    }
    return Object.freeze(
      Array.from({ length: FONT_STATE_COUNT }, (_, i) => pick1(`${name}@${i}`))
    );
  };

  return Object.freeze({
    tokens,
    elements: Object.freeze(elements),
    pluginElements: Object.freeze(pluginElements),
    headings: Object.freeze([
      pick1('h1'),
      pick1('h2'),
      pick1('h3'),
      pick1('h4'),
      pick1('h5'),
      pick1('h6'),
    ] as const),
    fontVariants: Object.freeze({
      Strong: variants('Strong'),
      Emphasis: variants('Emphasis'),
    }),
    tableHeaderCell: pick1('tableHeaderCell'),
    tableHeaderRow: pick1('tableHeaderRow'),
    tableRowEven: pick1('tableRowEven'),
    tableRowOdd: pick1('tableRowOdd'),
    tableFrame,
    nestedList: pick1('nestedList'),
    tightParagraph: pick1('tightParagraph'),
    footnoteSection: pick1('footnoteSection'),
    codeBlockGutter: pick1('codeBlockGutter'),
  });
}

let defaultTheme: ResolvedTheme | null = null;

/**
 * The built-in light theme, resolved on first use and kept for the app's
 * lifetime.
 */
export function getDefaultTheme(): ResolvedTheme {
  defaultTheme ??= resolveTheme();
  return defaultTheme;
}
