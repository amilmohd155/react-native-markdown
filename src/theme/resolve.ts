import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { lightTokens } from './tokens';
import {
  ELEMENT_NAMES,
  type ElementName,
  type ElementStyle,
  type ResolvedTheme,
  type ThemeTokens,
} from './types';

type StyleEntry = { text?: TextStyle; container?: ViewStyle };
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

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

/**
 * Derived element styles for the given tokens.
 * Spec: docs/rewrite/phase-1/theme-resolution.md#derived-element-styles
 *
 * Inline styles carry only what they change, so nested `<Text>` inherits
 * the rest (a `Strong` inside a `Heading` keeps the heading's size).
 */
function deriveStyles(t: ThemeTokens) {
  const { colors, fonts, fontSize, spacing } = t;
  const base = fontSize.base;

  const blockText: TextStyle = {
    fontSize: base,
    lineHeight: base * t.lineHeight,
    color: colors.text,
    ...family(fonts.body),
  };
  const monoInline: TextStyle = {
    fontFamily: fonts.mono,
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

  const elements: Record<ElementName, StyleEntry> = {
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
        fontFamily: fonts.mono,
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
      text: { ...blockText, fontFamily: fonts.mono, color: colors.muted },
      container: { marginBottom: spacing.block },
    },
    FootnoteDefinition: {
      text: { ...blockText, fontSize: base * 0.875 },
      container: { flexDirection: 'row' },
    },
    Strong: { text: { fontWeight: '700' } },
    Emphasis: { text: { fontStyle: 'italic' } },
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

  const headings = HEADING_LEVELS.map(
    (level): StyleEntry => ({
      text: {
        fontSize: headingFontSize(t, level),
        lineHeight: Math.round(headingFontSize(t, level) * 1.25),
        fontWeight: level <= 2 ? '700' : '600',
        color: colors.text,
        ...family(fonts.heading ?? fonts.body),
      },
      container: {
        marginTop: spacing.block * 1.5,
        marginBottom: spacing.block * 0.5,
      },
    })
  );

  const tableHeaderCell: StyleEntry = {
    text: { ...blockText, fontWeight: '600' },
    container: cellContainer,
  };
  const nestedList: StyleEntry = {
    container: { paddingLeft: 0, marginBottom: 0 },
  };
  const tightParagraph: StyleEntry = {
    text: blockText,
    container: { marginBottom: 0 },
  };

  return { elements, headings, tableHeaderCell, nestedList, tightParagraph };
}

/**
 * Resolves tokens into element styles with a single `StyleSheet.create`
 * call covering every element, heading level and variant.
 */
export function resolveTheme(tokens: ThemeTokens): ResolvedTheme {
  const derived = deriveStyles(tokens);

  // Flatten everything into one sheet: `${key}.text` / `${key}.container`.
  const flat: Record<string, TextStyle | ViewStyle> = {};
  const add = (key: string, entry: StyleEntry) => {
    flat[`${key}.text`] = entry.text ?? {};
    flat[`${key}.container`] = entry.container ?? {};
  };
  for (const name of ELEMENT_NAMES) add(name, derived.elements[name]);
  derived.headings.forEach((entry, i) => add(`h${i + 1}`, entry));
  add('tableHeaderCell', derived.tableHeaderCell);
  add('nestedList', derived.nestedList);
  add('tightParagraph', derived.tightParagraph);

  const sheet = StyleSheet.create(flat);
  const pick = (key: string): ElementStyle =>
    Object.freeze({
      text: sheet[`${key}.text`] as TextStyle,
      container: sheet[`${key}.container`] as ViewStyle,
    });

  const elements = {} as Record<ElementName, ElementStyle>;
  for (const name of ELEMENT_NAMES) elements[name] = pick(name);

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
    tableHeaderCell: pick('tableHeaderCell'),
    nestedList: pick('nestedList'),
    tightParagraph: pick('tightParagraph'),
  });
}

let defaultTheme: ResolvedTheme | null = null;

/**
 * The built-in light theme, resolved on first use and kept for the app's
 * lifetime.
 */
export function getDefaultTheme(): ResolvedTheme {
  defaultTheme ??= resolveTheme(lightTokens);
  return defaultTheme;
}
