import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { mergeElements } from './create';
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
import { lightTheme } from './tokens';
import {
  ELEMENT_NAMES,
  type ElementName,
  type ElementOverride,
  type ElementOverrides,
  type ElementStyle,
  type HeadingLevel,
  type ResolvedTheme,
  type Theme,
  type ThemeTokens,
} from './types';

type StyleEntry = { text?: TextStyle; container?: ViewStyle };

const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

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

/** Layers an override on top of a derived entry: `override` wins per key. */
function overlay(entry: StyleEntry, override?: ElementOverride): StyleEntry {
  if (override === undefined) return entry;
  return {
    text:
      override.text === undefined
        ? entry.text
        : { ...entry.text, ...override.text },
    container:
      override.container === undefined
        ? entry.container
        : { ...entry.container, ...override.container },
  };
}

/**
 * Derived element styles for the given tokens (layer 3 of the merge order).
 * Spec: docs/rewrite/phase-1/theme-resolution.md#derived-element-styles
 *
 * Inline styles carry only what they change, so nested `<Text>` inherits
 * the rest (a `Strong` inside a `Heading` keeps the heading's size).
 */
function deriveElements(t: ThemeTokens): Record<ElementName, StyleEntry> {
  const { colors, fonts, fontSize, spacing } = t;
  const base = fontSize.base;
  const mono = monoFamily(fonts.mono);

  const blockText: TextStyle = {
    fontSize: base,
    lineHeight: base * t.lineHeight,
    color: colors.text,
    ...family(regularFamily(fonts.body)),
  };
  const monoInline: TextStyle = {
    fontFamily: mono,
    fontSize: base * 0.9,
    backgroundColor: colors.codeBg,
  };
  const scriptText: TextStyle = { fontSize: base * 0.75 };
  const codeSize = base * 0.875;
  const cellContainer: ViewStyle = {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.block * 0.5,
  };

  return {
    Heading: {},
    Paragraph: {
      text: blockText,
      container: { marginBottom: spacing.block },
    },
    Blockquote: {
      text: { color: colors.muted },
      container: {
        borderLeftWidth: 4,
        borderLeftColor: colors.quoteBar,
        paddingLeft: spacing.block,
        marginBottom: spacing.block,
      },
    },
    List: { container: { paddingLeft: 0, marginBottom: spacing.block } },
    ListItem: { text: blockText, container: { flexDirection: 'row' } },
    CodeBlock: {
      text: {
        fontFamily: mono,
        fontSize: codeSize,
        lineHeight: codeSize * 1.45,
        color: colors.text,
      },
      container: {
        backgroundColor: colors.codeBg,
        borderRadius: t.radius.code,
        padding: spacing.block,
        marginBottom: spacing.block,
      },
    },
    Table: { container: { marginBottom: spacing.block } },
    TableRow: { container: { flexDirection: 'row' } },
    TableCell: { text: blockText, container: cellContainer },
    Divider: {
      container: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: spacing.block,
      },
    },
    Image: { container: { marginBottom: spacing.block } },
    HtmlBlock: {
      text: { ...blockText, fontFamily: mono, color: colors.muted },
      container: { marginBottom: spacing.block },
    },
    FootnoteDefinition: {
      // Label and back-links; the definition's paragraphs take the
      // section's text style.
      text: { fontSize: base * 0.875, lineHeight: base * 0.875 * t.lineHeight },
      container: { flexDirection: 'row' },
    },
    Strong: { text: fontDelta(fonts, BODY_FONT, { bold: true }) },
    Emphasis: { text: fontDelta(fonts, BODY_FONT, { italic: true }) },
    Strikethrough: { text: { textDecorationLine: 'line-through' } },
    Underline: { text: { textDecorationLine: 'underline' } },
    Highlight: { text: { backgroundColor: colors.highlight } },
    Superscript: { text: scriptText },
    Subscript: { text: scriptText },
    Link: { text: { color: colors.link, textDecorationLine: 'underline' } },
    InlineCode: { text: monoInline },
    Kbd: { text: monoInline },
    InlineImage: {},
    LineBreak: {},
    FootnoteReference: { text: { ...scriptText, color: colors.link } },
    HtmlInline: { text: {} },
  };
}

/** Derived style of heading `level`, before overrides. */
function deriveHeading(t: ThemeTokens, level: HeadingLevel): StyleEntry {
  const { colors, fonts, spacing } = t;
  const headingFamily = fonts.heading ?? fonts.body;
  const size = headingFontSize(t, level);
  return {
    text: {
      fontSize: size,
      lineHeight: Math.round(size * 1.25),
      color: colors.text,
      // Headings are bold: the `bold` face of a face map, else `fontWeight`
      // (h3–h6 use '600').
      ...family(regularFamily(headingFamily)),
      ...fontStyleFor(
        headingFamily,
        { bold: true, italic: false },
        level <= 2 ? '700' : '600'
      ),
    },
    container: {
      marginTop: spacing.block * 1.5,
      marginBottom: spacing.block * 0.5,
    },
  };
}

function tokensOf(theme: ThemeTokens | Theme): ThemeTokens {
  if (!('elements' in theme)) return theme;
  const { colors, fonts, fontSize, lineHeight, spacing, radius, listBullets } =
    theme;
  return Object.freeze({
    colors,
    fonts,
    fontSize,
    lineHeight,
    spacing,
    radius,
    listBullets,
  });
}

/**
 * Resolves a theme into element styles with a single `StyleSheet.create`
 * call covering every element, heading level and variant.
 *
 * Merge order (docs/rewrite/phase-1/theme-resolution.md#merge-order), given
 * tokens that are already merged (base + user, see `createTheme`):
 * 3. element styles derived from the tokens;
 * 4. `pluginThemes`, in plugin order;
 * 5. the theme's own `elements` overrides.
 * Variants (`tightParagraph`, `nestedList`, `tableHeaderCell`, font
 * variants) derive from the merged elements, so an override of `Paragraph`
 * or `List` reaches them too. A `Heading` function is called once per level.
 */
export function resolveTheme(
  theme: ThemeTokens | Theme,
  pluginThemes: readonly ElementOverrides[] = []
): ResolvedTheme {
  const tokens = tokensOf(theme);
  const { fonts } = tokens;

  let overrides: ElementOverrides | undefined;
  for (const layer of pluginThemes) {
    overrides = mergeElements(overrides, layer);
  }
  overrides = mergeElements(
    overrides,
    'elements' in theme ? theme.elements : undefined
  );

  const derived = deriveElements(tokens);
  const merged = {} as Record<ElementName, StyleEntry>;
  for (const name of ELEMENT_NAMES) {
    merged[name] =
      name === 'Heading'
        ? derived.Heading
        : overlay(derived[name], overrides[name]);
  }

  const headingOverride = overrides.Heading;
  const headings = HEADING_LEVELS.map((level) =>
    overlay(
      deriveHeading(tokens, level),
      typeof headingOverride === 'function'
        ? headingOverride(level)
        : headingOverride
    )
  );

  // Variants, from the merged elements.
  const paragraph = merged.Paragraph;
  const tableCell = merged.TableCell;
  const tableHeaderCell: StyleEntry = {
    text: {
      ...tableCell.text,
      ...fontStyleFor(fonts.body, { bold: true, italic: false }, '600'),
    },
    container: tableCell.container,
  };
  const nestedList: StyleEntry = {
    container: { ...merged.List.container, marginBottom: 0 },
  };
  const tightParagraph: StyleEntry = {
    text: paragraph.text,
    container: { ...paragraph.container, marginBottom: 0 },
  };
  const footnoteSection: StyleEntry = {
    text: {
      fontSize: tokens.fontSize.base * 0.875,
      lineHeight: tokens.fontSize.base * 0.875 * tokens.lineHeight,
      color: tokens.colors.muted,
    },
    container: {
      marginTop: tokens.spacing.block,
      paddingTop: tokens.spacing.block,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.colors.border,
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
    for (let i = 0; i < FONT_STATE_COUNT; i++) {
      const parent = fontStateAt(i);
      variantEntries.Strong.push(
        overlay(
          { text: fontDelta(fonts, parent, { bold: true }) },
          overrides.Strong
        )
      );
      variantEntries.Emphasis.push(
        overlay(
          { text: fontDelta(fonts, parent, { italic: true }) },
          overrides.Emphasis
        )
      );
    }
  }

  // Flatten everything into one sheet: `${key}.text` / `${key}.container`.
  const flat: Record<string, TextStyle | ViewStyle> = {};
  const add = (key: string, entry: StyleEntry) => {
    flat[`${key}.text`] = entry.text ?? {};
    flat[`${key}.container`] = entry.container ?? {};
  };
  for (const name of ELEMENT_NAMES) add(name, merged[name]);
  headings.forEach((entry, i) => add(`h${i + 1}`, entry));
  add('tableHeaderCell', tableHeaderCell);
  add('nestedList', nestedList);
  add('tightParagraph', tightParagraph);
  add('footnoteSection', footnoteSection);
  variantEntries.Strong.forEach((e, i) => add(`Strong@${i}`, e));
  variantEntries.Emphasis.forEach((e, i) => add(`Emphasis@${i}`, e));

  const sheet = StyleSheet.create(flat);
  const pick = (key: string): ElementStyle =>
    Object.freeze({
      text: sheet[`${key}.text`] as TextStyle,
      container: sheet[`${key}.container`] as ViewStyle,
    });

  const elements = {} as Record<ElementName, ElementStyle>;
  for (const name of ELEMENT_NAMES) elements[name] = pick(name);

  const variants = (name: 'Strong' | 'Emphasis'): readonly ElementStyle[] => {
    if (!faceMode) {
      return Object.freeze(
        Array<ElementStyle>(FONT_STATE_COUNT).fill(elements[name])
      );
    }
    return Object.freeze(
      Array.from({ length: FONT_STATE_COUNT }, (_, i) => pick(`${name}@${i}`))
    );
  };

  return Object.freeze({
    tokens,
    elements: Object.freeze(elements),
    headings: Object.freeze([
      pick('h1'),
      pick('h2'),
      pick('h3'),
      pick('h4'),
      pick('h5'),
      pick('h6'),
    ] as const),
    fontVariants: Object.freeze({
      Strong: variants('Strong'),
      Emphasis: variants('Emphasis'),
    }),
    tableHeaderCell: pick('tableHeaderCell'),
    nestedList: pick('nestedList'),
    tightParagraph: pick('tightParagraph'),
    footnoteSection: pick('footnoteSection'),
  });
}

let defaultTheme: ResolvedTheme | null = null;

/**
 * The built-in light theme, resolved on first use and kept for the app's
 * lifetime.
 */
export function getDefaultTheme(): ResolvedTheme {
  defaultTheme ??= resolveTheme(lightTheme);
  return defaultTheme;
}
