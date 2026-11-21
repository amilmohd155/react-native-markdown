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
import { isDev } from '../render/devInline';
import type { ElementProps } from '../render/elements';
import {
  blockRuns,
  createChunker,
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
 * the core default `CodeBlock` itself. Highlighted ones keep its container,
 * horizontal ScrollView and text props, and the container is one accessible
 * element labelled with the code. Inside (P3-30):
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

  const textStyle = style.text;
  const selectable = options.selectable;
  const maxFontSizeMultiplier = options.maxFontSizeMultiplier ?? undefined;
  const lastIndex = chunks.length - 1;
  // Web keeps every chunk whole (see the module comment).
  const native = Platform.OS !== 'web';
  const single = !open && code.length <= singleTextMaxLength;

  return (
    <View style={style.container} accessible accessibilityLabel={code}>
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
      >
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {chunks.length === 0 ? (
            <Text
              style={textStyle}
              selectable={selectable}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {''}
            </Text>
          ) : single ? (
            <BlockText
              chunks={chunks}
              colorOf={colorOf}
              textStyle={textStyle}
              selectable={selectable}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            />
          ) : (
            chunks.map((chunk, i) => (
              <ChunkText
                key={chunk.id}
                chunk={chunk}
                colorOf={colorOf}
                // The next chunk's Text starts the next line.
                trimNewline={native && i < lastIndex}
                textStyle={textStyle}
                selectable={selectable}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

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
