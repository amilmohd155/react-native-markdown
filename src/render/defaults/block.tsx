import {
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  Animated,
  Image as RNImage,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import type { ElementStyle } from '../../theme';
import {
  InheritedTextContext,
  ListGapContext,
  ListMarkerContext,
  TextResetContext,
  TableKeyContext,
  TableLayoutContext,
  useRenderContext,
  type TableLayout,
} from '../contexts';
import { checkboxHitSlop } from '../checkbox';
import { codeLayout, PlainCodeBody } from './codeBlockLayout';
import {
  CodeBlockShell,
  useCodeBlockHeader,
  useCodeBlockWrap,
} from './codeBlockShell';
import type { ElementProps } from '../elements';
import { useImageSize } from '../imageSize';
import { useTaskState } from '../useTaskState';
import { useFootnoteFlash } from '../useFootnoteFlash';
import {
  cachedColumnWidths,
  columnWidths,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  storeColumnWidths,
} from '../tableLayout';

/**
 * Default block elements. Spec: docs/rewrite/03-architecture.md#default-elements
 *
 * Text blocks (Heading, Paragraph, HtmlBlock) are a single <Text> with the
 * container style applied to it directly: one native view per block.
 */

/** Text props shared by block text: style cascade and text options. */
function useBlockText(style: ElementStyle, extra?: StyleProp<TextStyle>) {
  const { options } = useRenderContext();
  const inherited = useContext(InheritedTextContext);
  return {
    style: [style.container, style.text, inherited, extra],
    selectable: options.selectable,
    maxFontSizeMultiplier: options.maxFontSizeMultiplier ?? undefined,
  };
}

export function Heading({ style, children }: ElementProps<'Heading'>) {
  return (
    <Text accessibilityRole="header" {...useBlockText(style)}>
      {children}
    </Text>
  );
}

export function Paragraph({ style, children }: ElementProps<'Paragraph'>) {
  return <Text {...useBlockText(style)}>{children}</Text>;
}

export function Blockquote({ style, children }: ElementProps<'Blockquote'>) {
  return (
    <View style={style.container}>
      {/* Replaces the inherited text style, so a checked item's reset (for
          sub-lists) no longer applies: a list in here keeps this style. */}
      <TextResetContext.Provider value={undefined}>
        <InheritedTextContext.Provider value={style.text}>
          {children}
        </InheritedTextContext.Provider>
      </TextResetContext.Provider>
    </View>
  );
}

export function List({ style, children }: ElementProps<'List'>) {
  return <View style={style.container}>{children}</View>;
}

/** Task checkbox glyphs, forced to text presentation (U+FE0E), never emoji. */
const CHECKED = '☑\uFE0E';
const UNCHECKED = '☐\uFE0E';

/** Space between the marker column and the item content. */
const MARKER_GAP = 6;

export function ListItem({
  ordered,
  marker,
  checked,
  taskIndex,
  text,
  style,
  children,
}: ElementProps<'ListItem'>) {
  const { theme } = useRenderContext();
  const task = useTaskState(taskIndex, checked, text);
  const markerChars = useContext(ListMarkerContext);
  const gap = useContext(ListGapContext);
  const inherited = useContext(InheritedTextContext);

  // Same width for every item of the list, from its longest marker, so
  // "9." and "10." stay aligned (right-aligned when ordered).
  const { fontSize, spacing } = theme.tokens;
  const width = Math.max(
    spacing.listIndent,
    Math.ceil(markerChars * fontSize.base * 0.6) + MARKER_GAP
  );

  const { checkbox } = theme.tokens;
  const shown = task.checked;

  // A checked item's own text, never its sub-lists' (`InheritedTextReset`).
  const checkedText = useMemo(
    () =>
      shown && checkbox.checkedText !== false
        ? { ...inherited, ...checkbox.checkedText }
        : null,
    [shown, checkbox.checkedText, inherited]
  );

  let markerNode;
  if (checked === null) {
    markerNode = (
      <Text
        style={[style.text, inherited, ordered && styles.markerOrdered]}
        accessible={false}
      >
        {marker}
      </Text>
    );
  } else {
    // The glyph is the visual; the Pressable is the touch target. Its
    // box is the glyph by one line, so `hitSlop` tops it up (44pt wide,
    // as tall as the gap to the next item allows: see `checkboxHitSlop`)
    // without moving the first-line alignment with the item text.
    const glyphSize = checkbox.size ?? style.text.fontSize ?? fontSize.base;
    const lineHeight =
      style.text.lineHeight ?? glyphSize * theme.tokens.lineHeight;
    const color = shown
      ? (checkbox.checkedColor ?? checkbox.color)
      : checkbox.color;
    markerNode = (
      <Pressable
        style={styles.checkbox}
        accessibilityRole="checkbox"
        accessibilityLabel={text ? text : undefined}
        accessibilityState={{ checked: shown, disabled: !task.interactive }}
        disabled={!task.interactive}
        onPress={task.interactive ? task.toggle : undefined}
        hitSlop={checkboxHitSlop(glyphSize, lineHeight, gap, width)}
      >
        <Text
          style={[
            style.text,
            inherited,
            checkbox.size !== undefined && { fontSize: checkbox.size },
            color !== undefined && { color },
          ]}
          accessible={false}
        >
          {shown ? CHECKED : UNCHECKED}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={style.container}>
      <View style={[styles.markerColumn, { width }]}>{markerNode}</View>
      <View style={styles.content}>
        {checkedText === null ? (
          children
        ) : (
          <TextResetContext.Provider value={inherited}>
            <InheritedTextContext.Provider value={checkedText}>
              {children}
            </InheritedTextContext.Provider>
          </TextResetContext.Provider>
        )}
      </View>
    </View>
  );
}

export function CodeBlock({
  code,
  language,
  meta,
  open,
  style,
}: ElementProps<'CodeBlock'>) {
  const { options, theme } = useRenderContext();
  const { wrap, toggleWrap } = useCodeBlockWrap();
  const header = useCodeBlockHeader({
    code,
    language,
    meta,
    open,
    wrap,
    onToggleWrap: toggleWrap,
  });
  const { lineNumbers } = options.codeBlock;
  return (
    <CodeBlockShell
      code={code}
      style={style.container}
      header={header}
      // Numbered bodies are hidden from accessibility: the label reads them.
      labelled={lineNumbers}
    >
      <PlainCodeBody
        code={code}
        layout={codeLayout({ lineNumbers, wrap })}
        textStyle={style.text}
        gutterStyle={theme.codeBlockGutter}
        selectable={options.selectable}
        maxFontSizeMultiplier={options.maxFontSizeMultiplier ?? undefined}
      />
    </CodeBlockShell>
  );
}

export function Divider({ style }: ElementProps<'Divider'>) {
  return <View style={style.container} />;
}

export function HtmlBlock({ html, style }: ElementProps<'HtmlBlock'>) {
  return (
    <Text {...useBlockText(style)}>
      {html.endsWith('\n') ? html.slice(0, -1) : html}
    </Text>
  );
}

/**
 * Block image at full width (never wider than its natural size), with its
 * real aspect ratio from the size cache. While the size is unknown, a quiet
 * placeholder box (theme `imageRatio`, `codeBg` fill) reserves the space, so
 * an image of that ratio never moves what is below it. Images
 * that fail to load show their alt text instead.
 */
export function Image({ src, alt, title, style }: ElementProps<'Image'>) {
  const { theme, handlers, options } = useRenderContext();
  const size = useImageSize(src);
  const { colors } = theme.tokens;

  if (size === 'error') {
    return (
      <View
        style={[
          style.container,
          styles.imageFallback,
          { backgroundColor: colors.codeBg, borderColor: colors.border },
        ]}
        accessibilityRole="image"
        accessibilityLabel={alt}
      >
        <Text style={{ color: colors.muted }}>{alt === '' ? src : alt}</Text>
      </View>
    );
  }

  const image = (
    <RNImage
      source={{ uri: src }}
      accessibilityLabel={alt}
      accessibilityHint={title ?? undefined}
      resizeMode="contain"
      style={[
        styles.blockImage,
        size === null
          ? {
              aspectRatio: theme.tokens.imageRatio,
              backgroundColor: colors.codeBg,
              borderRadius: theme.tokens.radius.code,
            }
          : { aspectRatio: size.width / size.height },
      ]}
    />
  );

  // The frame caps the width at the natural size; the image fills the
  // frame. (Yoga derives an aspect-ratio height from `width` before
  // applying `maxWidth`, so both can't sit on the image itself.)
  return (
    <View style={style.container}>
      <View
        style={[
          styles.imageFrame,
          size === null ? undefined : { maxWidth: size.width },
        ]}
      >
        {options.interactiveImages ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={alt}
            onPress={() => handlers.current.onImagePress?.(src, { alt, title })}
          >
            {image}
          </Pressable>
        ) : (
          image
        )}
      </View>
    </View>
  );
}

/**
 * Table in a horizontal ScrollView, with fixed column widths: on first
 * render every cell reports its natural width (capped), then each column
 * takes its widest cell. The result is cached per table content and theme,
 * so re-renders and remounts skip the measuring pass.
 */
export function Table({ style, children }: ElementProps<'Table'>) {
  const { theme } = useRenderContext();
  const key = useContext(TableKeyContext);
  const [state, setState] = useState(() => ({
    theme,
    widths: cachedColumnWidths(theme, key),
  }));
  let widths = state.widths;
  if (state.theme !== theme) {
    // New fonts or sizes: use that theme's cached widths, or re-measure.
    widths = cachedColumnWidths(theme, key);
    setState({ theme, widths });
  }

  // One measuring pass per layout object: a new theme or table makes a new
  // one, which starts again with no measurements.
  const layout = useMemo<TableLayout>(() => {
    const pass = { measured: [] as number[], scheduled: false };
    return {
      widths,
      report(column, width) {
        if (widths !== null) return;
        pass.measured[column] = Math.max(pass.measured[column] ?? 0, width);
        if (pass.scheduled) return;
        // Cells lay out in the same frame; collect them all, then commit.
        pass.scheduled = true;
        requestAnimationFrame(() => {
          const final = columnWidths(pass.measured);
          storeColumnWidths(theme, key, final);
          setState({ theme, widths: final });
        });
      },
    };
  }, [widths, theme, key]);

  return (
    <ScrollView
      horizontal
      bounces={false}
      style={style.container}
      showsHorizontalScrollIndicator={false}
    >
      {/* Hidden while measuring, so unaligned columns never show. */}
      <View style={widths === null ? styles.measuring : undefined}>
        <TableLayoutContext.Provider value={layout}>
          {children}
        </TableLayoutContext.Provider>
      </View>
    </ScrollView>
  );
}

export function TableRow({ style, children }: ElementProps<'TableRow'>) {
  return <View style={style.container}>{children}</View>;
}

const CELL_ALIGN = {
  left: undefined,
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
} as const;

export function TableCell({
  align,
  column,
  style,
  children,
}: ElementProps<'TableCell'>) {
  const { options } = useRenderContext();
  const layout = useContext(TableLayoutContext);
  const width = layout?.widths?.[column];
  const measuring = layout !== null && layout.widths === null;

  return (
    <View
      style={[
        style.container,
        width === undefined ? styles.cellMeasure : { width },
      ]}
      onLayout={
        measuring
          ? (event) => layout.report(column, event.nativeEvent.layout.width)
          : undefined
      }
    >
      <Text
        style={[style.text, align === null ? undefined : CELL_ALIGN[align]]}
        selectable={options.selectable}
        maxFontSizeMultiplier={options.maxFontSizeMultiplier ?? undefined}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * One footnote: its number and its content. The back-links are inline
 * `FootnoteBackLink` elements at the end of the content (P3-13).
 */
export function FootnoteDefinition({
  label,
  index,
  style,
  children,
}: ElementProps<'FootnoteDefinition'>) {
  const inherited = useContext(InheritedTextContext);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const flash = useFootnoteFlash(`d:${label}`, ref);
  const parts = (
    <>
      <Text style={[inherited, style.text, styles.footnoteLabel]}>
        {`${index}.`}
      </Text>
      <View style={styles.content}>{children}</View>
    </>
  );
  // Animated components force `collapsable={false}`: use one only while flashing.
  if (flash.style) {
    return (
      <Animated.View
        ref={ref}
        style={[style.container, flash.style]}
        accessible={flash.focused ? true : undefined}
      >
        {parts}
      </Animated.View>
    );
  }
  return (
    <View
      ref={ref}
      style={style.container}
      accessible={flash.focused ? true : undefined}
    >
      {parts}
    </View>
  );
}

const styles = StyleSheet.create({
  markerColumn: { paddingRight: MARKER_GAP },
  markerOrdered: { textAlign: 'right' },
  checkbox: { alignSelf: 'flex-start' },
  content: { flex: 1, minWidth: 0 },
  imageFrame: { width: '100%' },
  blockImage: { width: '100%' },
  imageFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 12,
  },
  measuring: { opacity: 0 },
  cellMeasure: { minWidth: MIN_COLUMN_WIDTH, maxWidth: MAX_COLUMN_WIDTH },
  footnoteLabel: { minWidth: 24 },
});
