import { memo, useMemo, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native';
import type { ElementStyle } from '../../theme';
import {
  codeLineCount,
  codeLines,
  rowText,
  singleGutterText,
} from '../codeLines';

/**
 * Line number and wrap layouts of a code block (P3-35), shared by the
 * default and the highlighted `CodeBlock`. Pure JS, internal: never exported
 * through the public API.
 *
 * | mode     | numbers | wrap | body                                        |
 * |----------|---------|------|---------------------------------------------|
 * | `scroll` | off     | off  | horizontal `ScrollView` + code (today's)    |
 * | `wrap`   | off     | on   | code that wraps to the container            |
 * | `gutter` | on      | off  | fixed gutter column beside the `ScrollView` |
 * | `rows`   | on      | on   | one row per line: gutter + wrapping code    |
 *
 * A gutter `Text` beside one code `Text` aligns only while no line wraps,
 * so wrap with numbers takes rows (the spike's A3 misaligned everywhere).
 */
export type CodeLayout = 'scroll' | 'wrap' | 'gutter' | 'rows';

/** The layout mode for the line number and wrap settings. */
export function codeLayout({
  lineNumbers,
  wrap,
}: {
  readonly lineNumbers: boolean;
  readonly wrap: boolean;
}): CodeLayout {
  if (lineNumbers) return wrap ? 'rows' : 'gutter';
  return wrap ? 'wrap' : 'scroll';
}

/** Space between the gutter's separator and the code. */
const GUTTER_GAP = 8;

/** Advance of one monospace digit, as a fraction of the font size (with margin). */
const DIGIT_WIDTH = 0.62;

/** Default code font size when the gutter style sets none. */
const FALLBACK_FONT_SIZE = 14;

/**
 * Least width of a gutter `Text`, from the digit count of the last line
 * number (so it does not jump while a block streams), the font scale (capped
 * by `maxFontSizeMultiplier`) and the gutter text's right padding.
 */
export function useGutterWidth(
  style: ElementStyle,
  lastLine: number,
  maxFontSizeMultiplier: number | undefined
): number {
  const { fontScale } = useWindowDimensions();
  const { fontSize, paddingRight, paddingHorizontal, padding } = style.text;
  const scale =
    maxFontSizeMultiplier !== undefined && maxFontSizeMultiplier >= 1
      ? Math.min(fontScale, maxFontSizeMultiplier)
      : fontScale;
  const digits = String(Math.max(1, lastLine)).length;
  const pad = paddingRight ?? paddingHorizontal ?? padding;
  return (
    Math.ceil(digits * (fontSize ?? FALLBACK_FONT_SIZE) * scale * DIGIT_WIDTH) +
    (typeof pad === 'number' ? pad : 0)
  );
}

interface CodeGutterProps {
  /** One gutter `Text` per entry: the whole gutter, or one per chunk. */
  readonly texts: readonly string[];
  /** The theme's `codeBlockGutter`. */
  readonly style: ElementStyle;
  /** From {@link useGutterWidth}. */
  readonly width: number;
  readonly maxFontSizeMultiplier: number | undefined;
}

/**
 * The line number column: the gutter container (its separator) holding one
 * `Text` per entry. Never selectable, hidden from accessibility and from
 * touches, so numbers are never read out, selected or copied. `aria-hidden`
 * hides it on web, where react-native-web 0.21 ignores the native props.
 */
export function CodeGutter({
  texts,
  style,
  width,
  maxFontSizeMultiplier,
}: CodeGutterProps) {
  const textStyle = useMemo<TextStyle[]>(
    () => [style.text, { minWidth: width }],
    [style.text, width]
  );
  return (
    <View
      style={[style.container, styles.gutter]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {texts.map((text, i) => (
        <GutterText
          key={i}
          text={text}
          style={textStyle}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        />
      ))}
    </View>
  );
}

/**
 * One gutter `Text`, memoised: an unchanged entry (a finished chunk's
 * numbers while a block streams) does not re-render.
 */
const GutterText = memo(function GutterTextView({
  text,
  style,
  maxFontSizeMultiplier,
}: {
  readonly text: string;
  readonly style: TextStyle[];
  readonly maxFontSizeMultiplier: number | undefined;
}) {
  return (
    <Text
      style={style}
      selectable={false}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {text}
    </Text>
  );
});

interface GutterFrameProps extends CodeGutterProps {
  /** The code column: scrolls sideways beside the fixed gutter. */
  readonly children: ReactNode;
}

/**
 * The `gutter` layout's frame: a hidden row of the fixed {@link CodeGutter}
 * and a horizontal `ScrollView` holding `children`. Shared by the default
 * block (one code `Text`) and the highlighted one (its chunks).
 */
export function GutterFrame({ children, ...gutter }: GutterFrameProps) {
  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <CodeGutter {...gutter} />
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={styles.fill}
        contentContainerStyle={styles.gap}
      >
        {children}
      </ScrollView>
    </View>
  );
}

interface CodeRowProps {
  /** The row's 1-based line number. */
  readonly number: number;
  readonly gutterStyle: ElementStyle;
  readonly gutterWidth: number;
  /** The code text style (`CodeBlock.text`). */
  readonly textStyle: TextStyle;
  readonly selectable: boolean;
  readonly maxFontSizeMultiplier: number | undefined;
  /** The line's code: {@link rowText} or its spans. */
  readonly children: ReactNode;
}

/**
 * One line of the `rows` layout: its number beside a code `Text` that wraps
 * to the rest of the width. A wrapped line keeps its number on its first
 * visual line.
 */
export const CodeRow = memo(function CodeRowView({
  number,
  gutterStyle,
  gutterWidth,
  textStyle,
  selectable,
  maxFontSizeMultiplier,
  children,
}: CodeRowProps) {
  return (
    <View style={styles.row}>
      <CodeGutter
        texts={[String(number)]}
        style={gutterStyle}
        width={gutterWidth}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      />
      <Text
        style={[textStyle, styles.rowCode]}
        selectable={selectable}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {children}
      </Text>
    </View>
  );
});

export interface PlainCodeBodyProps {
  readonly code: string;
  readonly layout: CodeLayout;
  /** The code text style (`CodeBlock.text`). */
  readonly textStyle: TextStyle;
  readonly gutterStyle: ElementStyle;
  readonly selectable: boolean;
  readonly maxFontSizeMultiplier: number | undefined;
}

/**
 * The body of the default (plain) code block for a {@link CodeLayout}. A
 * plain block has no colour spans, so the `gutter` mode keeps one code
 * `Text` (spike A2) at any size. In the numbered modes everything is hidden
 * from accessibility: the shell's labelled body reads the code.
 */
export function PlainCodeBody({ layout, ...props }: PlainCodeBodyProps) {
  switch (layout) {
    case 'scroll':
      return (
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
        >
          <CodeText {...props} />
        </ScrollView>
      );
    case 'wrap':
      return <CodeText {...props} />;
    case 'gutter':
      return <GutterBody {...props} />;
    case 'rows':
      return <RowsBody {...props} />;
  }
}

type BodyProps = Omit<PlainCodeBodyProps, 'layout'>;

function CodeText({
  code,
  textStyle,
  selectable,
  maxFontSizeMultiplier,
}: BodyProps) {
  return (
    <Text
      style={textStyle}
      selectable={selectable}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {code}
    </Text>
  );
}

/** Numbers without wrap: the gutter column stays put, the code scrolls. */
function GutterBody(props: BodyProps) {
  const { code, gutterStyle, maxFontSizeMultiplier } = props;
  const lastLine = Math.max(1, codeLineCount(code));
  const width = useGutterWidth(gutterStyle, lastLine, maxFontSizeMultiplier);
  const texts = useMemo(() => [singleGutterText(code)], [code]);
  return (
    <GutterFrame
      texts={texts}
      style={gutterStyle}
      width={width}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      <CodeText {...props} />
    </GutterFrame>
  );
}

/** Numbers with wrap: one row per line (an empty block shows line 1). */
function RowsBody({
  code,
  textStyle,
  gutterStyle,
  selectable,
  maxFontSizeMultiplier,
}: BodyProps) {
  const web = Platform.OS === 'web';
  const lines = useMemo(() => {
    const all = codeLines(code);
    return all.length === 0 ? [''] : all;
  }, [code]);
  const width = useGutterWidth(
    gutterStyle,
    lines.length,
    maxFontSizeMultiplier
  );
  const newlineAtEnd = code.endsWith('\n');
  const last = lines.length - 1;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {lines.map((line, i) => (
        <CodeRow
          key={i}
          number={i + 1}
          gutterStyle={gutterStyle}
          gutterWidth={width}
          textStyle={textStyle}
          selectable={selectable}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {rowText(line, i < last || newlineAtEnd, web)}
        </CodeRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { pointerEvents: 'none' },
  row: { flexDirection: 'row' },
  rowCode: { flex: 1, paddingLeft: GUTTER_GAP },
  fill: { flex: 1 },
  gap: { paddingLeft: GUTTER_GAP },
});
