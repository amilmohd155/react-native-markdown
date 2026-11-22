import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type TextStyle,
} from 'react-native';
import { useRenderContext } from '../render/contexts';
import { CodeBlock as DefaultCodeBlock } from '../render/defaults/block';
import {
  codeLayout,
  CodeRow,
  GutterFrame,
  useGutterWidth,
} from '../render/defaults/codeBlockLayout';
import {
  CodeBlockShell,
  useCodeBlockHeader,
  useCodeBlockWrap,
} from '../render/defaults/codeBlockShell';
import { codeLineCount, gutterText, rowText } from '../render/codeLines';
import { isDev } from '../render/devInline';
import type { ElementProps } from '../render/elements';
import type { ElementStyle } from '../theme';
import {
  blockRuns,
  createChunker,
  lineCountOf,
  lineRunsOf,
  runsOf,
  type Chunk,
  type Run,
} from './chunking';
import { normalizeTag, resolveTokenizer } from './languages';
import type { HighlightOptions, SyntaxTokenType, Tokenizer } from './types';

/**
 * The highlighted `CodeBlock` (P3-29 to P3-31). Spec:
 * docs/rewrite/phase-3/plugins.md#highlight
 *
 * Plain blocks (no tokenizer for the tag, or longer than `maxLength`) are
 * the core default `CodeBlock` itself. Highlighted ones keep its shell
 * (`CodeBlockShell`, with the same header: P3-35), horizontal ScrollView and
 * text props; the body is one accessible element labelled with the code, the
 * header outside it. Inside (P3-30):
 *
 * - A closed block of at most {@link SINGLE_TEXT_MAX_LENGTH} characters is
 *   one `Text` of colour spans whose text is the code exactly, so selection
 *   and copy cover the whole block, as on a plain block.
 * - A larger block, and any block while `open`, is one memoised `Text` per
 *   chunk of 2 lines, stacked in a column. Selection stays inside one chunk
 *   (Android). A small block swaps to one `Text` when it closes; only the
 *   children of the hidden View change.
 *
 * On native, a non-final chunk drops its last `\n` (the next Text starts
 * the next line). The chunker never ends a non-final chunk in a blank line,
 * so that Text's last line has glyphs: Android gives an empty last line
 * font-metrics height, not `lineHeight` (6 px short on the S25 FE), and that
 * does not scale linearly with the font scale. On web (`pre-wrap`) a
 * trailing `\n` draws no line, so chunks keep their text whole: selection
 * across chunks then yields the code exactly.
 *
 * Line numbers and wrap (P3-35, `codeLayout`): wrap drops the ScrollView
 * and keeps the same `Text`s. Numbers without wrap put a fixed gutter beside
 * the ScrollView: one gutter `Text` for the single code `Text`, else one per
 * chunk (mirrored, so each pair rounds alike). Numbers with wrap are one row
 * per line, from each chunk's {@link lineRunsOf}; a finished chunk's rows do
 * not re-render.
 *
 * Waived by name (P3-34): real VoiceOver and TalkBack passes on the labelled
 * container. Its structure was checked through the iOS accessibility tree.
 */

/**
 * Largest closed block, in characters, drawn as one `Text` (internal, not
 * an option). Tuned on the S25 FE: bench/results/REPORT.md.
 */
export const SINGLE_TEXT_MAX_LENGTH = 800;

/** `highlight()` options with defaults applied. */
export type NormalizedOptions = HighlightOptions & {
  readonly maxLength: number;
  /** Internal, for tests and benches: {@link SINGLE_TEXT_MAX_LENGTH}. */
  readonly singleTextMaxLength?: number;
};

type Props = ElementProps<'CodeBlock'>;
type ColorOf = (type: SyntaxTokenType) => ColorValue | undefined;

/** Characters of code quoted in the dev warning. */
const EXCERPT_LENGTH = 40;

/** A `CodeBlock` component bound to one `highlight()` call's options. */
export function createHighlightedCodeBlock(
  options: NormalizedOptions
): ComponentType<Props> {
  const singleTextMaxLength =
    options.singleTextMaxLength ?? SINGLE_TEXT_MAX_LENGTH;
  return function HighlightedCodeBlock(props: Props) {
    const { code, language } = props;
    const tokenizer = useMemo(
      () => resolveTokenizer(language, options),
      [language]
    );
    // Once over `maxLength`, stay plain for the block's lifetime (P3-31).
    const [tooLong, setTooLong] = useState(false);
    const over = tooLong || code.length > options.maxLength;
    if (over && !tooLong) setTooLong(true);
    if (tokenizer === null || over) return <DefaultCodeBlock {...props} />;
    return (
      <Highlighted
        {...props}
        tokenizer={tokenizer}
        tag={normalizeTag(language ?? '')}
        singleTextMaxLength={singleTextMaxLength}
      />
    );
  };
}

function Highlighted({
  code,
  language,
  meta,
  open,
  style,
  tokenizer,
  tag,
  singleTextMaxLength,
}: Props & {
  readonly tokenizer: Tokenizer;
  readonly tag: string;
  readonly singleTextMaxLength: number;
}) {
  const { theme, options } = useRenderContext();
  // One chunker per block; a new tag or tokenizer starts over.
  const chunker = useMemo(
    () => createChunker(tokenizer, tag),
    [tokenizer, tag]
  );
  // Incremental while open: frozen chunks keep their identity across
  // updates, colours may be approximate. Once closed (or mounted closed),
  // one full tokenize; unchanged chunks keep their identity (P3-30).
  const chunks = useMemo(
    () => (open ? chunker.update(code) : chunker.finish(code)),
    [chunker, code, open]
  );

  const syntax = theme.tokens.syntax;
  const base = style.text.color;
  // Stable per resolved theme, so `runsOf` hits its per-chunk cache. A type
  // drawn in the block colour (`plain` in the built-in themes) inherits it.
  const colorOf = useMemo<ColorOf>(
    () => (type) => {
      const color = syntax[type];
      return color === undefined || color === base ? undefined : color;
    },
    [syntax, base]
  );

  useInvalidWarning(chunks, tag);
  const { wrap, toggleWrap } = useCodeBlockWrap();
  const header = useCodeBlockHeader({
    code,
    language,
    meta,
    open,
    wrap,
    onToggleWrap: toggleWrap,
  });

  const layout = codeLayout({
    lineNumbers: options.codeBlock.lineNumbers,
    wrap,
  });
  const text: TextProps = {
    textStyle: style.text,
    selectable: options.selectable,
    maxFontSizeMultiplier: options.maxFontSizeMultiplier ?? undefined,
  };
  // Web keeps every chunk whole (see the module comment).
  const web = Platform.OS === 'web';
  // From the final length and `open` only (P3-30); rows are always per line
  // (P3-35).
  const single =
    !open && code.length <= singleTextMaxLength && layout !== 'rows';

  let body: ReactNode;
  if (layout === 'rows') {
    body = (
      <RowsBody
        chunks={chunks}
        colorOf={colorOf}
        web={web}
        gutterStyle={theme.codeBlockGutter}
        {...text}
      />
    );
  } else {
    const codeColumn = (
      <CodeColumn
        chunks={chunks}
        single={single}
        colorOf={colorOf}
        web={web}
        hidden={layout !== 'gutter'}
        {...text}
      />
    );
    body =
      layout === 'gutter' ? (
        <GutterBody
          chunks={chunks}
          code={single ? code : null}
          gutterStyle={theme.codeBlockGutter}
          maxFontSizeMultiplier={text.maxFontSizeMultiplier}
        >
          {codeColumn}
        </GutterBody>
      ) : layout === 'wrap' ? (
        codeColumn
      ) : (
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
        >
          {codeColumn}
        </ScrollView>
      );
  }

  return (
    <CodeBlockShell
      code={code}
      style={style.container}
      header={header}
      labelled
    >
      {body}
    </CodeBlockShell>
  );
}

type TextProps = {
  readonly textStyle: TextStyle;
  readonly selectable: boolean;
  readonly maxFontSizeMultiplier: number | undefined;
};

type ColumnProps = TextProps & {
  readonly chunks: readonly Chunk[];
  readonly single: boolean;
  readonly colorOf: ColorOf;
  readonly web: boolean;
  /** Hide from accessibility here (not inside the gutter frame, which does). */
  readonly hidden: boolean;
};

/**
 * The code as a column: one `Text` for a small closed block, else one
 * memoised `Text` per chunk.
 */
function CodeColumn({
  chunks,
  single,
  colorOf,
  web,
  hidden,
  ...text
}: ColumnProps) {
  const { textStyle, selectable, maxFontSizeMultiplier } = text;
  const lastIndex = chunks.length - 1;
  const children =
    chunks.length === 0 ? (
      <Text
        style={textStyle}
        selectable={selectable}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {''}
      </Text>
    ) : single ? (
      <BlockText chunks={chunks} colorOf={colorOf} {...text} />
    ) : (
      chunks.map((chunk, i) => (
        <ChunkText
          key={chunk.id}
          chunk={chunk}
          colorOf={colorOf}
          // The next chunk's Text starts the next line.
          trimNewline={!web && i < lastIndex}
          {...text}
        />
      ))
    );
  return hidden ? (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {children}
    </View>
  ) : (
    <View>{children}</View>
  );
}

const gutterCache = new WeakMap<
  Chunk,
  { readonly firstLine: number; readonly text: string }
>();

/** A chunk's gutter text (its line numbers), cached per chunk object. */
function chunkGutterText(chunk: Chunk, firstLine: number): string {
  const cached = gutterCache.get(chunk);
  if (cached !== undefined && cached.firstLine === firstLine) {
    return cached.text;
  }
  const text = gutterText({
    text: chunk.text,
    firstLine,
    lineCount: lineCountOf(chunk),
  });
  gutterCache.set(chunk, { firstLine, text });
  return text;
}

/**
 * The gutter of the single code `Text`: its numbers, one per line, plus a
 * bare `\n` when the code ends in one, so it draws as many lines as the code
 * `Text` (native draws an empty last line after a final `\n`, web draws none
 * in both). An empty block shows line 1.
 */
function singleGutterText(code: string): string {
  const lineCount = Math.max(1, codeLineCount(code));
  const numbers = gutterText({ text: code, firstLine: 1, lineCount });
  return code.endsWith('\n') ? `${numbers}\n` : numbers;
}

/**
 * Numbers without wrap: the code scrolls beside a fixed gutter. With `code`
 * (the single code `Text`) the gutter is one `Text` for the whole block;
 * else it mirrors the chunks, one gutter `Text` per chunk with that chunk's
 * numbers, so each pair pixel-rounds alike (iOS) and they never drift apart.
 * The frame stays mounted when a block swaps between the two at close.
 */
function GutterBody({
  chunks,
  code,
  gutterStyle,
  maxFontSizeMultiplier,
  children,
}: {
  readonly chunks: readonly Chunk[];
  /** The code when drawn as one `Text`, else `null`. */
  readonly code: string | null;
  readonly gutterStyle: ElementStyle;
  readonly maxFontSizeMultiplier: number | undefined;
  readonly children: ReactNode;
}) {
  const texts: string[] = [];
  let firstLine = 1;
  for (const chunk of chunks) {
    if (code === null) texts.push(chunkGutterText(chunk, firstLine));
    firstLine += lineCountOf(chunk);
  }
  if (code !== null) texts.push(singleGutterText(code));
  // An empty block still shows line 1, as the default block does.
  else if (texts.length === 0) texts.push('1');
  const width = useGutterWidth(
    gutterStyle,
    Math.max(1, firstLine - 1),
    maxFontSizeMultiplier
  );
  return (
    <GutterFrame
      texts={texts}
      style={gutterStyle}
      width={width}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {children}
    </GutterFrame>
  );
}

type RowsProps = TextProps & {
  readonly chunks: readonly Chunk[];
  readonly colorOf: ColorOf;
  readonly web: boolean;
  readonly gutterStyle: ElementStyle;
};

/**
 * Numbers with wrap: one {@link CodeRow} per line, grouped per chunk so a
 * finished chunk's rows do not re-render while the block streams.
 */
function RowsBody({ chunks, gutterStyle, ...rest }: RowsProps) {
  const { maxFontSizeMultiplier } = rest;
  let lines = 0;
  for (const chunk of chunks) lines += lineCountOf(chunk);
  const width = useGutterWidth(
    gutterStyle,
    Math.max(1, lines),
    maxFontSizeMultiplier
  );
  let firstLine = 1;
  const groups = chunks.map((chunk) => {
    const group = (
      <ChunkRows
        key={chunk.id}
        chunk={chunk}
        firstLine={firstLine}
        gutterStyle={gutterStyle}
        gutterWidth={width}
        {...rest}
      />
    );
    firstLine += lineCountOf(chunk);
    return group;
  });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {chunks.length === 0 ? (
        // An empty block shows line 1, as the default block does.
        <CodeRow
          number={1}
          gutterStyle={gutterStyle}
          gutterWidth={width}
          textStyle={rest.textStyle}
          selectable={rest.selectable}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {rowText('', false, rest.web)}
        </CodeRow>
      ) : (
        groups
      )}
    </View>
  );
}

type ChunkRowsProps = Omit<RowsProps, 'chunks'> & {
  readonly chunk: Chunk;
  readonly firstLine: number;
  readonly gutterWidth: number;
};

/**
 * The rows of one chunk, from its per-line runs ({@link lineRunsOf}).
 * Shallow-memoised like {@link ChunkText}: a frozen chunk renders once.
 */
const ChunkRows = memo(function HighlightedRows({
  chunk,
  firstLine,
  colorOf,
  web,
  gutterStyle,
  gutterWidth,
  textStyle,
  selectable,
  maxFontSizeMultiplier,
}: ChunkRowsProps) {
  const lines = lineRunsOf(chunk, colorOf);
  // The last line has a `\n` after it only when the chunk ends in one.
  const newlineAtEnd = chunk.text.endsWith('\n');
  const last = lines.length - 1;
  return lines.map((runs, i) => {
    const newline = i < last || newlineAtEnd;
    let children: ReactNode;
    if (runs.length === 0) {
      children = rowText('', newline, web);
    } else {
      const spans = spansOf(runs, colorOf);
      // Web rows keep their `\n`, so they concatenate to the code.
      if (web && newline) spans.push('\n');
      children = spans;
    }
    return (
      <CodeRow
        key={i}
        number={firstLine + i}
        gutterStyle={gutterStyle}
        gutterWidth={gutterWidth}
        textStyle={textStyle}
        selectable={selectable}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {children}
      </CodeRow>
    );
  });
});

type BlockProps = {
  readonly chunks: readonly Chunk[];
  readonly colorOf: ColorOf;
  readonly textStyle: TextStyle;
  readonly selectable: boolean;
  readonly maxFontSizeMultiplier: number | undefined;
};

/**
 * A small closed block: one `Text` whose text is the code exactly (no
 * trimmed newline: it lays out as the plain block does).
 */
const BlockText = memo(function HighlightedBlock({
  chunks,
  colorOf,
  textStyle,
  selectable,
  maxFontSizeMultiplier,
}: BlockProps) {
  return (
    <Text
      style={textStyle}
      selectable={selectable}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {spansOf(blockRuns(chunks, colorOf), colorOf)}
    </Text>
  );
});

/** Children for a Text: a bare string for an inherited colour, else a span. */
function spansOf(runs: readonly Run[], colorOf: ColorOf): ReactNode[] {
  const children: ReactNode[] = [];
  for (let i = 0; i < runs.length; i++) {
    const { text, type } = runs[i]!;
    if (text === '') continue;
    const color = colorOf(type);
    children.push(
      color === undefined ? (
        text
      ) : (
        <Text key={i} style={colorStyle(color)}>
          {text}
        </Text>
      )
    );
  }
  return children;
}

type ChunkProps = {
  readonly chunk: Chunk;
  readonly colorOf: ColorOf;
  readonly trimNewline: boolean;
  readonly textStyle: TextStyle;
  readonly selectable: boolean;
  readonly maxFontSizeMultiplier: number | undefined;
};

/**
 * One chunk: a `Text` of colour runs. Shallow-memoised: a frozen chunk keeps
 * its object, so it renders once while the block streams.
 */
const ChunkText = memo(function HighlightedChunk({
  chunk,
  colorOf,
  trimNewline,
  textStyle,
  selectable,
  maxFontSizeMultiplier,
}: ChunkProps) {
  let runs = runsOf(chunk, colorOf);
  const lastRun = runs[runs.length - 1];
  if (trimNewline && lastRun !== undefined && lastRun.text.endsWith('\n')) {
    const trimmed = { ...lastRun, text: lastRun.text.slice(0, -1) };
    runs = [...runs.slice(0, -1), trimmed];
  }
  return (
    <Text
      style={textStyle}
      selectable={selectable}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {spansOf(runs, colorOf)}
    </Text>
  );
});

// One style object per colour, shared by every span.
const colorStyles = new Map<ColorValue, TextStyle>();
function colorStyle(color: ColorValue): TextStyle {
  let s = colorStyles.get(color);
  if (s === undefined) {
    s = StyleSheet.create({ s: { color } }).s;
    colorStyles.set(color, s);
  }
  return s;
}

/**
 * Dev only: warns once per block when the tokenizer threw or (the check is
 * dev-only) its tokens did not join to the code; those chunks render plain.
 */
function useInvalidWarning(chunks: readonly Chunk[], tag: string) {
  const warned = useRef(false);
  useEffect(() => {
    if (warned.current || !isDev()) return;
    const bad = chunks.find((c) => c.invalid);
    if (bad === undefined) return;
    warned.current = true;
    const excerpt =
      bad.text.length > EXCERPT_LENGTH
        ? `${bad.text.slice(0, EXCERPT_LENGTH)}…`
        : bad.text;
    console.warn(
      `[react-native-markdown] highlight: the tokenizer for "${tag}" threw ` +
        'or returned tokens that do not join to the code, so part of the ' +
        `block renders plain. Near: ${JSON.stringify(excerpt)}`
    );
  }, [chunks, tag]);
}
